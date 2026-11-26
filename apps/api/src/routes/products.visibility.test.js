import { describe, expect, it } from 'vitest'

import {
  applyRestaurantStockView,
  applyRestaurantStockViewToRows,
} from '../lib/restaurant-catalog-view.js'

describe('restaurant stock view', () => {
  it('non-follower gets in_stock but never quantities', () => {
    const row = applyRestaurantStockView({
      id: 'p1',
      is_followed: false,
      available_qty: 7,
      reserved_qty: 2,
      total_available: 9,
      current_price: 12,
    })
    expect(row).toMatchObject({ id: 'p1', is_followed: false, in_stock: true, current_price: 12 })
    expect(row).not.toHaveProperty('available_qty')
    expect(row).not.toHaveProperty('reserved_qty')
    expect(row).not.toHaveProperty('total_available')
  })

  it('follower keeps the quantity', () => {
    const row = applyRestaurantStockView({ id: 'p1', is_followed: true, available_qty: 3 })
    expect(row).toMatchObject({ is_followed: true, in_stock: true, available_qty: 3 })
  })

  it('out of stock and missing follow flag are false', () => {
    const [row] = applyRestaurantStockViewToRows([{ id: 'p1', available_qty: 0 }])
    expect(row.in_stock).toBe(false)
    expect(row.is_followed).toBe(false)
    expect(row).not.toHaveProperty('available_qty')
  })
})
