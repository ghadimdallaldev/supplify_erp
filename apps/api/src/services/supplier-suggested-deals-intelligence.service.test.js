import { beforeEach, describe, expect, it, vi } from 'vitest'

const { query, listSupplierSlowMovingInventory } = vi.hoisted(() => ({
  query: vi.fn(),
  listSupplierSlowMovingInventory: vi.fn(),
}))
vi.mock('../lib/db.js', () => ({ query }))
vi.mock('./supplier-slow-moving-intelligence.service.js', () => ({
  listSupplierSlowMovingInventory,
}))

import { listSupplierSuggestedDealCandidates } from './supplier-suggested-deals-intelligence.service.js'

describe('supplier suggested deal candidates', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reuses slow-moving evidence and excludes products with active or pending product deals', async () => {
    listSupplierSlowMovingInventory.mockResolvedValue({
      windowDays: 90,
      products: [
        {
          productId: 'p1',
          productName: 'Tomato',
          sku: 'TOM',
          availableQty: 50,
          soldQuantity: 5,
          orderCount: 2,
          stockCoverDays: 900.556,
        },
        {
          productId: 'p2',
          productName: 'Mint',
          sku: 'MNT',
          availableQty: 20,
          soldQuantity: 4,
          orderCount: 2,
          stockCoverDays: 450,
        },
      ],
    })
    query.mockResolvedValue({ rows: [{ product_id: 'p2' }] })

    const result = await listSupplierSuggestedDealCandidates('supplier-1', { days: 120 })

    expect(listSupplierSlowMovingInventory).toHaveBeenCalledWith('supplier-1', {
      days: 120,
      limit: 100,
    })
    expect(query.mock.calls[0][0]).toContain(
      "p.status IN ('active', 'scheduled', 'pending_approval'"
    )
    expect(query.mock.calls[0][1]).toEqual(['supplier-1', ['p1', 'p2']])
    expect(result).toEqual({
      windowDays: 90,
      coverage: {
        slowMovingProducts: 2,
        productsWithActiveOrPendingProductDeal: 1,
        candidates: 1,
      },
      candidates: [expect.objectContaining({ productId: 'p1', stockCoverDays: 900.56 })],
    })
  })

  it('avoids a promotions query when no slow-moving evidence exists', async () => {
    listSupplierSlowMovingInventory.mockResolvedValue({ windowDays: 90, products: [] })

    const result = await listSupplierSuggestedDealCandidates('supplier-1')

    expect(query).not.toHaveBeenCalled()
    expect(result.coverage).toEqual({
      slowMovingProducts: 0,
      productsWithActiveOrPendingProductDeal: 0,
      candidates: 0,
    })
  })
})
