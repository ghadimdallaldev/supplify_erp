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

describe('createFeaturedPlacementInvoice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates OPEN invoice with featured_placement metadata', async () => {
    const { withTransaction } = await import('../db.js')
    const clientQuery = vi.fn()
    clientQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'inv-fp-1',
          status: 'OPEN',
          amount: 99,
          metadata: { type: 'featured_placement' },
        },
      ],
    })
    clientQuery.mockResolvedValueOnce({ rows: [] })
    clientQuery.mockResolvedValueOnce({ rows: [] })
    withTransaction.mockImplementationOnce(async (fn) => fn({ query: clientQuery }))

    const { createFeaturedPlacementInvoice } = await import('./promotion-ad-billing.js')
    const result = await createFeaturedPlacementInvoice({
      placement: {
        id: 'fp-1',
        supplier_id: 'sup-1',
        amount_paid: 99,
        pricing_key: 'featured_weekly',
        currency: 'USD',
        billing_invoice_id: null,
        starts_at: null,
        ends_at: null,
      },
      pricing: { amount: 99, pricing_key: 'featured_weekly' },
    })

    expect(result.created).toBe(true)
    expect(result.invoice.id).toBe('inv-fp-1')
    const insertCall = clientQuery.mock.calls.find((c) =>
      String(c[0]).includes('INSERT INTO billing_invoice')
    )
    expect(insertCall).toBeTruthy()
    expect(JSON.stringify(insertCall[1])).toContain('featured_placement')
  })
})

describe('handlePromotionAdDisputeByProviderPaymentId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('pauses deal boost and marks invoice disputed on chargeback', async () => {
    const { withTransaction } = await import('../db.js')
    const clientQuery = vi.fn()
    clientQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'pay-1',
            invoice_id: 'inv-1',
            provider_payment_id: 'pi_dispute_1',
            status: 'SUCCEEDED',
            tenant_id: 'sup-1',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'inv-1',
            tenant_id: 'sup-1',
            metadata: { type: 'deal_boost', promotionId: 'deal-1' },
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: 'deal-1', status: 'paused', payment_status: 'disputed' }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })

    withTransaction.mockImplementationOnce(async (fn) => fn({ query: clientQuery }))

    const { handlePromotionAdDisputeByProviderPaymentId } = await import(
      './promotion-ad-billing.js'
    )
    const result = await handlePromotionAdDisputeByProviderPaymentId({
      providerPaymentId: 'pi_dispute_1',
      reason: 'chargeback',
      disputeId: 'dp_1',
    })

    expect(result.handled).toBe(true)
    expect(result.duplicate).toBe(false)
    expect(result.type).toBe('deal_boost')
    expect(result.pauseResult).toEqual(
      expect.objectContaining({ id: 'deal-1', status: 'paused', payment_status: 'disputed' })
    )
    const promoUpdate = clientQuery.mock.calls.find((c) =>
      String(c[0]).includes('UPDATE promotions SET')
    )
    expect(promoUpdate).toBeTruthy()
    const paymentUpdate = clientQuery.mock.calls.find((c) =>
      String(c[0]).includes("status = 'DISPUTED'")
    )
    expect(paymentUpdate).toBeTruthy()
  })

  it('cancels featured placement on dispute', async () => {
    const { withTransaction } = await import('../db.js')
    const clientQuery = vi.fn()
    clientQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'pay-2',
            invoice_id: 'inv-2',
            provider_payment_id: 'pi_dispute_2',
            status: 'SUCCEEDED',
            tenant_id: 'sup-1',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'inv-2',
            tenant_id: 'sup-1',
            metadata: { type: 'featured_placement', placementId: 'fp-1' },
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: 'fp-1', status: 'cancelled', payment_status: 'disputed' }],
      })
      .mockResolvedValueOnce({ rows: [] })

    withTransaction.mockImplementationOnce(async (fn) => fn({ query: clientQuery }))

    const { handlePromotionAdDisputeByProviderPaymentId } = await import(
      './promotion-ad-billing.js'
    )
    const result = await handlePromotionAdDisputeByProviderPaymentId({
      providerPaymentId: 'pi_dispute_2',
    })

    expect(result.handled).toBe(true)
    expect(result.type).toBe('featured_placement')
    expect(result.pauseResult).toEqual(
      expect.objectContaining({ id: 'fp-1', status: 'cancelled', payment_status: 'disputed' })
    )
    const placementUpdate = clientQuery.mock.calls.find((c) =>
      String(c[0]).includes('UPDATE supplier_featured_placements SET')
    )
    expect(placementUpdate).toBeTruthy()
  })

  it('returns duplicate when invoice already disputed', async () => {
    const { withTransaction } = await import('../db.js')
    const clientQuery = vi.fn()
    clientQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'pay-3',
            invoice_id: 'inv-3',
            provider_payment_id: 'pi_dispute_3',
            status: 'DISPUTED',
            tenant_id: 'sup-1',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'inv-3',
            tenant_id: 'sup-1',
            metadata: { type: 'deal_boost', promotionId: 'deal-2', disputed: true },
          },
        ],
      })

    withTransaction.mockImplementationOnce(async (fn) => fn({ query: clientQuery }))

    const { handlePromotionAdDisputeByProviderPaymentId } = await import(
      './promotion-ad-billing.js'
    )
    const result = await handlePromotionAdDisputeByProviderPaymentId({
      providerPaymentId: 'pi_dispute_3',
    })

    expect(result).toEqual({
      handled: true,
      duplicate: true,
      invoiceId: 'inv-3',
      type: 'deal_boost',
    })
  })
})
