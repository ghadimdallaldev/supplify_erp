import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('restaurant-reorder-assistance.service', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('merges low stock and cadence suggestions with deduplication', async () => {
    const queryMock = vi.fn(async (sql) => {
      const s = String(sql)
      if (s.includes('reorder_suggestion_suppression')) return { rows: [] }
      if (s.includes('restaurant_inventory ri')) {
        return {
          rows: [
            {
              product_id: 'p1',
              product_name: 'Chicken',
              product_unit: 'kg',
              supplier_id: 's1',
              supplier_name: 'Farm Co',
              current_qty: 2,
              low_stock_threshold: 5,
              avg_daily_usage_30day: 1,
              last_order_qty: 10,
              days_since_last_order: 3,
              lead_time_days: 7,
              urgency_level: 'URGENT',
              suggested_reorder_qty: 10,
            },
          ],
        }
      }
      if (s.includes('quick_list ql')) return { rows: [] }
      return { rows: [] }
    })

    vi.doMock('../lib/db.js', () => ({ query: queryMock }))
    vi.doMock('./reorder-cadence.service.js', () => ({
      listRestaurantReminders: vi.fn(async () => [
        {
          id: 'c1',
          label: 'Chicken from Farm Co',
          supplierId: 's1',
          supplierName: 'Farm Co',
          dayName: 'Monday',
        },
      ]),
    }))
    vi.doMock('./inventory-expiry.service.js', () => ({
      listExpiryLots: vi.fn(async () => ({ lots: [] })),
    }))
    vi.doMock('./reorder-forecast-cache.service.js', () => ({
      refreshIfStale: vi.fn(async () => ({ refreshed: false })),
      getCachedForecasts: vi.fn(async () => []),
    }))

    const { getReorderAssistance } = await import('./restaurant-reorder-assistance.service.js')
    const result = await getReorderAssistance('r1')
    expect(result.suggestions.length).toBeGreaterThanOrEqual(1)
    const lowStock = result.suggestions.find((s) => s.reasonCode === 'low_stock')
    expect(lowStock?.productName).toBe('Chicken')
  })

  it('computes suggestedQty via order-up-to (minus on-hand) with supplier pack rounding', async () => {
    const queryMock = vi.fn(async (sql) => {
      const s = String(sql)
      if (s.includes('reorder_suggestion_suppression')) return { rows: [] }
      if (s.includes('restaurant_inventory ri')) {
        return {
          rows: [
            {
              product_id: 'p1',
              product_name: 'Tomatoes',
              product_unit: 'unit',
              supplier_id: 's1',
              supplier_name: 'Farm Co',
              current_qty: 10,
              low_stock_threshold: 20,
              avg_daily_usage_30day: 3,
              last_order_qty: 5,
              days_since_last_order: 2,
              lead_time_days: 7,
              moq: 1,
              order_multiple: 10,
              urgency_level: 'URGENT',
            },
          ],
        }
      }
      if (s.includes('quick_list ql')) return { rows: [] }
      return { rows: [] }
    })

    vi.doMock('../lib/db.js', () => ({ query: queryMock }))
    vi.doMock('./reorder-cadence.service.js', () => ({
      listRestaurantReminders: vi.fn(async () => []),
    }))
    vi.doMock('./inventory-expiry.service.js', () => ({
      listExpiryLots: vi.fn(async () => ({ lots: [] })),
    }))
    vi.doMock('./reorder-forecast-cache.service.js', () => ({
      refreshIfStale: vi.fn(async () => ({ refreshed: false })),
      getCachedForecasts: vi.fn(async () => []),
    }))

    const { getReorderAssistance } = await import('./restaurant-reorder-assistance.service.js')
    const result = await getReorderAssistance('r1')
    const item = result.suggestions.find((x) => x.productId === 'p1')
    // target = 3/day * (7+14) = 63; minus 10 on-hand = 53; round up to multiple of 10 => 60
    expect(item?.suggestedQty).toBe(60)
  })

  it('excludes suppressed product suggestions', async () => {
    const queryMock = vi.fn(async (sql) => {
      const s = String(sql)
      if (s.includes('reorder_suggestion_suppression')) {
        return {
          rows: [
            { scope_type: 'product', scope_id: 'p1', action: 'not_needed', snooze_until: null },
          ],
        }
      }
      if (s.includes('restaurant_inventory ri')) {
        return {
          rows: [
            {
              product_id: 'p1',
              product_name: 'Rice',
              product_unit: 'kg',
              supplier_id: 's1',
              supplier_name: 'Grain Co',
              current_qty: 1,
              low_stock_threshold: 5,
              avg_daily_usage_30day: 0.5,
              last_order_qty: 5,
              days_since_last_order: 20,
              lead_time_days: 7,
              urgency_level: 'URGENT',
              suggested_reorder_qty: 5,
            },
          ],
        }
      }
      if (s.includes('quick_list')) return { rows: [] }
      return { rows: [] }
    })

    vi.doMock('../lib/db.js', () => ({ query: queryMock }))
    vi.doMock('./reorder-cadence.service.js', () => ({
      listRestaurantReminders: vi.fn(async () => []),
    }))
    vi.doMock('./inventory-expiry.service.js', () => ({
      listExpiryLots: vi.fn(async () => ({ lots: [] })),
    }))
    vi.doMock('./reorder-forecast-cache.service.js', () => ({
      refreshIfStale: vi.fn(async () => ({ refreshed: false })),
      getCachedForecasts: vi.fn(async () => []),
    }))

    const { getReorderAssistance } = await import('./restaurant-reorder-assistance.service.js')
    const result = await getReorderAssistance('r1')
    expect(result.suggestions.find((s) => s.productId === 'p1')).toBeUndefined()
  })
})
