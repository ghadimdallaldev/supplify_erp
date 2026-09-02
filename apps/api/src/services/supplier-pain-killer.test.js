import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/db.js', () => {
  const queryMock = vi.fn()
  return {
    query: queryMock,
    migrationQuery: queryMock,
    pool: { query: queryMock },
    withTransaction: vi.fn(),
  }
})

vi.mock('../lib/ensure-delivery-schema.js', () => ({
  ensureDeliverySchema: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../lib/subscription.js', () => ({
  checkLimit: vi.fn().mockResolvedValue({
    isUnlimited: true,
    current: 0,
    isOverLimit: false,
  }),
  isFeatureEnabled: vi.fn().mockResolvedValue(false),
}))

vi.mock('../lib/cache.js', () => ({
  getCache: vi.fn().mockResolvedValue(null),
  setCache: vi.fn().mockResolvedValue(undefined),
  deleteCache: vi.fn().mockResolvedValue(undefined),
}))

describe('supplier pain-killer services', () => {
  let db

  beforeEach(async () => {
    vi.clearAllMocks()
    db = await import('../lib/db.js')
    vi.mocked(db.query).mockReset()
  })

  describe('previewProductImport', () => {
    it('validates rows and previews errors', async () => {
      const { previewProductImport } = await import('./product-import.service.js')
      const csv = `name,sku,price
,SKU1,10
Valid Product,SKU2,abc`
      const result = previewProductImport(csv)
      expect(result.totalRows).toBe(2)
      expect(result.validCount).toBe(0)
      expect(result.errorCount).toBeGreaterThan(0)
      expect(result.preview.some((p) => p.status === 'error')).toBe(true)
    })
  })

  describe('executeProductImport', () => {
    it('batch-persists valid rows in a transaction', async () => {
      const clientQuery = vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: 'prod-1', sku: 'sku1' }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 2 })

      db.withTransaction.mockImplementation(async (fn) => fn({ query: clientQuery }))
      db.query.mockResolvedValueOnce({
        rows: [{ id: 'prod-2', sku: 'sku2' }],
      })

      const { executeProductImport } = await import('./product-import.service.js')
      const csv = `name,sku,price,stock
New Product,SKU1,10,5
Updated Product,SKU2,20,3`
      const result = await executeProductImport('supplier-1', csv, { partial: true })

      expect(result.summary.created).toBe(1)
      expect(result.summary.updated).toBe(1)
      expect(db.withTransaction).toHaveBeenCalledTimes(1)
      expect(clientQuery).toHaveBeenCalledTimes(4)
    })
  })

  describe('getReorderIntelligence', () => {
    it('detects due customers from order cadence', async () => {
      db.query.mockResolvedValueOnce({
        rows: [
          {
            restaurant_id: 'r1',
            restaurant_name: 'Cafe One',
            order_count: 5,
            last_order_at: new Date(Date.now() - 30 * 86400000),
            avg_days_between: '7',
          },
        ],
      })
      db.query.mockResolvedValueOnce({
        rows: [
          {
            restaurant_id: 'r1',
            product_id: 'p1',
            product_name: 'Milk',
            sku: 'M1',
            total_qty: '10',
            order_count: 3,
          },
        ],
      })

      const { getReorderIntelligence } = await import('./supplier-reorder-intelligence.service.js')
      const data = await getReorderIntelligence('supplier-1')
      expect(data.dueCount).toBe(1)
      expect(data.customersAtRisk[0].restaurantName).toBe('Cafe One')
      expect(data.customersAtRisk[0].suggestedProducts.length).toBeGreaterThan(0)
    })
  })

  describe('createReorderReminderDraft', () => {
    it('creates draft without auto-send', async () => {
      db.query.mockResolvedValueOnce({
        rows: [
          {
            restaurant_id: 'r1',
            restaurant_name: 'Cafe',
            order_count: 4,
            last_order_at: new Date(Date.now() - 20 * 86400000),
            avg_days_between: '7',
          },
        ],
      })
      db.query.mockResolvedValueOnce({ rows: [] })
      db.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'draft-1',
            status: 'draft',
            subject: 'Reorder',
            body: 'Hello',
          },
        ],
      })

      const { createReorderReminderDraft } = await import(
        './supplier-reorder-intelligence.service.js'
      )
      const draft = await createReorderReminderDraft('supplier-1', 'r1', 'user-1')
      expect(draft.autoSent).toBe(false)
      expect(draft.status).toBe('draft')
    })
  })

  describe('getSupplierReceivables', () => {
    it('returns unpaid and aging buckets', async () => {
      const summaryRow = {
        unpaid_count: 1,
        unpaid_total: '100',
        overdue_total: '100',
        partial_count: 0,
        aging_current: '0',
        aging_0_7: '100',
        aging_8_30: '0',
        aging_31_60: '0',
        aging_60_plus: '0',
      }
      const invoiceRow = {
        id: 'inv1',
        invoice_number: 'INV-1',
        restaurant_id: 'r1',
        restaurant_name: 'Cafe',
        status: 'ISSUED',
        invoice_date: '2026-01-01',
        due_date: '2026-01-15',
        total_amount: '100',
        paid_amount: '0',
        balance_due: '100',
        is_overdue: true,
        days_overdue: 10,
      }
      db.query
        .mockResolvedValueOnce({ rows: [summaryRow] })
        .mockResolvedValueOnce({ rows: [invoiceRow] })
        .mockResolvedValueOnce({
          rows: [
            {
              restaurant_id: 'r1',
              restaurant_name: 'Cafe',
              balance_due: '100',
              invoice_count: 1,
              oldest_due_date: '2026-01-15',
            },
          ],
        })

      const { getSupplierReceivables } = await import('./supplier-receivables.service.js')
      const data = await getSupplierReceivables('supplier-1')
      expect(data.summary.unpaidCount).toBe(1)
      expect(data.summary.unpaidTotal).toBe(100)
      expect(data.aging).toBeDefined()
      expect(data.topDebtors).toHaveLength(1)
    })
  })

  describe('getSupplierCommandCenter', () => {
    it('returns priority KPI cards', async () => {
      const count = (n) => ({ rows: [{ count: n }] })
      db.query.mockImplementation(async (sql) => {
        if (/date_trunc\('day', now\(\)\)/i.test(sql) && /COUNT\(DISTINCT o\.id\)/i.test(sql)) {
          return count(3)
        }
        if (
          /driver_assignments da/i.test(sql) &&
          /COUNT\(DISTINCT o\.id\)/i.test(sql) &&
          !/failed_at/i.test(sql)
        ) {
          return count(2)
        }
        if (/PLACED.*PENDING_APPROVAL/i.test(sql) && /COUNT\(DISTINCT o\.id\)/i.test(sql)) {
          return count(1)
        }
        if (/FROM product p/i.test(sql) && /low_stock_threshold/i.test(sql)) {
          return { rows: [] }
        }
        if (/FROM disputes d/i.test(sql)) {
          return count(0)
        }
        if (/FROM fulfillment_exceptions fe/i.test(sql)) {
          return count(0)
        }
        if (/unpaid_count/i.test(sql)) {
          return {
            rows: [
              {
                unpaid_count: 1,
                unpaid_total: '100',
                overdue_total: '0',
                partial_count: 0,
                aging_current: '100',
                aging_0_7: '0',
                aging_8_30: '0',
                aging_31_60: '0',
                aging_60_plus: '0',
              },
            ],
          }
        }
        if (/FROM invoice i/i.test(sql) && /balance_due/i.test(sql)) {
          return {
            rows: [
              {
                id: 'inv1',
                invoice_number: 'INV-1',
                restaurant_id: 'r1',
                restaurant_name: 'Cafe',
                status: 'ISSUED',
                invoice_date: '2026-05-01',
                due_date: '2026-05-10',
                total_amount: '100',
                paid_amount: '0',
                balance_due: '100',
                is_overdue: false,
                days_overdue: 0,
              },
            ],
          }
        }
        if (/GROUP BY i\.restaurant_id/i.test(sql)) {
          return {
            rows: [
              {
                restaurant_id: 'r1',
                restaurant_name: 'Cafe',
                balance_due: '100',
                invoice_count: 1,
                oldest_due_date: '2026-05-10',
              },
            ],
          }
        }
        if (/WITH restaurant_orders AS/i.test(sql) || /WITH ranked AS/i.test(sql)) {
          return { rows: [] }
        }
        if (/FROM deal_promotions dp/i.test(sql)) {
          return { rows: [{ active_deals: 1, total_views: 5, total_clicks: 2 }] }
        }
        if (/FROM driver_assignments da/i.test(sql) && /failed_at/i.test(sql)) {
          return count(0)
        }
        if (/FROM driver_assignments da/i.test(sql)) {
          return { rows: [] }
        }
        if (/DISTINCT ON \(o\.id\)/i.test(sql)) {
          return { rows: [] }
        }
        return { rows: [] }
      })

      const { getSupplierCommandCenter } = await import('./supplier-command-center.service.js')
      const data = await getSupplierCommandCenter('supplier-1')
      expect(data.kpis.ordersToPrepareToday).toBe(3)
      expect(data.kpis.deliveriesPendingToday).toBe(2)
      expect(Array.isArray(data.todaysPriorities)).toBe(true)
      expect(data.previews.deliveryGpsSummary).toMatchObject({
        active: expect.any(Number),
        live: expect.any(Number),
        stale: expect.any(Number),
        noGps: expect.any(Number),
        failed: expect.any(Number),
      })
    })
  })

  describe('getSupplierDeliveryBoard', () => {
    it('groups orders by delivery area', async () => {
      vi.mocked(db.query).mockReset()
      const { resetDeliveryBoardSqlCacheForTests } = await import('../lib/delivery-board-schema.js')
      resetDeliveryBoardSqlCacheForTests()
      db.query
        .mockResolvedValueOnce({
          rows: [
            { table_name: 'customer_order', column_name: 'placed_at' },
            { table_name: 'customer_order', column_name: 'branch_id' },
            { table_name: 'delivery_zone', column_name: 'warehouse_id' },
            { table_name: 'delivery_zone', column_name: 'supplier_id' },
            { table_name: 'delivery_zone', column_name: 'name' },
            { table_name: 'restaurant', column_name: 'address_json' },
            { table_name: 'restaurant', column_name: 'delivery_latitude' },
            { table_name: 'restaurant', column_name: 'delivery_longitude' },
            { table_name: 'restaurant', column_name: 'delivery_location_label' },
            { table_name: 'branch', column_name: 'delivery_latitude' },
            { table_name: 'branch', column_name: 'delivery_longitude' },
            { table_name: 'branch', column_name: 'delivery_location_label' },
            { table_name: 'drivers', column_name: 'full_name' },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            { table_name: 'proof_of_delivery' },
            { table_name: 'order_warehouse_assignment' },
            { table_name: 'delivery_zone' },
            { table_name: 'branch' },
            { table_name: 'driver_assignments' },
            { table_name: 'drivers' },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              order_id: 'o1',
              order_status: 'PROCESSING',
              restaurant_name: 'A',
              delivery_area: 'Downtown',
              assignment_id: null,
              delivery_status: 'pending',
              driver_id: null,
              driver_name: null,
              has_pod: false,
              scheduled_at: new Date(),
              destination_latitude: null,
              destination_longitude: null,
              destination_label: 'A',
            },
            {
              order_id: 'o2',
              order_status: 'SHIPPED',
              restaurant_name: 'B',
              delivery_area: 'Downtown',
              assignment_id: 'da1',
              delivery_status: 'out_for_delivery',
              driver_id: 'd1',
              driver_name: 'Driver',
              has_pod: false,
              scheduled_at: new Date(),
              destination_latitude: null,
              destination_longitude: null,
              destination_label: 'B',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })

      const { getSupplierDeliveryBoard } = await import('./supplier-deliveries.service.js')
      const board = await getSupplierDeliveryBoard('supplier-1')
      expect(board.orders.length).toBe(2)
      expect(board.stats.total).toBe(2)
      expect(board.routeSummary.some((r) => r.area === 'Downtown')).toBe(true)
      for (const order of board.orders) {
        expect(order).toHaveProperty('tracking')
        expect(order.tracking).toMatchObject({
          enabled: expect.any(Boolean),
          hasLocation: expect.any(Boolean),
        })
      }
    })
  })
})
