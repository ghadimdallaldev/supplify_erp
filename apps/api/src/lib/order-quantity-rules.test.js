import { describe, expect, it } from 'vitest'
import {
  assertLineQuantityRules,
  assertSupplierMinimumOrderAmount,
} from './order-quantity-rules.js'
import { ValidationError } from '../middlewares/errorHandler.js'

describe('assertLineQuantityRules', () => {
  it('allows quantities at or above MOQ that match pack multiples', () => {
    expect(() =>
      assertLineQuantityRules({ quantity: 12, moq: 6, orderMultiple: 6, sku: 'SKU-1' })
    ).not.toThrow()
  })

  it('rejects quantities below MOQ', () => {
    expect(() =>
      assertLineQuantityRules({ quantity: 2, moq: 6, orderMultiple: 1, sku: 'SKU-1' })
    ).toThrow(ValidationError)
  })

  it('rejects quantities that are not pack multiples', () => {
    expect(() =>
      assertLineQuantityRules({ quantity: 10, moq: 4, orderMultiple: 4, sku: 'SKU-1' })
    ).toThrow(/multiples of 4/)
  })
})

describe('assertSupplierMinimumOrderAmount', () => {
  it('no-ops when minimum is unset', () => {
    expect(() =>
      assertSupplierMinimumOrderAmount({ subtotal: 10, minimumOrderAmount: null })
    ).not.toThrow()
  })

  it('rejects subtotals below the supplier minimum', () => {
    expect(() =>
      assertSupplierMinimumOrderAmount({
        subtotal: 40,
        minimumOrderAmount: 100,
        supplierName: 'Fresh Co',
      })
    ).toThrow(/at least 100.00/)
  })

  it('allows subtotals at or above the supplier minimum', () => {
    expect(() =>
      assertSupplierMinimumOrderAmount({
        subtotal: 100,
        minimumOrderAmount: 100,
        supplierName: 'Fresh Co',
      })
    ).not.toThrow()
  })
})
