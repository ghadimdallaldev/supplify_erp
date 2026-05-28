import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./db.js', () => ({ query: vi.fn() }))
vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}))
vi.mock('../config/env.js', () => ({
  config: { ADMIN_OVERVIEW_DEBUG: false },
}))

import { query } from './db.js'
import { buildAdminOverviewMetrics, safeOverviewQuery } from './admin-overview-metrics.js'

describe('admin-overview-metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('safeOverviewQuery', () => {
    it('returns fallback when query throws', async () => {
      query.mockRejectedValueOnce(new Error('column "is_active" does not exist'))
      const rows = await safeOverviewQuery('products', 'SELECT 1', [{ count: 0 }])
      expect(rows).toEqual([{ count: 0 }])
    })
  })

  describe('buildAdminOverviewMetrics', () => {
    it('returns expected shape with seeded row data', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ tenant_type: 'RESTAURANT', count: 2 }] })
        .mockResolvedValueOnce({
          rows: [
            { status: 'ACTIVE', count: 2 },
            { status: 'TRIALING', count: 1 },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ mrr: 198, paid_active_subscriptions: 2, paid_active_only: 1 }],
        })
        .mockResolvedValueOnce({
          rows: [{ today: 3, week: 8, month: 12, total: 50 }],
        })
        .mockResolvedValueOnce({ rows: [{ count: 4 }] })
        .mockResolvedValueOnce({ rows: [{ count: 10 }] })
        .mockResolvedValueOnce({ rows: [{ count: 5 }] })
        .mockResolvedValueOnce({ rows: [{ today: 2, week: 6, confirmed: 1 }] })
        .mockResolvedValueOnce({ rows: [{ new_suppliers: 1, count: 3 }] })
        .mockResolvedValueOnce({ rows: [{ new_restaurants: 0, count: 4 }] })
        .mockResolvedValueOnce({ rows: [{ count: 100 }] })
        .mockResolvedValueOnce({ rows: [{ count: 7 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [{ count: 1 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })

      const data = await buildAdminOverviewMetrics()

      expect(data.orders).toEqual({ today: 3, week: 8, month: 12, total: 50 })
      expect(data.activeCarts).toBe(4)
      expect(data.chatsLast24h).toBe(10)
      expect(data.totalActiveStaff).toBe(5)
      expect(data.tenants.totalSuppliers).toBe(3)
      expect(data.tenants.totalRestaurants).toBe(4)
      expect(data.totalActiveProducts).toBe(100)
      expect(data.totalQuickLists).toBe(7)
      expect(data.revenue.mrr).toBe(198)
      expect(data.revenue.paidActiveSubscriptions).toBe(2)
      expect(data.subscriptionStats.ACTIVE).toBe(2)
      expect(data.reservations.today).toBe(2)
    })

    it('still returns partial metrics when product query fails', async () => {
      let call = 0
      query.mockImplementation(async (sql) => {
        call += 1
        if (typeof sql === 'string' && sql.includes('FROM product')) {
          throw Object.assign(new Error('column "is_active" does not exist'), { code: '42703' })
        }
        if (typeof sql === 'string' && sql.includes('FROM supplier')) {
          return { rows: [{ new_suppliers: 0, count: 9 }] }
        }
        if (typeof sql === 'string' && sql.includes('FROM restaurant')) {
          return { rows: [{ new_restaurants: 0, count: 5 }] }
        }
        return {
          rows: [
            {
              count: 0,
              today: 0,
              week: 0,
              month: 0,
              total: 0,
              mrr: 0,
              paid_active_subscriptions: 0,
              paid_active_only: 0,
              new_suppliers: 0,
              new_restaurants: 0,
              confirmed: 0,
            },
          ],
        }
      })

      const data = await buildAdminOverviewMetrics()
      expect(data.tenants.totalSuppliers).toBe(9)
      expect(data.totalActiveProducts).toBe(0)
    })
  })
})
