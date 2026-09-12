import { describe, expect, it } from 'vitest'
import {
  normalizeCartQuantity,
  stepCartQuantity,
  validateCartItems,
  validateLineQuantity,
  validateSupplierMinimum,
} from './orderQuantityRules'

describe('orderQuantityRules', () => {
  const product = {
    id: 'p1',
    sku: 'SKU-1',
    moq: 6,
    order_multiple: 6,
    supplier_id: 's1',
    supplier_name: 'Fresh Co',
    supplier_minimum_order_amount: 100,
    current_price: 10,
  }

  it('normalizes quantity up to MOQ and pack multiple', () => {
    expect(normalizeCartQuantity(1, product)).toBe(6)
    expect(normalizeCartQuantity(7, product)).toBe(12)
  })

  it('steps by pack multiple and removes below MOQ', () => {
    expect(stepCartQuantity(6, 1, product)).toBe(12)
    expect(stepCartQuantity(6, -1, product)).toBe(0)
  })

  it('validates line quantity and supplier minimums', () => {
    expect(validateLineQuantity(6, product)).toBeNull()
    expect(validateLineQuantity(8, product)).toMatch(/multiples of 6/)
    expect(validateSupplierMinimum(40, 100, 'Fresh Co')).toMatch(/at least 100/)
    expect(
      validateCartItems([
        { product, quantity: 6 },
        { product: { ...product, id: 'p2', sku: 'SKU-2' }, quantity: 3 },
      ])
    ).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/at least 6/),
        expect.stringMatching(/at least 100/),
      ])
    )
  })
})
