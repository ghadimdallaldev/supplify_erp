import { beforeEach, describe, expect, it, vi } from 'vitest'

const getRequestTenant = vi.fn()
const getBillingStatus = vi.fn()
const buildAccountLockedError = vi.fn()
const isImpersonating = vi.fn()

vi.mock('../lib/rbac.js', () => ({
  getRequestTenant,
}))

vi.mock('../lib/billing/billing-service.js', () => ({
  getBillingStatus,
  buildAccountLockedError,
}))

vi.mock('../lib/impersonation.js', () => ({
  isImpersonating,
}))

vi.mock('../lib/logger.js', () => ({
  logger: { error: vi.fn() },
}))

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      return this
    },
  }
  return res
}

describe('billingAccessMiddleware', () => {
  let middleware

  beforeEach(async () => {
    vi.clearAllMocks()
    isImpersonating.mockReturnValue(false)
    buildAccountLockedError.mockReturnValue({
      name: 'ACCOUNT_LOCKED',
      message: 'locked',
      details: { pendingActivation: true },
    })
    const mod = await import('./billingAccess.js')
    middleware = mod.billingAccessMiddleware
  })

  it('allows OPTIONS preflight', async () => {
    const next = vi.fn()
    const req = { method: 'OPTIONS', path: '/api/orders' }
    await middleware(req, mockRes(), next)
    expect(next).toHaveBeenCalled()
  })

  it('allows billing API when locked', async () => {
    const next = vi.fn()
    const req = { method: 'POST', path: '/api/billing/checkout', userData: { role: 'RESTAURANT' } }
    await middleware(req, mockRes(), next)
    expect(next).toHaveBeenCalled()
    expect(getBillingStatus).not.toHaveBeenCalled()
  })

  it('allows register API when locked', async () => {
    const next = vi.fn()
    const req = { method: 'POST', path: '/api/register/complete', userData: { role: 'PENDING' } }
    await middleware(req, mockRes(), next)
    expect(next).toHaveBeenCalled()
  })

  it('allows entitlements GET when locked', async () => {
    const next = vi.fn()
    const req = {
      method: 'GET',
      path: '/api/subscriptions/entitlements',
      userData: { role: 'RESTAURANT' },
    }
    await middleware(req, mockRes(), next)
    expect(next).toHaveBeenCalled()
  })

  it('skips check for admin users not impersonating', async () => {
    const next = vi.fn()
    const req = { method: 'GET', path: '/api/orders', userData: { role: 'ADMIN' } }
    await middleware(req, mockRes(), next)
    expect(next).toHaveBeenCalled()
    expect(getBillingStatus).not.toHaveBeenCalled()
    expect(isImpersonating).toHaveBeenCalledWith(req)
  })

  it('enforces billing lock when admin is impersonating a locked tenant', async () => {
    isImpersonating.mockReturnValue(true)
    getRequestTenant.mockResolvedValue({ tenantId: 't1', tenantType: 'RESTAURANT' })
    getBillingStatus.mockResolvedValue({
      access: { isLocked: true, pendingActivation: true },
      amountDue: 0,
    })
    const next = vi.fn()
    const res = mockRes()
    const req = {
      method: 'POST',
      path: '/api/orders',
      userData: { role: 'ADMIN', id: 'admin-1' },
      impersonationContext: { adminUserId: 'admin-1', tenantId: 't1', tenantType: 'RESTAURANT' },
      requestId: 'req-impersonate',
    }
    await middleware(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(402)
    expect(getBillingStatus).toHaveBeenCalledWith('t1', 'RESTAURANT')
  })

  it('returns 402 when tenant billing access is locked (non-trial)', async () => {
    getRequestTenant.mockResolvedValue({ tenantId: 't1', tenantType: 'RESTAURANT' })
    getBillingStatus.mockResolvedValue({
      access: { isLocked: true, pendingActivation: true },
      amountDue: 0,
    })
    const next = vi.fn()
    const res = mockRes()
    const req = {
      method: 'GET',
      path: '/api/orders',
      userData: { role: 'RESTAURANT' },
      requestId: 'req-1',
    }
    await middleware(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(402)
    expect(res.body.error.name).toBe('ACCOUNT_LOCKED')
  })

  it('allows GET when locked for expired Free Trial', async () => {
    getRequestTenant.mockResolvedValue({ tenantId: 't1', tenantType: 'RESTAURANT' })
    getBillingStatus.mockResolvedValue({
      access: {
        isLocked: true,
        freeSandboxExpired: true,
        lockReason: 'free_sandbox_expired',
      },
      amountDue: 0,
    })
    const next = vi.fn()
    const req = {
      method: 'GET',
      path: '/api/orders',
      userData: { role: 'RESTAURANT' },
      requestId: 'req-trial-get',
    }
    await middleware(req, mockRes(), next)
    expect(next).toHaveBeenCalled()
  })

  it('returns 402 on POST when locked for expired Free Trial', async () => {
    getRequestTenant.mockResolvedValue({ tenantId: 't1', tenantType: 'RESTAURANT' })
    getBillingStatus.mockResolvedValue({
      access: {
        isLocked: true,
        freeSandboxExpired: true,
        lockReason: 'free_sandbox_expired',
      },
      amountDue: 0,
    })
    const next = vi.fn()
    const res = mockRes()
    const req = {
      method: 'POST',
      path: '/api/orders',
      userData: { role: 'RESTAURANT' },
      requestId: 'req-trial-post',
    }
    await middleware(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(402)
  })

  it('allows subscriptions/plans GET when locked (non-trial)', async () => {
    getRequestTenant.mockResolvedValue({ tenantId: 't1', tenantType: 'RESTAURANT' })
    getBillingStatus.mockResolvedValue({
      access: { isLocked: true, pendingActivation: true },
      amountDue: 0,
    })
    const next = vi.fn()
    const req = {
      method: 'GET',
      path: '/api/subscriptions/plans',
      userData: { role: 'RESTAURANT' },
    }
    await middleware(req, mockRes(), next)
    expect(next).toHaveBeenCalled()
    expect(getBillingStatus).not.toHaveBeenCalled()
  })

  it('blocks PATCH when locked for overdue payment', async () => {
    getRequestTenant.mockResolvedValue({ tenantId: 't1', tenantType: 'SUPPLIER' })
    getBillingStatus.mockResolvedValue({
      access: { isLocked: true, lockReason: 'payment_overdue', pendingActivation: false },
      amountDue: 99,
    })
    const next = vi.fn()
    const res = mockRes()
    const req = {
      method: 'PATCH',
      path: '/api/products/abc',
      userData: { role: 'SUPPLIER' },
      requestId: 'req-overdue',
    }
    await middleware(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(402)
  })

  it('returns 503 when billing check throws', async () => {
    getRequestTenant.mockResolvedValue({ tenantId: 't1', tenantType: 'RESTAURANT' })
    getBillingStatus.mockRejectedValue(new Error('db down'))
    const next = vi.fn()
    const res = mockRes()
    const req = {
      method: 'GET',
      path: '/api/orders',
      userData: { role: 'RESTAURANT' },
      requestId: 'req-billing-err',
    }
    await middleware(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(503)
    expect(res.body?.error?.name).toBe('BILLING_CHECK_UNAVAILABLE')
  })

  it('calls next when tenant is not locked', async () => {
    getRequestTenant.mockResolvedValue({ tenantId: 't1', tenantType: 'RESTAURANT' })
    getBillingStatus.mockResolvedValue({
      access: { isLocked: false },
      amountDue: 0,
    })
    const next = vi.fn()
    const req = {
      method: 'GET',
      path: '/api/orders',
      userData: { role: 'RESTAURANT' },
      requestId: 'req-2',
    }
    await middleware(req, mockRes(), next)
    expect(next).toHaveBeenCalled()
  })
})
