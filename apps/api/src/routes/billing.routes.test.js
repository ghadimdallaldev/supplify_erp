import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getBillingStatus = vi.fn()
const listPaymentMethods = vi.fn()
const setAutoRenew = vi.fn()
const listBillingGateways = vi.fn()
const checkoutSubscription = vi.fn()

vi.mock('../lib/rbac.js', () => ({
  requireAuth: (req, res, next) => {
    req.userData = { id: 'user-1', role: 'RESTAURANT', email: 'r@test.com' }
    next()
  },
  resolveTenantContext: (req, res, next) => next(),
  requireRole: () => (req, res, next) => next(),
  getRequestTenant: vi.fn().mockResolvedValue({
    tenantId: 'rest-1',
    tenantType: 'RESTAURANT',
  }),
}))

vi.mock('../lib/billing/billing-service.js', () => ({
  getBillingStatus,
  listPaymentMethods,
  addPaymentMethod: vi.fn(),
  removePaymentMethod: vi.fn(),
  checkoutSubscription,
  payOpenInvoices: vi.fn(),
  setAutoRenew,
}))

vi.mock('../lib/billing/gateway-registry.js', () => ({
  listBillingGateways,
}))

vi.mock('../lib/audit.js', () => ({
  writeAuditLog: vi.fn(),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}))

describe('billing.routes', () => {
  let app

  beforeEach(async () => {
    getBillingStatus.mockReset()
    listPaymentMethods.mockReset()
    setAutoRenew.mockReset()
    checkoutSubscription.mockReset()
    listBillingGateways.mockReturnValue(['stub', 'manual'])

    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test-req'
      next()
    })
    const { billingRoutes } = await import('./billing.routes.js')
    app.use('/api/billing', billingRoutes)
  })

  it('GET /status returns billing status and gateways', async () => {
    getBillingStatus.mockResolvedValue({
      subscription: { id: 'sub-1', planCode: 'free', status: 'ACTIVE' },
      access: { isLocked: true, pendingActivation: true },
      amountDue: 0,
      paymentMethods: [],
      openInvoices: [],
    })

    const res = await request(app).get('/api/billing/status').expect(200)

    expect(res.body.ok).toBe(true)
    expect(res.body.data.access.pendingActivation).toBe(true)
    expect(res.body.data.gateways).toEqual(['stub', 'manual'])
  })

  it('GET /payment-methods returns methods list', async () => {
    listPaymentMethods.mockResolvedValue([{ id: 'pm-1', last4: '4242', is_default: true }])

    const res = await request(app).get('/api/billing/payment-methods').expect(200)

    expect(res.body.data.paymentMethods).toHaveLength(1)
    expect(res.body.data.paymentMethods[0].last4).toBe('4242')
  })

  it('PATCH /auto-renew updates preference', async () => {
    setAutoRenew.mockResolvedValue({ autoRenew: false })

    const res = await request(app)
      .patch('/api/billing/auto-renew')
      .send({ autoRenew: false })
      .expect(200)

    expect(res.body.data.autoRenew).toBe(false)
    expect(setAutoRenew).toHaveBeenCalledWith('rest-1', 'RESTAURANT', false)
  })

  it('POST /checkout completes free plan without payment method', async () => {
    checkoutSubscription.mockResolvedValue({
      success: true,
      plan: 'free',
      pendingActivation: false,
      activated: true,
    })

    const res = await request(app)
      .post('/api/billing/checkout')
      .send({
        planId: '00000000-0000-4000-8000-000000000099',
        billingCycle: 'MONTHLY',
        idempotencyKey: 'free-activate-test-key-01',
      })
      .expect(200)

    expect(res.body.data.success).toBe(true)
    expect(res.body.data.activated).toBe(true)
    expect(checkoutSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'rest-1',
        tenantType: 'RESTAURANT',
        planId: '00000000-0000-4000-8000-000000000099',
        billingCycle: 'MONTHLY',
        paymentMethodId: undefined,
      })
    )
  })
})
