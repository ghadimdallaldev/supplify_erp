import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQuery = vi.fn()
const invalidateUserBySubCache = vi.fn()
const invalidateRequestTenantCache = vi.fn()
const invalidateUserPermissionCache = vi.fn()
const invalidateWorkspaceAssignmentCache = vi.fn()
const invalidateTenantSubscriptionCache = vi.fn()

vi.mock('./db.js', () => ({
  query: (...args) => mockQuery(...args),
}))

vi.mock('./rbac.js', () => ({
  invalidateUserBySubCache: (...args) => invalidateUserBySubCache(...args),
  invalidateRequestTenantCache: (...args) => invalidateRequestTenantCache(...args),
}))

vi.mock('./permissions.js', () => ({
  invalidateUserPermissionCache: (...args) => invalidateUserPermissionCache(...args),
}))

vi.mock('./workspace-tenant.js', () => ({
  invalidateWorkspaceAssignmentCache: (...args) => invalidateWorkspaceAssignmentCache(...args),
}))

vi.mock('./subscription.js', () => ({
  invalidateTenantSubscriptionCache: (...args) => invalidateTenantSubscriptionCache(...args),
}))

describe('access-cache', () => {
  beforeEach(() => {
    mockQuery.mockReset()
    invalidateUserBySubCache.mockReset()
    invalidateRequestTenantCache.mockReset()
    invalidateUserPermissionCache.mockReset()
    invalidateWorkspaceAssignmentCache.mockReset()
    invalidateTenantSubscriptionCache.mockReset()
    invalidateUserBySubCache.mockResolvedValue(undefined)
    invalidateRequestTenantCache.mockResolvedValue(undefined)
    invalidateUserPermissionCache.mockResolvedValue(undefined)
    invalidateWorkspaceAssignmentCache.mockResolvedValue(undefined)
    invalidateTenantSubscriptionCache.mockResolvedValue(undefined)
  })

  it('invalidates user, tenant, and billing caches together', async () => {
    const { invalidateUserAuthCaches } = await import('./access-cache.js')

    await invalidateUserAuthCaches({
      userId: 'u1',
      keycloakSub: 'kc-1',
      tenantId: 't1',
      tenantType: 'RESTAURANT',
    })

    expect(invalidateUserBySubCache).toHaveBeenCalledWith('kc-1')
    expect(invalidateUserPermissionCache).toHaveBeenCalledWith('u1', 't1', 'RESTAURANT')
    expect(invalidateWorkspaceAssignmentCache).toHaveBeenCalledWith('u1', 'RESTAURANT')
    expect(invalidateRequestTenantCache).toHaveBeenCalledWith('u1', 'RESTAURANT')
    expect(invalidateTenantSubscriptionCache).toHaveBeenCalledWith('t1', 'RESTAURANT')
  })

  it('loads keycloak sub when only userId is provided', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ keycloak_sub: 'kc-lookup' }] })
    const { invalidateUserAuthCaches } = await import('./access-cache.js')

    await invalidateUserAuthCaches({ userId: 'u2' })

    expect(invalidateUserBySubCache).toHaveBeenCalledWith('kc-lookup')
  })
})
