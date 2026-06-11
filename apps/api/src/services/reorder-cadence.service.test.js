import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('reorder-cadence config', () => {
  it('exports sensible defaults', async () => {
    const mod = await import('./reorder-cadence.service.js')
    expect(mod.MIN_ORDERS_FOR_CADENCE).toBeGreaterThanOrEqual(3)
    expect(mod.LOOKBACK_DAYS).toBe(180)
  })
})

describe('reorder-cadence missed detection', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('detects missed cadence when no order on expected day', async () => {
    const monday = new Date('2026-06-01T10:00:00Z')
    const queryMock = vi.fn(async (sql) => {
      const s = String(sql)
      if (s.includes('restaurant_order_cadence') && s.includes('day_of_week')) {
        return {
          rows: [
            {
              id: 'c1',
              restaurant_id: 'r1',
              supplier_id: 's1',
              product_id: 'p1',
              category_id: null,
              cadence_level: 'product',
              day_of_week: 1,
              label: 'Chicken from ABC',
              restaurant_name: 'Restaurant X',
              supplier_name: 'ABC',
              reminder_date: new Date('2026-06-01T00:00:00Z'),
            },
          ],
        }
      }
      if (s.includes('reorder_cadence_reminder_log')) return { rows: [] }
      if (s.includes('customer_order') && s.includes('NOT EXISTS')) return { rows: [] }
      if (s.includes('customer_order')) return { rows: [] }
      return { rows: [] }
    })

    vi.doMock('../lib/db.js', () => ({ query: queryMock }))
    const { getMissedCadencesForToday } = await import('./reorder-cadence.service.js')
    const missed = await getMissedCadencesForToday({ now: monday })
    expect(missed.length).toBe(1)
    expect(missed[0].restaurant_name).toBe('Restaurant X')
    expect(missed[0].reminderDate).toBe('2026-06-01')
  })
})
