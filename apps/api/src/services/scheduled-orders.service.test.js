import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  executeScheduledOrders,
  computeNextExecutionDate,
  createOrderFromQuickList,
} from './scheduled-orders.service.js'

const clientQueryMock = vi.fn()

vi.mock('../lib/db.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(async (handler) =>
    handler({ query: (...args) => clientQueryMock(...args) })
  ),
  withSavepoint: vi.fn(async (client, fn) => {
    await client.query('SAVEPOINT sp_test')
    try {
      const result = await fn()
      await client.query('RELEASE SAVEPOINT sp_test')
      return result
    } catch (error) {
      await client.query('ROLLBACK TO SAVEPOINT sp_test')
      throw error
    }
  }),
}))

vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../lib/subscription.js', () => ({
  evaluateScheduledOrderLimit: vi.fn().mockResolvedValue({ allowed: true }),
  incrementUsage: vi.fn(),
  isFeatureEnabled: vi.fn().mockResolvedValue(false),
}))

vi.mock('./notification.service.js', () => ({
  notifyScheduledOrderEvent: vi.fn(),
  notifyOrderStatusChange: vi.fn(),
}))

vi.mock('./quick-list-ai.service.js', () => ({
  applySmartQuantitiesToItems: vi.fn(async (_restaurantId, _list, items) => ({
    items,
    adjustments: null,
  })),
}))

vi.mock('./resolve-product-price.service.js', () => ({
  resolveProductPricesBatch: vi.fn(),
}))

vi.mock('./supplier-order-stock.service.js', () => ({
  reserveStockForPlacedOrder: vi.fn(),
}))

function dueQuickList(overrides = {}) {
  return {
    id: 'ql-1',
    restaurant_id: 'rest-1',
    name: 'Weekly produce',
    auto_create_order: false,
    frequency: 'WEEKLY',
    days_of_week: null,
    schedule_timezone: 'UTC',
    local_today: '2026-06-01',
    ...overrides,
  }
}

describe('computeNextExecutionDate', () => {
  it('advances daily frequency by one UTC day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T12:00:00Z'))
    const next = computeNextExecutionDate({ frequency: 'DAILY' })
    expect(next).toBe('2026-06-02')
    vi.useRealTimers()
  })

  it('advances from the restaurant-local calendar day, not the UTC day (UTC+3)', () => {
    vi.useFakeTimers()
    // 22:30 UTC on Jun 1 is already 01:30 on Jun 2 in Riyadh (UTC+3, no DST).
    vi.setSystemTime(new Date('2026-06-01T22:30:00Z'))
    expect(computeNextExecutionDate({ frequency: 'DAILY' })).toBe('2026-06-02')
    expect(computeNextExecutionDate({ frequency: 'DAILY' }, 'Asia/Riyadh')).toBe('2026-06-03')
    expect(computeNextExecutionDate({ frequency: 'WEEKLY' }, 'Asia/Riyadh')).toBe('2026-06-09')
    vi.useRealTimers()
  })

  it('reads the timezone from the due-list row (schedule_timezone)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T22:30:00Z'))
    expect(computeNextExecutionDate({ frequency: 'DAILY', schedule_timezone: 'Asia/Riyadh' })).toBe(
      '2026-06-03'
    )
    vi.useRealTimers()
  })

  it('picks the next scheduled weekday in the local timezone', () => {
    vi.useFakeTimers()
    // UTC says Monday Jun 1; Riyadh already says Tuesday Jun 2, so next MONDAY/THURSDAY is Thursday.
    vi.setSystemTime(new Date('2026-06-01T22:30:00Z'))
    const list = { frequency: 'WEEKLY_3X', days_of_week: ['MONDAY', 'THURSDAY'] }
    expect(computeNextExecutionDate(list)).toBe('2026-06-04')
    expect(computeNextExecutionDate(list, 'Asia/Riyadh')).toBe('2026-06-04')
    const tuesdayOnly = { frequency: 'WEEKLY_3X', days_of_week: ['TUESDAY'] }
    // From local Tuesday the next Tuesday is a week away; from UTC Monday it is tomorrow.
    expect(computeNextExecutionDate(tuesdayOnly)).toBe('2026-06-02')
    expect(computeNextExecutionDate(tuesdayOnly, 'Asia/Riyadh')).toBe('2026-06-09')
    vi.useRealTimers()
  })
})

