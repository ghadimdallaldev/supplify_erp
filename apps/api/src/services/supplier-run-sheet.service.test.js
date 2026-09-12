import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('supplier-run-sheet.service', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('aggregates run sheet sections for a date', async () => {
    vi.doMock('./supplier-command-center.service.js', () => ({
      getSupplierCommandCenter: vi.fn(async () => ({
        kpis: {
          ordersToPrepareToday: 2,
          deliveriesPendingToday: 1,
          ordersWaitingAction: 0,
          unpaidBalance: 500,
          overdueBalance: 100,
          customersDueReorder: 3,
          lowStockCount: 1,
          openDisputes: 0,
          fulfillmentAlerts: 0,
        },
        todaysPriorities: [{ id: 'deliveries', type: 'delivery', title: '1 delivery pending' }],
      })),
    }))
    vi.doMock('./supplier-deliveries.service.js', () => ({
      getSupplierDeliveryBoard: vi.fn(async (_supplierId, filters) => ({
        filters: { date: filters.date },
        orders: [{ orderId: 'o-del', deliveryStatus: 'pending' }],
        stats: { total: 1 },
      })),
    }))
    vi.doMock('./supplier-receivables.service.js', () => ({
      getSupplierReceivables: vi.fn(async () => ({
        invoices: [
          {
            id: 'inv-overdue',
            dueDate: '2026-01-01',
            balanceDue: 100,
            isOverdue: true,
          },
          {
            id: 'inv-today',
            dueDate: '2026-06-17',
            balanceDue: 50,
            isOverdue: false,
          },
          {
            id: 'inv-future',
            dueDate: '2026-07-01',
            balanceDue: 200,
            isOverdue: false,
          },
        ],
      })),
    }))
    vi.doMock('./supplier-reorder-intelligence.service.js', () => ({
      getReorderIntelligence: vi.fn(async () => ({
        customersAtRisk: [
          { restaurantId: 'r1', restaurantName: 'A' },
          { restaurantId: 'r2', restaurantName: 'B' },
          { restaurantId: 'r3', restaurantName: 'C' },
          { restaurantId: 'r4', restaurantName: 'D' },
          { restaurantId: 'r5', restaurantName: 'E' },
          { restaurantId: 'r6', restaurantName: 'F' },
        ],
      })),
    }))
    vi.doMock('../lib/delivery-board-schema.js', () => ({
      getDeliveryBoardSqlFragments: vi.fn(async () => ({
        scheduledAtExpr: 'COALESCE(o.placed_at, o.created_at)',
      })),
    }))
    vi.doMock('../lib/db.js', () => ({
      query: vi.fn(async (sql) => {
        if (/FROM pick_list pl2/i.test(sql)) {
          return {
            rows: [
              {
                order_id: 'o-pick',
                order_status: 'PROCESSING',
                restaurant_name: 'Bistro',
                scheduled_at: '2026-06-17T08:00:00Z',
                pick_list_id: 'pl-1',
                pick_list_status: 'PENDING',
              },
            ],
          }
        }
        if (/COUNT\(\*\)::int AS count/i.test(sql) && /order_fulfillment_issue/i.test(sql)) {
          return { rows: [{ count: 2 }] }
        }
        if (/FROM order_fulfillment_issue fi/i.test(sql) && /LIMIT 5/i.test(sql)) {
          return {
            rows: [
              {
                id: 'fi-1',
                order_id: 'o1',
                issue_type: 'shortage',
                status: 'shortage_reported',
                created_at: '2026-06-16T10:00:00Z',
                restaurant_name: 'Cafe',
                product_name: 'Tomatoes',
              },
            ],
          }
        }
        throw new Error(`Unexpected query: ${sql}`)
      }),
    }))

    const { getSupplierRunSheet } = await import('./supplier-run-sheet.service.js')
    const result = await getSupplierRunSheet('supplier-1', { date: '2026-06-17' })

    expect(result.date).toBe('2026-06-17')
    expect(result.summary.kpis.ordersToPrepareToday).toBe(2)
    expect(result.ordersToPick.count).toBe(1)
    expect(result.ordersToPick.orders[0].pickListId).toBe('pl-1')
    expect(result.deliveries.filters.date).toBe('2026-06-17')
    expect(result.receivablesDueToday.summary.count).toBe(2)
    expect(result.receivablesDueToday.summary.totalBalanceDue).toBe(150)
    expect(result.reorderLeads).toHaveLength(5)
    expect(result.shortages.count).toBe(2)
    expect(result.shortages.preview).toHaveLength(1)
  })

  it('defaults date when not provided', async () => {
    vi.doMock('./supplier-command-center.service.js', () => ({
      getSupplierCommandCenter: vi.fn(async () => ({
        kpis: {},
        todaysPriorities: [],
      })),
    }))
    vi.doMock('./supplier-deliveries.service.js', () => ({
      getSupplierDeliveryBoard: vi.fn(async () => ({
        filters: {},
        orders: [],
        stats: { total: 0 },
      })),
    }))
    vi.doMock('./supplier-receivables.service.js', () => ({
      getSupplierReceivables: vi.fn(async () => ({ invoices: [] })),
    }))
    vi.doMock('./supplier-reorder-intelligence.service.js', () => ({
      getReorderIntelligence: vi.fn(async () => ({ customersAtRisk: [] })),
    }))
    vi.doMock('../lib/delivery-board-schema.js', () => ({
      getDeliveryBoardSqlFragments: vi.fn(async () => ({
        scheduledAtExpr: 'o.created_at',
      })),
    }))
    vi.doMock('../lib/db.js', () => ({
      query: vi.fn(async (sql) => {
        if (/FROM pick_list pl2/i.test(sql)) return { rows: [] }
        if (/COUNT\(\*\)::int AS count/i.test(sql)) return { rows: [{ count: 0 }] }
        if (/LIMIT 5/i.test(sql)) return { rows: [] }
        throw new Error(`Unexpected query: ${sql}`)
      }),
    }))

    const { getSupplierRunSheet } = await import('./supplier-run-sheet.service.js')
    const result = await getSupplierRunSheet('supplier-1')
    expect(result.date).toBe(new Date().toISOString().slice(0, 10))
  })

  it('returns a degraded run sheet when optional sections fail', async () => {
    vi.doMock('./supplier-command-center.service.js', () => ({
      getSupplierCommandCenter: vi.fn(async () => {
        throw new Error('missing optional command center table')
      }),
    }))
    vi.doMock('./supplier-deliveries.service.js', () => ({
      getSupplierDeliveryBoard: vi.fn(async () => {
        throw new Error('missing optional delivery table')
      }),
    }))
    vi.doMock('./supplier-receivables.service.js', () => ({
      getSupplierReceivables: vi.fn(async () => ({
        invoices: [
          {
            id: 'inv-run-date',
            dueDate: '2026-06-17',
            balanceDue: '75',
            isOverdue: false,
          },
          {
            id: 'inv-future',
            dueDate: '2026-06-18',
            balanceDue: '25',
            isOverdue: false,
          },
        ],
      })),
    }))
    vi.doMock('./supplier-reorder-intelligence.service.js', () => ({
      getReorderIntelligence: vi.fn(async () => {
        throw new Error('missing optional reorder table')
      }),
    }))
    vi.doMock('../lib/delivery-board-schema.js', () => ({
      getDeliveryBoardSqlFragments: vi.fn(async () => ({
        scheduledAtExpr: 'o.created_at',
      })),
    }))
    vi.doMock('../lib/logger.js', () => ({
      logger: { warn: vi.fn() },
    }))
    vi.doMock('../lib/db.js', () => ({
      query: vi.fn(async () => {
        throw new Error('missing optional fulfillment issue table')
      }),
    }))

    const { getSupplierRunSheet } = await import('./supplier-run-sheet.service.js')
    const result = await getSupplierRunSheet('supplier-1', { date: '2026-06-17' })

    expect(result.date).toBe('2026-06-17')
    expect(result.summary.kpis.ordersToPrepareToday).toBe(0)
    expect(result.deliveries.orders).toEqual([])
    expect(result.ordersToPick.count).toBe(0)
    expect(result.shortages.preview).toEqual([])
    expect(result.reorderLeads).toEqual([])
    expect(result.receivablesDueToday.summary.count).toBe(1)
    expect(result.receivablesDueToday.summary.totalBalanceDue).toBe(75)
  })
})
