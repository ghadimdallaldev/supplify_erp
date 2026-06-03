import { describe, it, expect, vi } from 'vitest'

vi.mock('./impersonation.js', () => ({
  getEffectiveTenant: vi.fn(),
}))

vi.mock('./audit.js', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}))

const { rejectImpersonationMutation, IMPERSONATION_RESTRICTED_ACTIONS } = await import(
  './impersonation-guards.js'
)
const { getEffectiveTenant } = await import('./impersonation.js')

function mockRes() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn() }
}

describe('rejectImpersonationMutation', () => {
  it('blocks when impersonating', async () => {
    getEffectiveTenant.mockReturnValue({
      tenantId: 't1',
      tenantType: 'RESTAURANT',
      tenantName: 'T',
    })
    const middleware = rejectImpersonationMutation(
      IMPERSONATION_RESTRICTED_ACTIONS.BILLING_MUTATION
    )
    const req = {
      method: 'POST',
      path: '/checkout',
      originalUrl: '/api/billing/checkout',
      impersonationContext: { sessionId: 's1' },
      userData: { id: 'admin-1' },
      requestId: 'r1',
    }
    const res = mockRes()
    const next = vi.fn()
    await middleware(req, res, next)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('passes through when not impersonating', async () => {
    getEffectiveTenant.mockReturnValue(null)
    const middleware = rejectImpersonationMutation(
      IMPERSONATION_RESTRICTED_ACTIONS.BILLING_MUTATION
    )
    const req = { method: 'POST', path: '/checkout', requestId: 'r1' }
    const res = mockRes()
    const next = vi.fn()
    await middleware(req, res, next)
    expect(next).toHaveBeenCalled()
  })
})
