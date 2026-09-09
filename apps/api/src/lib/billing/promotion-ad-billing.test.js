import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../db.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(async (fn) => {
    const client = { query: vi.fn() }
    return fn(client)
  }),
}))

vi.mock('./gateway-registry.js', () => ({
  getBillingGateway: vi.fn(() => ({
    id: 'stub',
    charge: vi.fn(async () => ({
      status: 'succeeded',
      providerPaymentId: 'pay_test_1',
    })),
    refund: vi.fn(async () => ({
      status: 'succeeded',
      providerRefundId: 're_test_1',
    })),
  })),
}))

vi.mock('./billing-service.js', () => ({
  getSubscriptionForBilling: vi.fn(async () => ({
    id: 'sup-sub-1',
    plan_id: 'plan-sup',
    status: 'ACTIVE',
  })),
}))

vi.mock('../../config/env.js', () => ({
  config: {
    NODE_ENV: 'test',
    PAYMENTS_MODE: 'mock',
    APP_ENV: 'dev',
  },
}))

describe('isPromotionAdPaymentWaived', () => {
  beforeEach(() => {
    vi.resetModules()
    delete process.env.ALLOW_WAIVE_DEAL_PROMOTION_PAYMENT
  })

  it('never waives when PAYMENTS_MODE=live', async () => {
    vi.doMock('../../config/env.js', () => ({
      config: { NODE_ENV: 'development', PAYMENTS_MODE: 'live', APP_ENV: 'dev' },
    }))
    const { isPromotionAdPaymentWaived } = await import('./promotion-ad-billing.js')
    expect(isPromotionAdPaymentWaived()).toBe(false)
  })

  it('waives in non-production non-live by default', async () => {
    vi.doMock('../../config/env.js', () => ({
      config: { NODE_ENV: 'test', PAYMENTS_MODE: 'mock', APP_ENV: 'dev' },
    }))
    const { isPromotionAdPaymentWaived } = await import('./promotion-ad-billing.js')
    expect(isPromotionAdPaymentWaived()).toBe(true)
  })
})

describe('createDealBoostInvoice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates OPEN invoice with deal_boost metadata', async () => {
    const { withTransaction } = await import('../db.js')
    const clientQuery = vi.fn()
    clientQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'inv-1',
          status: 'OPEN',
          amount: 39,
          metadata: { type: 'deal_boost' },
        },
      ],
    })
    clientQuery.mockResolvedValueOnce({ rows: [] })
    clientQuery.mockResolvedValueOnce({ rows: [] })
    withTransaction.mockImplementationOnce(async (fn) => fn({ query: clientQuery }))

    const { createDealBoostInvoice } = await import('./promotion-ad-billing.js')
    const result = await createDealBoostInvoice({
      deal: {
        id: 'deal-1',
        supplier_id: 'sup-1',
        boost_price_snapshot: 39,
        boost_pricing_key: 'boost_weekly',
        boost_duration_days: 7,
        billing_invoice_id: null,
      },
    })

    expect(result.created).toBe(true)
    expect(result.invoice.id).toBe('inv-1')
    const insertCall = clientQuery.mock.calls.find((c) =>
      String(c[0]).includes('INSERT INTO billing_invoice')
    )
    expect(insertCall).toBeTruthy()
    expect(JSON.stringify(insertCall[1])).toContain('deal_boost')
  })
})

describe('chargePromotionAdInvoice', () => {
  it('marks invoice PAID and links billing_payment.invoice_id', async () => {
    const { getBillingGateway } = await import('./gateway-registry.js')
    getBillingGateway.mockReturnValue({
      id: 'stub',
      charge: vi.fn(async () => ({
        status: 'succeeded',
        providerPaymentId: 'pi_ok',
      })),
    })

    const { withTransaction } = await import('../db.js')
    const clientQuery = vi.fn()
    clientQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'inv-1',
            status: 'OPEN',
            amount: 39,
            currency: 'USD',
            tenant_id: 'sup-1',
            metadata: { type: 'deal_boost', promotionId: 'deal-1' },
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'pm-1',
            provider: 'stub',
            provider_payment_method_id: 'pm_stub',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'pay-1', status: 'PROCESSING' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: 'inv-1', status: 'PAID', amount: 39 }],
      })

    withTransaction.mockImplementationOnce(async (fn) => fn({ query: clientQuery }))

    const { chargePromotionAdInvoice } = await import('./promotion-ad-billing.js')
    const result = await chargePromotionAdInvoice({
      invoiceId: 'inv-1',
      supplierId: 'sup-1',
      idempotencyKey: 'deal-boost:deal-1:39',
      expectedType: 'deal_boost',
    })

    expect(result.success).toBe(true)
    const paymentInsert = clientQuery.mock.calls.find((c) =>
      String(c[0]).includes('INSERT INTO billing_payment')
    )
    expect(paymentInsert[1][0]).toBe('inv-1')
  })
})
