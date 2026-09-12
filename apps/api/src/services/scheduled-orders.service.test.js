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
  it('returns zero when no lists are due', async () => {
    clientQueryMock.mockResolvedValueOnce({ rows: [] })

    const result = await executeScheduledOrders()

    expect(result).toEqual({ executed: 0, errors: 0, skipped: 0 })
  })

  it('skips lists that already have a ledger row for today', async () => {
    const list = dueQuickList()
    clientQueryMock
      .mockResolvedValueOnce({ rows: [list] })
      .mockResolvedValueOnce({ rows: [{ today_date: '2026-06-01' }] })
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
      .mockResolvedValueOnce({ rows: [{ today_date: '2026-06-01' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'ledger-1' }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })

    const { notifyScheduledOrderEvent } = await import('./notification.service.js')
    const result = await executeScheduledOrders()

    expect(result.executed).toBe(1)
    expect(notifyScheduledOrderEvent).toHaveBeenCalledWith(list, 'REMINDER')
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
})
