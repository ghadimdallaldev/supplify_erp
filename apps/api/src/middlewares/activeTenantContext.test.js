import { describe, it, expect, vi, beforeEach } from 'vitest'
import { activeTenantContext } from './activeTenantContext.js'

vi.mock('../lib/tenant-switch.js', () => ({
  getActiveTenantCookieName: () => 'active_tenant_token',
  verifyActiveTenantToken: vi.fn(),
}))

describe('activeTenantContext', () => {
  let req, res, next

  beforeEach(async () => {
    vi.clearAllMocks()
    req = { cookies: {}, headers: {} }
    res = { clearCookie: vi.fn() }
    next = vi.fn()
  })

  it('reads active tenant from X-Active-Tenant-Token header', async () => {
    const { verifyActiveTenantToken } = await import('../lib/tenant-switch.js')
    verifyActiveTenantToken.mockResolvedValueOnce({
      userId: 'user-1',
      tenantId: 'branch-1',
      tenantType: 'RESTAURANT',
      tenantName: 'Branch One',
    })

    req.headers['x-active-tenant-token'] = 'signed-tenant-jwt'

    await activeTenantContext(req, res, next)

    expect(verifyActiveTenantToken).toHaveBeenCalledWith('signed-tenant-jwt')
    expect(req.activeTenantContext.tenantId).toBe('branch-1')
    expect(next).toHaveBeenCalled()
  })

  it('prefers header over cookie when both present', async () => {
    const { verifyActiveTenantToken } = await import('../lib/tenant-switch.js')
    verifyActiveTenantToken.mockResolvedValueOnce({
      userId: 'user-1',
      tenantId: 'header-branch',
      tenantType: 'SUPPLIER',
      tenantName: 'Header Branch',
    })

    req.headers['x-active-tenant-token'] = 'header-token'
    req.cookies.active_tenant_token = 'cookie-token'

    await activeTenantContext(req, res, next)

    expect(verifyActiveTenantToken).toHaveBeenCalledWith('header-token')
    expect(req.activeTenantContext.tenantId).toBe('header-branch')
  })

  it('falls back to cookie when header absent', async () => {
    const { verifyActiveTenantToken } = await import('../lib/tenant-switch.js')
    verifyActiveTenantToken.mockResolvedValueOnce({
      userId: 'user-1',
      tenantId: 'cookie-branch',
      tenantType: 'RESTAURANT',
      tenantName: 'Cookie Branch',
    })

    req.cookies.active_tenant_token = 'cookie-token'

    await activeTenantContext(req, res, next)

    expect(verifyActiveTenantToken).toHaveBeenCalledWith('cookie-token')
  })
})