describe('executeScheduledOrders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clientQueryMock.mockReset()
  })

  it('excludes billing-locked restaurants from the due-list scan', async () => {
    clientQueryMock.mockResolvedValueOnce({ rows: [] })

    await executeScheduledOrders()

    expect(String(clientQueryMock.mock.calls[0][0])).toContain('sub.account_locked_at IS NOT NULL')
    expect(String(clientQueryMock.mock.calls[0][0])).toContain(
      "sub.status IN ('TRIALING', 'ACTIVE', 'PAST_DUE')"
    )
  })
  it('compares next_execution_date and preferred_time in the restaurant timezone, not UTC (B14)', async () => {
    clientQueryMock.mockResolvedValueOnce({ rows: [] })

    await executeScheduledOrders()

    const [sql, params] = clientQueryMock.mock.calls[0]
    const text = String(sql)
    expect(text).not.toContain("AT TIME ZONE 'UTC'")
    expect(text).toContain("NULLIF(TRIM(r.timezone), '')")
    expect(text).toContain('::time')
    // [batch size, platform default timezone used when restaurant.timezone is empty]
    expect(params[0]).toBe(50)
    expect(typeof params[1]).toBe('string')
    expect(params[1].length).toBeGreaterThan(0)
  })

  it('records the ledger and next run on the restaurant-local date (UTC+3)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T22:30:00Z'))
    // Due list as the SQL returns it: it is already 2026-06-02 in the restaurant's timezone.
    const list = dueQuickList({
      schedule_timezone: 'Asia/Riyadh',
      local_today: '2026-06-02',
      preferred_time: '01:00:00',
      frequency: 'DAILY',
    })
    const statements = []
    clientQueryMock.mockImplementation(async (sql, params) => {
      const text = String(sql)
      statements.push({ text, params })
      if (text.includes('FROM quick_list ql')) {
        return {
          rows:
            statements.filter((s) => s.text.includes('FROM quick_list ql')).length > 1
              ? []
              : [list],
        }
      }
      if (text.includes('INSERT INTO quick_list_execution')) return { rows: [{ id: 'ledger-1' }] }
      return { rows: [], rowCount: 1 }
    })

    await executeScheduledOrders()
    vi.useRealTimers()

    const ledger = statements.find((s) => s.text.includes('INSERT INTO quick_list_execution'))
    expect(ledger.params[2]).toBe('2026-06-02')
    const advance = statements.find(
      (s) => s.text.includes('UPDATE quick_list') && s.text.includes('next_execution_date')
    )
    // next run = local tomorrow (Jun 3), last run = local today (Jun 2)
    expect(advance.params.slice(0, 2)).toEqual(['2026-06-03', '2026-06-02'])
  })

  it('returns zero when no lists are due', async () => {
    clientQueryMock.mockResolvedValueOnce({ rows: [] })

    const result = await executeScheduledOrders()

    expect(result).toEqual({ executed: 0, errors: 0, skipped: 0 })
  })

  it('skips lists that already have a ledger row for today', async () => {
    const list = dueQuickList()
    clientQueryMock
      .mockResolvedValueOnce({ rows: [list] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rowCount: 1 })

    const result = await executeScheduledOrders()

    expect(result.skipped).toBe(1)
    expect(result.executed).toBe(0)
  })

  it('processes reminder lists and records ledger outcome', async () => {
    const list = dueQuickList()
    clientQueryMock
      .mockResolvedValueOnce({ rows: [list] })
      .mockResolvedValueOnce({ rows: [{ id: 'ledger-1' }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })

    const { notifyScheduledOrderEvent } = await import('./notification.service.js')
    const result = await executeScheduledOrders()

    expect(result.executed).toBe(1)
    expect(notifyScheduledOrderEvent).toHaveBeenCalledWith(list, 'REMINDER')
  })

  it('isolates a failing auto-create list in a savepoint and still records its ledger outcome', async () => {
    const failing = dueQuickList({ id: 'ql-bad', auto_create_order: true })
    const reminder = dueQuickList({ id: 'ql-ok', auto_create_order: false })
    const statements = []
    const ledgerOutcomes = []
    clientQueryMock.mockImplementation(async (sql, params) => {
      const text = String(sql).trim()
      statements.push(text.split(String.fromCharCode(10))[0].trim())
      if (text.includes('FROM quick_list') && text.includes('LIMIT')) {
        return {
          rows:
            statements.filter((q) => q.startsWith('SELECT')).length <= 1 ? [failing, reminder] : [],
        }
      }
      if (text.includes('INSERT INTO quick_list_execution')) {
        return { rows: [{ id: 'ledger-' + params[0] }] }
      }
      if (text.includes('UPDATE quick_list_execution')) {
        ledgerOutcomes.push(params[0])
        return { rowCount: 1 }
      }
      if (text.includes('FROM quick_list_item')) throw new Error('relation does not exist')
      return { rows: [], rowCount: 1 }
    })

    const result = await executeScheduledOrders()

    expect(statements).toContain('SAVEPOINT sp_test')
    expect(statements).toContain('ROLLBACK TO SAVEPOINT sp_test')
    expect(ledgerOutcomes).toEqual(['failed', 'reminder'])
    expect(result.errors).toBe(1)
    expect(result.executed).toBe(1)
  })

  it('propagates database errors from the due-list query', async () => {
    clientQueryMock.mockRejectedValueOnce(new Error('Database error'))

    await expect(executeScheduledOrders()).rejects.toThrow('Database error')
  })

  it('uses contract unit price (not catalog) when creating scheduled orders', async () => {
    const { resolveProductPricesBatch } = await import('./resolve-product-price.service.js')
    vi.mocked(resolveProductPricesBatch).mockResolvedValueOnce([
      {
        productId: 'prod-1',
        supplierId: 'sup-1',
        quantity: 2,
        unitPrice: 7.5,
        source: 'CONTRACT_PRICE',
        defaultPrice: 12,
        contractPriceId: 'cp-1',
        quoteResponseItemId: null,
        discountPercent: null,
        validFrom: null,
        validUntil: null,
        currency: 'USD',
        minOrderQuantity: null,
      },
    ])

    const q = vi
      .fn()
      // quick list items
      .mockResolvedValueOnce({
        rows: [
          {
            product_id: 'prod-1',
            supplier_id: 'sup-1',
            quantity: 2,
            notes: '',
          },
        ],
      })
      // product existence
      .mockResolvedValueOnce({ rows: [{ id: 'prod-1', sku: 'SKU-1' }] })
      // insert order
      .mockResolvedValueOnce({
        rows: [{ id: 'ord-1', restaurant_id: 'rest-1', total_amount: 15 }],
      })
      // insert order item
      .mockResolvedValueOnce({
        rows: [{ id: 'oi-1', product_id: 'prod-1', unit_price: 7.5 }],
      })
      // supplier row
      .mockResolvedValueOnce({ rows: [{ id: 'sup-1' }] })

    const result = await createOrderFromQuickList(
      { id: 'ql-1', restaurant_id: 'rest-1' },
      { query: q }
    )

    expect(resolveProductPricesBatch).toHaveBeenCalledWith(
      {
        restaurantId: 'rest-1',
        items: [{ productId: 'prod-1', supplierId: 'sup-1', quantity: 2 }],
      },
      expect.any(Function)
    )

    const orderItemInsert = q.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('INSERT INTO order_item')
    )
    expect(orderItemInsert?.[1]).toEqual([
      'ord-1',
      'prod-1',
      'sup-1',
      2,
      7.5,
      15,
      '',
      'CONTRACT_PRICE',
      'cp-1',
      12,
    ])
    expect(result.orders).toHaveLength(1)
    expect(result.orders[0].total_amount).toBe(15)
  })

  it('reserves legacy stock for scheduled orders like every other placement path (B6c)', async () => {
    const { resolveProductPricesBatch } = await import('./resolve-product-price.service.js')
    const { reserveStockForPlacedOrder } = await import('./supplier-order-stock.service.js')
    vi.mocked(resolveProductPricesBatch).mockResolvedValueOnce([
      {
        productId: 'prod-1',
        supplierId: 'sup-1',
        quantity: 2,
        unitPrice: 7.5,
        source: 'DEFAULT_PRICE',
        defaultPrice: 7.5,
        contractPriceId: null,
      },
    ])
    const q = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ product_id: 'prod-1', supplier_id: 'sup-1', quantity: 2, notes: '' }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'prod-1', sku: 'SKU-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'ord-1', restaurant_id: 'rest-1', total_amount: 15 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'oi-1', product_id: 'prod-1', unit_price: 7.5 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'sup-1' }] })

    await createOrderFromQuickList({ id: 'ql-1', restaurant_id: 'rest-1' }, { query: q })

    const args = vi.mocked(reserveStockForPlacedOrder).mock.calls.at(-1)[1]
    expect(args.reserveLegacy).toBe(true)
    expect(args.legacyLineItems).toEqual([
      expect.objectContaining({ productId: 'prod-1', quantity: 2, reserve: true }),
    ])
  })
})
