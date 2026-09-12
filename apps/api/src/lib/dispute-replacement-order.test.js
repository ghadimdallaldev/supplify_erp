import { describe, it, expect } from 'vitest'
import {
  computeReplacementQuantity,
  buildReplacementLineItems,
  PLACEMENT_SOURCE_DISPUTE_REPLACEMENT,
} from './dispute-replacement-order.js'

describe('dispute-replacement-order', () => {
  describe('computeReplacementQuantity', () => {
    it('uses disputed_quantity when set', () => {
      expect(computeReplacementQuantity({ disputed_quantity: 3 })).toBe(3)
    })

    it('uses ordered minus received when both present', () => {
      expect(computeReplacementQuantity({ quantity_ordered: 10, quantity_received: 4 })).toBe(6)
    })

    it('never returns negative short quantity', () => {
      expect(computeReplacementQuantity({ quantity_ordered: 2, quantity_received: 5 })).toBe(0)
    })

    it('returns 0 when no quantities', () => {
      expect(computeReplacementQuantity({})).toBe(0)
    })
  })

  describe('buildReplacementLineItems', () => {
    const orderItemsById = new Map([
      [
        'oi-1',
        {
          id: 'oi-1',
          product_id: 'p-1',
          supplier_id: 's-1',
          unit_price: '12.50',
          product_name: 'Tomatoes',
          product_sku: 'TOM-1',
        },
      ],
    ])

    it('builds lines for short quantities only', () => {
      const lines = buildReplacementLineItems(
        [
          {
            order_item_id: 'oi-1',
            quantity_ordered: 10,
            quantity_received: 7,
          },
          {
            order_item_id: 'oi-1',
            quantity_ordered: 1,
            quantity_received: 1,
          },
        ],
        orderItemsById
      )
      expect(lines).toHaveLength(1)
      expect(lines[0]).toMatchObject({
        productId: 'p-1',
        supplierId: 's-1',
        quantity: 3,
        originalUnitPrice: 12.5,
        sourceOrderItemId: 'oi-1',
      })
    })

    it('returns empty when no valid lines', () => {
      expect(
        buildReplacementLineItems([{ quantity_ordered: 5, quantity_received: 5 }], orderItemsById)
      ).toEqual([])
    })
  })

  it('exports placement source constant', () => {
    expect(PLACEMENT_SOURCE_DISPUTE_REPLACEMENT).toBe('DISPUTE_REPLACEMENT')
  })
})
