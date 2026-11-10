import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./auth.js', () => ({
  verifyToken: vi.fn(),
  refreshAccessToken: vi.fn(),
  refreshAccessTokenSingleFlight: vi.fn(),
}))

vi.mock('./rbac.js', () => ({
  getUserBySub: vi.fn(),
}))

vi.mock('./workspace-tenant.js', () => ({
  getTenantAssignmentForUser: vi.fn(),
}))

vi.mock('./tenant-switch.js', () => ({
  getActiveTenantCookieName: () => 'active_tenant_token',
  verifyActiveTenantToken: vi.fn(),
  userCanAccessTenant: vi.fn(),
}))

import { verifyToken } from './auth.js'
import { getUserBySub } from './rbac.js'
import { getTenantAssignmentForUser } from './workspace-tenant.js'
import { userCanAccessTenant, verifyActiveTenantToken } from './tenant-switch.js'
import { resolveSocketUserFromCookieHeader } from './socket-auth.js'

const user = { id: 'user-1', email: 'Owner@Example.com', role: 'RESTAURANT' }

describe('resolveSocketUserFromCookieHeader tenant room resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(verifyToken).mockResolvedValue({ sub: 'sub-1' })
    vi.mocked(getUserBySub).mockResolvedValue(user)
  })

  it('does not return a tenant when the user has no membership in the assigned tenant', async () => {
    vi.mocked(getTenantAssignmentForUser).mockResolvedValue({
      tenantId: 'rest-9',
      tenantType: 'RESTAURANT',
    })
    vi.mocked(userCanAccessTenant).mockResolvedValue(false)

    const result = await resolveSocketUserFromCookieHeader('access_token=jwt')

    expect(result.tenantId).toBeNull()
    expect(userCanAccessTenant).toHaveBeenCalledWith('user-1', user.email, 'rest-9', 'RESTAURANT')
  })

  it('does not look the tenant up by contact_email', async () => {
    vi.mocked(getTenantAssignmentForUser).mockResolvedValue(null)

    const result = await resolveSocketUserFromCookieHeader('access_token=jwt')

    expect(result.tenantId).toBeNull()
    expect(userCanAccessTenant).not.toHaveBeenCalled()
  })

  it('returns the tenant when the assigned tenant passes the membership check', async () => {
    vi.mocked(getTenantAssignmentForUser).mockResolvedValue({
      tenantId: 'rest-1',
      tenantType: 'RESTAURANT',
    })
    vi.mocked(userCanAccessTenant).mockResolvedValue(true)

    const result = await resolveSocketUserFromCookieHeader('access_token=jwt')

    expect(result.tenantId).toBe('rest-1')
    expect(result.tenantType).toBe('RESTAURANT')
  })

  it('rejects an active-tenant cookie for a tenant the user cannot access', async () => {
    vi.mocked(verifyActiveTenantToken).mockResolvedValue({
      userId: 'user-1',
      tenantId: 'rest-victim',
      tenantType: 'RESTAURANT',
    })
    vi.mocked(userCanAccessTenant).mockResolvedValue(false)
    vi.mocked(getTenantAssignmentForUser).mockResolvedValue(null)

    const result = await resolveSocketUserFromCookieHeader(
      'access_token=jwt; active_tenant_token=signed'
    )

    expect(result.tenantId).toBeNull()
  })

  it('accepts an active-tenant cookie for a tenant the user can access', async () => {
    vi.mocked(verifyActiveTenantToken).mockResolvedValue({
      userId: 'user-1',
      tenantId: 'rest-2',
      tenantType: 'RESTAURANT',
    })
    vi.mocked(userCanAccessTenant).mockResolvedValue(true)

    const result = await resolveSocketUserFromCookieHeader(
      'access_token=jwt; active_tenant_token=signed'
    )

    expect(result.tenantId).toBe('rest-2')
    expect(result.tenantType).toBe('RESTAURANT')
  })
})
