import { describe, it, expect } from 'vitest'
import { resolveSupplierInventoryStatus, countSupplierLowStockItems } from './supplierStockStatus'

describe('resolveSupplierInventoryStatus', () => {
  it('shows out of stock when available_qty is 0 even if isLowStock is false', () => {
    const result = resolveSupplierInventoryStatus({
      available_qty: 0,
      isLowStock: false,
    })
    expect(result.status).toBe('OUT_OF_STOCK')
    expect(result.label).toBe('Out of stock')
  })

  it('shows low stock when isLowStock is true and qty > 0', () => {
    const result = resolveSupplierInventoryStatus({
      available_qty: 5,
      isLowStock: true,
      low_stock_threshold: 10,
    })
    expect(result.status).toBe('LOW_STOCK')
    expect(result.label).toBe('Low stock')
  })

  it('shows in stock for healthy qty', () => {
    const result = resolveSupplierInventoryStatus({
      available_qty: 50,
      isLowStock: false,
      low_stock_threshold: 10,
    })
    expect(result.status).toBe('IN_STOCK')
    expect(result.label).toBe('In stock')
  })
})

describe('countSupplierLowStockItems', () => {
  it('counts only in-stock rows flagged as low stock', () => {
    expect(
      countSupplierLowStockItems([
        { available_qty: 0, isLowStock: false },
        { available_qty: 5, isLowStock: true },
        { available_qty: 50, isLowStock: false },
      ])
    ).toBe(1)
  })
})
