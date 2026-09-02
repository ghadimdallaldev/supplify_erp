import { describe, it, expect } from 'vitest'
import {
  computeSupplierStockFlags,
  DEFAULT_SUPPLIER_LOW_STOCK_THRESHOLD,
} from './supplier-stock-status.js'

describe('computeSupplierStockFlags', () => {
  it('uses default threshold when settings row is missing', () => {
    expect(DEFAULT_SUPPLIER_LOW_STOCK_THRESHOLD).toBe(10)
    const flags = computeSupplierStockFlags(10, null)
    expect(flags.lowStockThreshold).toBe(10)
    expect(flags.isLowStock).toBe(true)
    expect(flags.stockStatus).toBe('LOW_STOCK')
  })

  it('marks qty 0 as out of stock (not low stock)', () => {
    const flags = computeSupplierStockFlags(0, 10)
    expect(flags.isOutOfStock).toBe(true)
    expect(flags.isLowStock).toBe(false)
    expect(flags.stockStatus).toBe('OUT_OF_STOCK')
  })

  it('marks qty below threshold as low stock', () => {
    const flags = computeSupplierStockFlags(5, 10)
    expect(flags.isLowStock).toBe(true)
    expect(flags.isInStock).toBe(false)
  })

  it('marks qty equal to threshold as low stock (inclusive <=)', () => {
    const flags = computeSupplierStockFlags(10, 10)
    expect(flags.isLowStock).toBe(true)
    expect(flags.stockStatus).toBe('LOW_STOCK')
  })

  it('marks qty above threshold as in stock', () => {
    const flags = computeSupplierStockFlags(11, 10)
    expect(flags.isLowStock).toBe(false)
    expect(flags.isInStock).toBe(true)
    expect(flags.stockStatus).toBe('IN_STOCK')
  })
})
