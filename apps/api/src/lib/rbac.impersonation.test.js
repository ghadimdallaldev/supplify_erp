import { describe, it, expect, vi } from 'vitest'

vi.mock('./impersonation.js', () => ({
  getEffectiveTenant: vi.fn(),
  impersonationCanAccessBranch: vi.fn(),
}))

vi.mock('./tenant-switch.js', () => ({
  getActiveTenantFromRequest: vi.fn().mockResolvedValue(null),
  getPrimaryTenantForUser: vi.fn(),
  userCanAccessTenant: vi.fn(),
}))

vi.mock('./workspace-tenant.js', () => ({
  getTenantAssignmentForUser: vi.fn(),
  isPrimaryTenantContact: vi.fn(),
}))

vi.mock('./permissions.js', () => ({
  getRolesForUser: vi.fn(),
  getPermissionsForUser: vi.fn(),
  hasPermission: vi.fn(),
  invalidateUserPermissionCache: vi.fn(),
}))

vi.mock('./db.js', () => ({ query: vi.fn() }))

const { requireRole } = await import('./rbac.js')
const { getEffectiveTenant } = await import('./impersonation.js')

function mockRes() {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
  return res
}

describe('requireRole with impersonation', () => {
  it('allows ADMIN impersonating RESTAURANT on restaurant-only route', () => {
    getEffectiveTenant.mockReturnValue({
      tenantId: 'r1',
      tenantType: 'RESTAURANT',
      tenantName: 'R',
    })
    const req = { userData: { id: 'a1', role: 'ADMIN' }, requestId: 'req-1' }
    const res = mockRes()
    const next = vi.fn()

    requireRole(['RESTAURANT'])(req, res, next)

    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('denies ADMIN without impersonation on restaurant-only route', () => {
    getEffectiveTenant.mockReturnValue(null)
    const req = { userData: { id: 'a1', role: 'ADMIN' }, requestId: 'req-1' }
    const res = mockRes()
    const next = vi.fn()

    requireRole(['RESTAURANT'])(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
  })
})
