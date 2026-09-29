import { beforeEach, describe, expect, it, vi } from 'vitest'

const { query } = vi.hoisted(() => ({ query: vi.fn() }))

vi.mock('../lib/db.js', () => ({ query }))
vi.mock('../lib/cache.js', () => ({ deleteCache: vi.fn() }))
vi.mock('../lib/tenant-timezone.js', () => ({ getSupplierTimezone: vi.fn(() => 'UTC') }))
vi.mock('./supplier-stock.service.js', () => ({
  supplierUsesWarehouseInventory: vi.fn(() => false),
}))
vi.mock('../lib/warehouse-helpers.js', () => ({
  getWarehouseSupplierColumn: vi.fn(() => 'supplier_id'),
}))

import { buildDashboardSummary } from './dashboard-summary.service.js'

describe('supplier dashboard public orders', () => {
  beforeEach(() => {
    query.mockReset()
    query.mockImplementation(async (sql) => {
      const statement = String(sql)
      if (statement.includes('LEFT JOIN restaurant r ON r.id = o.restaurant_id')) {
        return {
          rows: [
            {
              id: 'order-public-1',
              status: 'PLACED',
              total_amount: 24,
              customer_type: 'GUEST',
              restaurant_name: null,
              customer_display_name: 'Guest User',
            },
          ],
        }
      }
      if (statement.includes('FROM product p') && statement.includes('available_qty')) {
        return { rows: [] }
      }
      return { rows: [{}] }
    })
  })

  it('returns guest and consumer orders without requiring a restaurant owner', async () => {
    const summary = await buildDashboardSummary({
      tenantType: 'SUPPLIER',
      tenantId: 'supplier-1',
    })

    expect(summary.recentOrders).toEqual([
      expect.objectContaining({
        id: 'order-public-1',
        customer_type: 'GUEST',
        customer_display_name: 'Guest User',
      }),
    ])
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('LEFT JOIN restaurant r ON r.id = o.restaurant_id')
      )
    ).toBe(true)
  })
})
