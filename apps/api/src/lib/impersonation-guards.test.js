import { describe, it, expect, vi } from 'vitest'

vi.mock('./impersonation.js', () => ({
  getEffectiveTenant: vi.fn(),
}))

vi.mock('./audit.js', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}))

const {
  rejectImpersonationMutation,
  assertImpersonationAllowsMutation,
  isImpersonationWriteAllowlisted,
  IMPERSONATION_RESTRICTED_ACTIONS,
} = await import('./impersonation-guards.js')
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

describe('assertImpersonationAllowsMutation', () => {
  it('allows GET while impersonating', async () => {
    getEffectiveTenant.mockReturnValue({
      tenantId: 't1',
      tenantType: 'RESTAURANT',
      tenantName: 'T',
    })
    const req = { method: 'GET', path: '/api/orders', userData: { id: 'a' }, requestId: 'r1' }
    const res = mockRes()
    expect(await assertImpersonationAllowsMutation(req, res)).toBe(false)
    expect(res.status).not.toHaveBeenCalled()
  })

  it('blocks POST orders while impersonating', async () => {
    getEffectiveTenant.mockReturnValue({
      tenantId: 't1',
      tenantType: 'RESTAURANT',
      tenantName: 'T',
    })
    const req = {
      method: 'POST',
      path: '/api/orders',
      originalUrl: '/api/orders',
      impersonationContext: { sessionId: 's1' },
      userData: { id: 'a' },
      requestId: 'r1',
    }
    const res = mockRes()
    expect(await assertImpersonationAllowsMutation(req, res)).toBe(true)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json.mock.calls[0][0].error.actionType).toBe('mutation')
  })

  it('allows stop impersonation POST', async () => {
    getEffectiveTenant.mockReturnValue({
      tenantId: 't1',
      tenantType: 'RESTAURANT',
      tenantName: 'T',
    })
    const req = {
      method: 'POST',
      originalUrl: '/api/admin-dashboard/impersonate/stop',
      path: '/impersonate/stop',
      userData: { id: 'a' },
      requestId: 'r1',
    }
    const res = mockRes()
    expect(await assertImpersonationAllowsMutation(req, res)).toBe(false)
  })
})

describe('isImpersonationWriteAllowlisted', () => {
  it('allows stop and logout paths', () => {
    expect(isImpersonationWriteAllowlisted('/api/admin-dashboard/impersonate/stop')).toBe(true)
    expect(isImpersonationWriteAllowlisted('/auth/logout')).toBe(true)
    expect(isImpersonationWriteAllowlisted('/api/orders')).toBe(false)
  })
})
