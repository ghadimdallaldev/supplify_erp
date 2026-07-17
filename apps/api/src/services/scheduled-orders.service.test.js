import { describe, it, expect, vi, beforeEach } from 'vitest'
import { executeScheduledOrders, computeNextExecutionDate } from './scheduled-orders.service.js'

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
}))

vi.mock('./notification.service.js', () => ({
  notifyScheduledOrderEvent: vi.fn(),
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
})
