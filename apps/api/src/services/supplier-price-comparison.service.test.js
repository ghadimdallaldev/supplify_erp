import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQuery = vi.fn()
vi.mock('../lib/db.js', () => ({ query: (...args) => mockQuery(...args) }))

const { listCommonProductBestPrices } = await import('./supplier-price-comparison.service.js')

describe('supplier price comparison', () => {
  beforeEach(() => vi.clearAllMocks())

  it('compares distinct suppliers only when name, unit, brand, and currency match', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          productId: 'p1',
          productName: 'Tomato',
          brand: null,
          unit: 'kg',
          supplierId: 's1',
          supplierName: 'One',
          amount: '2.50',
          currency: 'USD',
          minQty: '1',
        },
        {
          productId: 'p2',
          productName: ' tomato ',
          brand: null,
          unit: 'kg',
          supplierId: 's2',
          supplierName: 'Two',
          amount: '2.00',
          currency: 'USD',
          minQty: '1',
        },
        {
          productId: 'p4',
          productName: 'Tomato',
          brand: null,
          unit: 'kg',
          supplierId: 's4',
          supplierName: 'Bulk',
          amount: '1.00',
          currency: 'USD',
          minQty: '10',
        },
        {
          productId: 'p3',
          productName: 'Tomato',
          brand: null,
          unit: 'case',
          supplierId: 's3',
          supplierName: 'Three',
          amount: '10.00',
          currency: 'USD',
          minQty: '1',
        },
      ],
    })

    const result = await listCommonProductBestPrices('restaurant-1')

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      supplierCount: 2,
      savings: 0.5,
      savingsPercent: 20,
      bestOffer: { supplierId: 's2' },
    })
    expect(result[0].offers.map((offer) => offer.supplierId)).toEqual(['s2', 's1'])
    expect(String(mockQuery.mock.calls[0][0])).toContain('COALESCE(pr.min_qty, 1) <= 1')
  })
})
