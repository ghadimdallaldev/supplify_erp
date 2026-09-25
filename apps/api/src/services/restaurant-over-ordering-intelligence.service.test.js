import { describe, expect, it, vi } from 'vitest'

import { listOverOrderingIntelligence } from './restaurant-over-ordering-intelligence.service.js'

const rows = [
  {
    product_id: 'p1',
    product_name: 'Tomatoes',
    product_unit: 'kg',
    supplier_name: 'Fresh Co',
    order_count: '3',
    ordered_quantity: '120',
    receiving_by_unit: [{ unit: 'kg', line_count: '3', quantity: '110' }],
    usage_quantity: '20',
    waste_quantity: '10',
    current_quantity: '90',
  },
  {
    product_id: 'p2',
    product_name: 'Herbs',
    product_unit: 'kg',
    supplier_name: 'Fresh Co',
    order_count: '4',
    ordered_quantity: '50',
    receiving_by_unit: [{ unit: 'case', line_count: '4', quantity: '50' }],
    usage_quantity: '5',
    waste_quantity: '0',
    current_quantity: '80',
  },
]

describe('listOverOrderingIntelligence', () => {
  it('flags only high stock coverage supported by comparable purchase, receipt, usage, and waste data', async () => {
    const dbQuery = vi.fn(async () => ({ rows }))

    const result = await listOverOrderingIntelligence('restaurant-1', {}, dbQuery)

    expect(result.summary).toEqual({
      productsObserved: 2,
      productsWithCompleteComparableData: 1,
      flaggedProducts: 1,
      productsWithReceiptUnitMismatch: 1,
    })
    expect(result.products[0]).toMatchObject({
      productId: 'p1',
      orders: { count: 3, quantity: 120 },
      receiving: { quantity: 110, matchingLines: 3, mismatchedLines: 0 },
      usage: { quantity: 20 },
      waste: { quantity: 10, sharePct: 33.33333333333333 },
      stock: { currentQuantity: 90, coverageDays: 405 },
      comparisons: { receiptToDepletionRatio: 110 / 30, completeComparableData: true },
      signals: ['excess_stock_coverage', 'waste_with_excess_stock'],
    })
  })

  it('keeps incompatible receipt units visible as missing comparison coverage instead of flagging them', async () => {
    const dbQuery = vi.fn(async () => ({ rows: [rows[1]] }))

    const result = await listOverOrderingIntelligence('restaurant-1', {}, dbQuery)

    expect(result.summary).toEqual({
      productsObserved: 1,
      productsWithCompleteComparableData: 0,
      flaggedProducts: 0,
      productsWithReceiptUnitMismatch: 1,
    })
    expect(result.products).toEqual([])
  })

  it('uses the restaurant scope and clamps client input', async () => {
    const dbQuery = vi.fn(async () => ({ rows: [] }))

    await listOverOrderingIntelligence('restaurant-1', { days: 2, limit: 1000 }, dbQuery)

    expect(dbQuery).toHaveBeenCalledWith(expect.stringContaining('inventory_movement_log'), [
      'restaurant-1',
      30,
    ])
    expect(dbQuery.mock.calls[0][0]).toContain("adjustment_type IN ('WASTAGE', 'SPOILAGE')")
    expect(dbQuery.mock.calls[0][0]).toContain('receiving_line_item')
    expect(dbQuery.mock.calls[0][0]).toContain('customer_order')
  })

  it('requires a restaurant scope', async () => {
    const dbQuery = vi.fn()
    await expect(listOverOrderingIntelligence(null, {}, dbQuery)).rejects.toThrow(/required/)
    expect(dbQuery).not.toHaveBeenCalled()
  })
})
