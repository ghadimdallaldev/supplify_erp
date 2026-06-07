import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./cache.js', () => ({
  getCache: vi.fn().mockResolvedValue(null),
  setCache: vi.fn().mockResolvedValue(undefined),
  deleteCache: vi.fn().mockResolvedValue(undefined),
}))

const queryMock = vi.fn()

vi.mock('./db.js', () => ({
  query: (...args) => queryMock(...args),
}))

const getOrgRolePermissionsMock = vi.fn()

vi.mock('./supplier-org.js', () => ({
  getOrgRolePermissions: (...args) => getOrgRolePermissionsMock(...args),
}))

vi.mock('./restaurant-org.js', () => ({
  getRestaurantOrgRolePermissions: vi.fn().mockResolvedValue([]),
}))

/** No restaurant org on tenant (keeps legacy mock order for branch permission queries). */
function mockNoRestaurantOrg() {
  return { rows: [{ organization_id: null }] }
}

import {
  getPermissionsForUser,
  invalidateUserPermissionCache,
  permissionCacheKey,
  hasPermission,
  getPermissionsForTenantRole,
} from './permissions.js'
import { getCache, setCache, deleteCache } from './cache.js'
import { resetSingleflightForTests } from './singleflight.js'

describe('permissions resolution', () => {
  beforeEach(() => {
    resetSingleflightForTests()
    queryMock.mockReset()
    getOrgRolePermissionsMock.mockReset()
    vi.mocked(getCache).mockResolvedValue(null)
    vi.mocked(setCache).mockClear()
    vi.mocked(deleteCache).mockClear()
  })

  it('resolves permissions from tenant role', async () => {
    queryMock
      .mockResolvedValueOnce(mockNoRestaurantOrg())
      .mockResolvedValueOnce({
        rows: [{ permission: 'ORDERS_VIEW' }, { permission: 'ORDERS_CREATE' }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })

    const perms = await getPermissionsForUser('u1', 't1', 'RESTAURANT')
    expect(perms).toContain('ORDERS_VIEW')
    expect(perms).toContain('ORDERS_CREATE')
    expect(setCache).toHaveBeenCalled()
  })

  it('merges legacy permissions when no tenant_user_roles assignment', async () => {
    queryMock
      .mockResolvedValueOnce(mockNoRestaurantOrg())
      .mockResolvedValueOnce({ rows: [{ permission: 'ORDERS_VIEW' }] })
      .mockResolvedValueOnce({ rows: [{ code: 'SETTINGS_VIEW' }] })
      .mockResolvedValueOnce({ rows: [] })

    const perms = await getPermissionsForUser('u1', 't1', 'RESTAURANT')
    expect(perms).toContain('ORDERS_VIEW')
    expect(perms).toContain('SETTINGS_VIEW')
  })

  it('does not merge legacy permissions when tenant_user_roles assignment exists', async () => {
    queryMock
      .mockResolvedValueOnce(mockNoRestaurantOrg())
      .mockResolvedValueOnce({ rows: [{ permission: 'ORDERS_VIEW' }] })
      .mockResolvedValueOnce({ rows: [{ code: 'SETTINGS_VIEW' }, { code: 'ORDERS_CREATE' }] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })

    const perms = await getPermissionsForUser('u1', 't1', 'RESTAURANT')
    expect(perms).toEqual(['ORDERS_VIEW'])
  })

  it('merges restaurant org and branch permissions when user has org role', async () => {
    const { getRestaurantOrgRolePermissions } = await import('./restaurant-org.js')
    vi.mocked(getRestaurantOrgRolePermissions).mockResolvedValueOnce([
      'ORDERS_VIEW',
      'RESERVATIONS_VIEW',
    ])
    queryMock.mockImplementation((sql) => {
      if (sql.includes('organization_id FROM restaurant')) {
        return Promise.resolve({ rows: [{ organization_id: 'org-1' }] })
      }
      if (sql.includes('restaurant_org_user_roles')) {
        return Promise.resolve({ rows: [{ '?column?': 1 }] })
      }
      if (sql.includes('tenant_role_permissions')) {
        return Promise.resolve({ rows: [{ permission: 'SETTINGS_VIEW' }] })
      }
      if (sql.includes('FROM user_role ur')) {
        return Promise.resolve({ rows: [] })
      }
      if (sql.includes('FROM tenant_user_roles WHERE')) {
        return Promise.resolve({ rows: [{ '?column?': 1 }] })
      }
      return Promise.resolve({ rows: [] })
    })

    const perms = await getPermissionsForUser('u1', 'rest-1', 'RESTAURANT')
    expect(perms).toContain('ORDERS_VIEW')
    expect(perms).toContain('RESERVATIONS_VIEW')
    expect(perms).toContain('SETTINGS_VIEW')
  })

  it('uses cache when present', async () => {
    vi.mocked(getCache).mockResolvedValue(['INVOICES_VIEW'])
    const perms = await getPermissionsForUser('u1', 't1', 'RESTAURANT')
    expect(perms).toEqual(['INVOICES_VIEW'])
    expect(queryMock).not.toHaveBeenCalled()
  })

  it('invalidates permission cache key', async () => {
    await invalidateUserPermissionCache('u1', 't1', 'RESTAURANT')
    expect(deleteCache).toHaveBeenCalledWith(permissionCacheKey('u1', 't1', 'RESTAURANT'))
    expect(deleteCache).toHaveBeenCalledWith('tctx:u1:t1:RESTAURANT')
  })

  it('hasPermission treats MANAGE as superset', () => {
    expect(hasPermission(['ORDERS_MANAGE'], 'ORDERS_VIEW')).toBe(true)
    expect(hasPermission(['ORDERS_VIEW'], 'ORDERS_MANAGE')).toBe(false)
  })

  it('merges org and branch permissions for supplier users', async () => {
    getOrgRolePermissionsMock.mockResolvedValue(['ORDERS_VIEW', 'CATALOG_VIEW'])
    queryMock.mockImplementation((sql) => {
      if (sql.includes('organization_id FROM supplier')) {
        return Promise.resolve({ rows: [{ organization_id: 'org-1' }] })
      }
      if (sql.includes('org_user_roles')) {
        return Promise.resolve({ rows: [{ '?column?': 1 }] })
      }
      if (sql.includes('tenant_role_permissions')) {
        return Promise.resolve({ rows: [{ permission: 'INVENTORY_VIEW' }] })
      }
      if (sql.includes('FROM user_role ur')) {
        return Promise.resolve({ rows: [] })
      }
      if (sql.includes('FROM tenant_user_roles WHERE')) {
        return Promise.resolve({ rows: [] })
      }
      return Promise.resolve({ rows: [] })
    })

    const perms = await getPermissionsForUser('u1', 'supplier-1', 'SUPPLIER')
    expect(perms).toContain('ORDERS_VIEW')
    expect(perms).toContain('CATALOG_VIEW')
    expect(perms).toContain('INVENTORY_VIEW')
  })

  it('denies supplier access when no org or branch roles', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ organization_id: 'org-1' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })

    const perms = await getPermissionsForUser('u1', 'supplier-1', 'SUPPLIER')
    expect(perms).toEqual([])
  })
})

describe('getPermissionsForTenantRole', () => {
  beforeEach(() => queryMock.mockReset())

  it('loads permissions for role id', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ permission: 'STAFF_VIEW' }],
    })
    const perms = await getPermissionsForTenantRole('role-1')
    expect(perms).toEqual(['STAFF_VIEW'])
  })
})
