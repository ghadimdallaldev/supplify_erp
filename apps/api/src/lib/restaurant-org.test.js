import { beforeEach, describe, expect, it, vi } from 'vitest'

const query = vi.fn()

vi.mock('./db.js', () => ({
  query: (...args) => query(...args),
  withTransaction: async (fn) => fn({ query: (...args) => query(...args) }),
}))

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('./register-account.js', () => ({
  slugifyName: (value) => String(value || 'org'),
}))

vi.mock('./tenant-roles.js', () => ({
  ensureTenantSystemRoles: vi.fn(),
  assignOwnerRoleForUser: vi.fn(),
  getOwnerRoleId: vi.fn(),
  getAllPermissionsForTenantType: vi.fn(),
}))

vi.mock('./billing/subscription-activation.js', () => ({
  createOrgCoveredBranchSubscription: vi.fn(),
}))

vi.mock('./org-role-permissions.js', () => ({
  orgRolePermissionsUnchanged: vi.fn(),
  replaceOrgRolePermissions: vi.fn(),
}))

vi.mock('./role-matrix.js', () => ({
  RESTAURANT_VIEWER: [],
}))

function membershipRow() {
  return { organization_id: 'org-1', role_name: 'Org Owner' }
}

describe('userHasRestaurantOrgBranchAccess', () => {
  beforeEach(() => {
    query.mockReset()
  })

  it('denies Org Owner access to a restaurant outside the organization', async () => {
    const { userHasRestaurantOrgBranchAccess } = await import('./restaurant-org.js')
    query.mockImplementation(async (sql) => {
      const text = String(sql)
      if (
        text.includes('FROM restaurant_org_user_roles rour') &&
        text.includes('restaurant_organizations')
      ) {
        return { rows: [membershipRow()] }
      }
      if (text.includes('FROM restaurant WHERE id = $1 AND organization_id = $2')) {
        return { rows: [] }
      }
      if (text.includes('FROM restaurant_org_user_roles rour') && text.includes('branch_scope')) {
        return { rows: [{ branch_scope: 'all', name: 'Org Owner' }] }
      }
      return { rows: [] }
    })

    const allowed = await userHasRestaurantOrgBranchAccess('u1', 'foreign-restaurant', 'org-1')
    expect(allowed).toBe(false)
  })

  it('allows Org Owner access to a restaurant in the same organization', async () => {
    const { userHasRestaurantOrgBranchAccess } = await import('./restaurant-org.js')
    query.mockImplementation(async (sql) => {
      const text = String(sql)
      if (
        text.includes('FROM restaurant_org_user_roles rour') &&
        text.includes('restaurant_organizations')
      ) {
        return { rows: [membershipRow()] }
      }
      if (text.includes('FROM restaurant WHERE id = $1 AND organization_id = $2')) {
        return { rows: [{ exists: 1 }] }
      }
      if (text.includes('branch_scope')) {
        return { rows: [{ branch_scope: 'all', name: 'Org Owner' }] }
      }
      return { rows: [] }
    })

    const allowed = await userHasRestaurantOrgBranchAccess('u1', 'restaurant-2', 'org-1')
    expect(allowed).toBe(true)
  })
})

describe('grantRestaurantOrgBranchAccess', () => {
  beforeEach(() => {
    query.mockReset()
  })

  it('does not insert access for a restaurant outside the organization', async () => {
    const { grantRestaurantOrgBranchAccess } = await import('./restaurant-org.js')
    query.mockResolvedValueOnce({ rows: [] })
    await expect(
      grantRestaurantOrgBranchAccess({
        userId: 'u2',
        restaurantId: 'foreign-restaurant',
        organizationId: 'org-1',
      })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO restaurant_org_user_branch_access')
      )
    ).toBe(false)
  })
})

describe('revokeRestaurantOrgBranchAccess', () => {
  beforeEach(() => {
    query.mockReset()
  })

  it('does not delete access for a restaurant outside the organization', async () => {
    const { revokeRestaurantOrgBranchAccess } = await import('./restaurant-org.js')
    query.mockResolvedValueOnce({ rows: [] })
    await expect(
      revokeRestaurantOrgBranchAccess('u2', 'foreign-restaurant', 'org-1')
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('DELETE FROM restaurant_org_user_branch_access')
      )
    ).toBe(false)
  })
})

describe('unlinkRestaurantFromOrganization', () => {
  beforeEach(() => {
    query.mockReset()
  })

  it('does not unlink a restaurant that belongs to another organization', async () => {
    const { unlinkRestaurantFromOrganization } = await import('./restaurant-org.js')
    query.mockResolvedValueOnce({
      rows: [{ is_main_branch: false, organization_id: 'org-other' }],
    })
    const result = await unlinkRestaurantFromOrganization('foreign-restaurant', {
      organizationId: 'org-1',
    })
    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' })
    expect(query.mock.calls.some(([sql]) => String(sql).includes('UPDATE restaurant'))).toBe(false)
  })
})
