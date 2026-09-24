import { beforeEach, describe, expect, it, vi } from 'vitest'

const { query } = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('../lib/db.js', () => ({ query }))

import { listSupplierCrossSellOpportunities } from './supplier-cross-sell-intelligence.service.js'

describe('supplier cross-sell intelligence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns only exact supplier product-pair evidence for customers that have not ordered the candidate', async () => {
    query.mockResolvedValue({
      rows: [
        {
          restaurant_id: 'restaurant-1',
          restaurant_name: 'Cafe One',
          anchor_product_id: 'p1',
          anchor_product_name: 'Tomato',
          anchor_sku: 'TOM',
          candidate_product_id: 'p2',
          candidate_product_name: 'Basil',
          candidate_sku: 'BAS',
          paired_order_count: '4',
        },
      ],
    })

    const result = await listSupplierCrossSellOpportunities('supplier-1')

    expect(result).toEqual({
      observationDays: 180,
      minPairedOrders: 2,
      opportunities: [
        {
          restaurantId: 'restaurant-1',
          restaurantName: 'Cafe One',
          anchorProduct: { productId: 'p1', productName: 'Tomato', sku: 'TOM' },
          candidateProduct: { productId: 'p2', productName: 'Basil', sku: 'BAS' },
          pairedOrderCount: 4,
        },
      ],
    })
    expect(query.mock.calls[0][0]).toContain('customer_candidate.product_id IS NULL')
    expect(query.mock.calls[0][0]).toContain(
      "co.status NOT IN ('DRAFT', 'CANCELLED', 'PENDING_APPROVAL')"
    )
    expect(query.mock.calls[0][1]).toEqual(['supplier-1', 180, 2, 20])
  })

  it('bounds untrusted observation windows and result limits', async () => {
    query.mockResolvedValue({ rows: [] })

    const result = await listSupplierCrossSellOpportunities('supplier-1', {
      days: '999',
      limit: '0',
    })

    expect(result.observationDays).toBe(365)
    expect(result.opportunities).toEqual([])
    expect(query.mock.calls[0][1]).toEqual(['supplier-1', 365, 2, 20])
  })
})
