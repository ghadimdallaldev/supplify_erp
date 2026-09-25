import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildOrderSpendTrend, resolvePersonaKpiValue } from './dashboardShared'

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

describe('resolvePersonaKpiValue', () => {
  const formatMoney = (amount: number) => `$${amount}`

  it('uses role-specific metrics instead of all-time totals', () => {
    const stats = {
      totalRevenue: 9000,
      totalOrders: 40,
      pendingOrders: 8,
      totalRestaurants: 12,
      ordersToday: 3,
      outstandingBalance: 250,
      overdueAccountCount: 2,
      debtorCount: 4,
      assignedDeliveries: 5,
      deliveriesInProgress: 1,
      spendLast30Days: 600,
      invoiceSpendLast30Days: 180,
      billedOrderCount: 7,
    }

    expect(resolvePersonaKpiValue('supplier_owner', 'revenue', stats, formatMoney, '$0')).toBe(
      undefined
    )
    expect(resolvePersonaKpiValue('supplier_warehouse', 'orders', stats, formatMoney, '$0')).toBe(3)
    expect(resolvePersonaKpiValue('supplier_accountant', 'revenue', stats, formatMoney, '$0')).toBe(
      '$250'
    )
    expect(resolvePersonaKpiValue('supplier_accountant', 'pending', stats, formatMoney, '$0')).toBe(
      2
    )
    expect(resolvePersonaKpiValue('supplier_fulfillment', 'orders', stats, formatMoney, '$0')).toBe(
      5
    )
    expect(resolvePersonaKpiValue('restaurant_manager', 'revenue', stats, formatMoney, '$0')).toBe(
      '$600'
    )
    expect(
      resolvePersonaKpiValue('restaurant_accountant', 'orders', stats, formatMoney, '$0')
    ).toBe(7)
  })
})
