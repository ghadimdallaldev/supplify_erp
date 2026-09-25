import { beforeEach, describe, expect, it, vi } from 'vitest'

const { query, listSupplierStockDisplay } = vi.hoisted(() => ({
  query: vi.fn(),
  listSupplierStockDisplay: vi.fn(),
}))
vi.mock('../lib/db.js', () => ({ query }))
vi.mock('./supplier-stock.service.js', () => ({ listSupplierStockDisplay }))

import { listSupplierSlowMovingInventory } from './supplier-slow-moving-intelligence.service.js'

describe('supplier slow-moving intelligence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('flags only products with measured repeated sales and long stock cover', async () => {
    listSupplierStockDisplay.mockResolvedValue([
      { product_id: 'p1', available_qty: 120 },
      { product_id: 'p2', available_qty: 20 },
      { product_id: 'p3', available_qty: 90 },
    ])
    query.mockResolvedValue({
      rows: [
        { product_id: 'p1', product_name: 'Tomato', sku: 'T', sold_quantity: 30, order_count: 3 },
        { product_id: 'p2', product_name: 'Lemon', sku: 'L', sold_quantity: 30, order_count: 3 },
        { product_id: 'p3', product_name: 'Mint', sku: 'M', sold_quantity: 5, order_count: 1 },
      ],
    })

    const result = await listSupplierSlowMovingInventory('s1', { days: 90 })

    expect(result.products[0]).toMatchObject({ productId: 'p1', stockCoverDays: 360 })
    expect(result.products).toHaveLength(1)
    expect(result.coverage).toEqual({
      stockedProducts: 3,
      productsWithSalesHistory: 2,
      slowMovingProducts: 1,
    })
    expect(query.mock.calls[0][0]).toContain(
      "co.status NOT IN ('DRAFT', 'CANCELLED', 'PENDING_APPROVAL')"
    )
    expect(query.mock.calls[0][1]).toEqual(['s1', ['p1', 'p2', 'p3'], 90])
  })

  it('returns explicit empty coverage without querying sales when no stock is available', async () => {
    listSupplierStockDisplay.mockResolvedValue([{ product_id: 'p1', available_qty: 0 }])

    await expect(listSupplierSlowMovingInventory('s1')).resolves.toEqual({
      windowDays: 90,
      coverage: { stockedProducts: 0, productsWithSalesHistory: 0, slowMovingProducts: 0 },
      products: [],
    })
    expect(query).not.toHaveBeenCalled()
  })

  it('clamps an untrusted result limit without changing the observation window', async () => {
    listSupplierStockDisplay.mockResolvedValue([
      { product_id: 'p1', available_qty: 100 },
      { product_id: 'p2', available_qty: 100 },
    ])
    query.mockResolvedValue({
      rows: [
        { product_id: 'p1', product_name: 'Tomato', sold_quantity: 10, order_count: 2 },
        { product_id: 'p2', product_name: 'Lemon', sold_quantity: 10, order_count: 2 },
      ],
    })

    const result = await listSupplierSlowMovingInventory('s1', { days: '999', limit: '1' })

    expect(result.windowDays).toBe(365)
    expect(result.products).toHaveLength(1)
    expect(result.coverage.slowMovingProducts).toBe(2)
  })
})
