import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQuery = vi.fn()
const mockClientQuery = vi.fn()

vi.mock('../lib/db.js', () => ({
  query: (...args) => mockQuery(...args),
  withTransaction: (fn) => fn({ query: (...args) => mockClientQuery(...args) }),
}))
vi.mock('../lib/billing/promotion-ad-billing.js', () => ({
  FEATURED_PLACEMENT_INVOICE_TYPE: 'featured_placement',
  isPromotionAdPaymentWaived: vi.fn(() => true),
  createFeaturedPlacementInvoice: vi.fn(),
  chargePromotionAdInvoice: vi.fn(),
  markPromotionAdInvoiceRefunded: vi.fn(),
}))

const { approveFeaturedPlacement, purchaseAndActivateFeaturedPlacement, rejectFeaturedPlacement } =
  await import('./featured-supplier-placement.service.js')

describe('featured supplier placement approval lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps a waived purchase pending for admin approval', async () => {
    mockClientQuery
      .mockResolvedValueOnce({
        rows: [{ pricing_key: 'featured_7', amount: 49, duration_days: 7 }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'placement-1', status: 'pending', payment_status: 'waived' }],
      })

    const result = await purchaseAndActivateFeaturedPlacement({
      supplierId: 'supplier-1',
      pricingKey: 'featured_7',
      createdBy: 'user-1',
    })

    expect(mockClientQuery.mock.calls[1][1][2]).toBe('pending')
    expect(result).toMatchObject({ status: 'pending', approvalRequired: true })
  })

  it('starts the paid term when an admin approves', async () => {
    mockClientQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'placement-1',
            status: 'pending',
            payment_status: 'paid',
            package_duration_days: 7,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'placement-1', status: 'active' }] })

    const result = await approveFeaturedPlacement({
      placementId: 'placement-1',
      approvedBy: 'admin-1',
    })

    expect(result.placement.status).toBe('active')
    expect(mockClientQuery.mock.calls[1][0]).toContain("status = 'active'")
    expect(mockClientQuery.mock.calls[1][1][3]).toBe('admin-1')
  })

  it('cancels and marks a paid placement refunded when an admin rejects it', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'placement-1',
            supplier_id: 'supplier-1',
            billing_invoice_id: 'invoice-1',
            status: 'pending',
            payment_status: 'paid',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'placement-1', status: 'cancelled', payment_status: 'refunded' }],
      })

    const result = await rejectFeaturedPlacement({
      placementId: 'placement-1',
      rejectedBy: 'admin-1',
      reason: 'Not eligible',
    })

    expect(result.placement).toMatchObject({
      status: 'cancelled',
      payment_status: 'refunded',
    })
    expect(mockQuery.mock.calls[1][0]).toContain('payment_status = CASE')
  })
})
