import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildOrderSpendTrend } from './dashboardShared'

describe('buildOrderSpendTrend', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-18T12:00:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('aggregates spend only within the requested day window', () => {
    const orders = [
      { created_at: '2026-06-17T10:00:00', total_amount: 100 },
      { created_at: '2026-06-01T10:00:00', total_amount: 50 },
      { created_at: '2026-04-01T10:00:00', total_amount: 200 },
    ]

    expect(buildOrderSpendTrend(orders, 7).reduce((sum, p) => sum + p.value, 0)).toBe(100)
    expect(buildOrderSpendTrend(orders, 30).reduce((sum, p) => sum + p.value, 0)).toBe(150)
    expect(buildOrderSpendTrend(orders, 90).reduce((sum, p) => sum + p.value, 0)).toBe(350)
  })

  it('defaults to 30 days when no period is provided', () => {
    const orders = [
      { created_at: '2026-06-17T10:00:00', total_amount: 100 },
      { created_at: '2026-06-01T10:00:00', total_amount: 50 },
      { created_at: '2026-04-01T10:00:00', total_amount: 200 },
    ]

    expect(buildOrderSpendTrend(orders).reduce((sum, p) => sum + p.value, 0)).toBe(150)
  })
})
