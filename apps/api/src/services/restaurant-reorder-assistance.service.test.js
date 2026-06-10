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

    const { getReorderAssistance } = await import('./restaurant-reorder-assistance.service.js')
    const result = await getReorderAssistance('r1')
    expect(result.suggestions.length).toBeGreaterThanOrEqual(1)
    const lowStock = result.suggestions.find((s) => s.reasonCode === 'low_stock')
    expect(lowStock?.productName).toBe('Chicken')
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

    const { getReorderAssistance } = await import('./restaurant-reorder-assistance.service.js')
    const result = await getReorderAssistance('r1')
    expect(result.suggestions.find((s) => s.productId === 'p1')).toBeUndefined()
  })
})
