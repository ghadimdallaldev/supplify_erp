import { describe, expect, it, vi, beforeEach } from 'vitest'

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
  })),
}))

vi.mock('./billing-service.js', () => ({
  getSubscriptionForBilling: vi.fn(async () => ({
    id: 'sup-sub-1',
    plan_id: 'plan-sup',
    plan_code: 'gold',
    status: 'ACTIVE',
  })),
}))

describe('createSupplierSponsorshipInvoice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates OPEN invoice with sponsorship metadata and does not upgrade supplier plan', async () => {
    const { withTransaction } = await import('../db.js')
    const clientQuery = vi.fn()
    // INSERT billing_invoice
    clientQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'inv-1',
          status: 'OPEN',
          amount: 49,
          metadata: { type: 'supplier_sponsorship' },
        },
      ],
    })
    // UPDATE sponsorship
    clientQuery.mockResolvedValueOnce({ rows: [] })
    // billing_event
    clientQuery.mockResolvedValueOnce({ rows: [] })

    withTransaction.mockImplementationOnce(async (fn) => fn({ query: clientQuery }))

    const { createSupplierSponsorshipInvoice } = await import('./sponsorship-billing.js')
    const result = await createSupplierSponsorshipInvoice({
      sponsorship: {
        id: 'sp-1',
        supplier_id: 'sup-1',
        restaurant_id: 'rest-1',
        prospect_id: 'pr-1',
        supplier_billing_invoice_id: null,
      },
      snapshot: {
        planId: 'plan-r',
        planName: 'Restaurant Growth',
        finalSponsoredAmount: 49,
        baseAmount: 49,
        currency: 'USD',
      },
    })

    expect(result.created).toBe(true)
    expect(result.invoice.id).toBe('inv-1')
    const insertCall = clientQuery.mock.calls.find((c) =>
      String(c[0]).includes('INSERT INTO billing_invoice')
    )
    expect(insertCall).toBeTruthy()
    expect(String(insertCall[0])).toContain("'SUPPLIER'")
    // Never touch applyPaidSubscription — not imported/called
  })
})

describe('chargeSupplierSponsorshipInvoice failure isolation', () => {
  it('throws SPONSORSHIP_PAYMENT_FAILED without marking supplier past due', async () => {
    const { getBillingGateway } = await import('./gateway-registry.js')
    getBillingGateway.mockReturnValue({
      id: 'stub',
      charge: vi.fn(async () => ({
        status: 'failed',
        failureCode: 'card_declined',
        failureMessage: 'Declined',
        providerPaymentId: 'pay_fail',
      })),
    })

    const { withTransaction } = await import('../db.js')
    const clientQuery = vi.fn()
    // SELECT invoice FOR UPDATE
    clientQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'inv-1',
          status: 'OPEN',
          amount: 49,
          currency: 'USD',
          metadata: { type: 'supplier_sponsorship', sponsorshipId: 'sp-1' },
        },
      ],
    })
    // existing payment by idempotency
    clientQuery.mockResolvedValueOnce({ rows: [] })
    // payment method
    clientQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'pm-1',
          provider: 'stub',
          provider_payment_method_id: 'tok_1',
        },
      ],
    })
    // INSERT payment
    clientQuery.mockResolvedValueOnce({
      rows: [{ id: 'pay-1', status: 'PROCESSING' }],
    })
    // UPDATE payment failed
    clientQuery.mockResolvedValueOnce({ rows: [] })
    // billing_event
    clientQuery.mockResolvedValueOnce({ rows: [] })

    withTransaction.mockImplementationOnce(async (fn) => fn({ query: clientQuery }))

    const { chargeSupplierSponsorshipInvoice } = await import('./sponsorship-billing.js')
    await expect(
      chargeSupplierSponsorshipInvoice({
        invoiceId: 'inv-1',
        supplierId: 'sup-1',
        idempotencyKey: 'key-1',
      })
    ).rejects.toMatchObject({ code: 'SPONSORSHIP_PAYMENT_FAILED' })

    const pastDue = clientQuery.mock.calls.find((c) => String(c[0]).includes("status = 'PAST_DUE'"))
    expect(pastDue).toBeUndefined()
  })
})
