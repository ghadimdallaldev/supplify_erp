import { describe, expect, it } from 'vitest'
import { getPaidActiveSubscriptionCount } from './adminOverview'
import type { AdminOverview } from './adminOverview'

describe('adminOverview', () => {
  const sample: AdminOverview = {
    orders: { today: 2, week: 5, month: 10, total: 100 },
    activeCarts: 3,
    chatsLast24h: 7,
    totalActiveStaff: 4,
    reservations: { today: 1, week: 2, confirmed: 1 },
    tenants: { totalSuppliers: 5, totalRestaurants: 6 },
    totalActiveProducts: 20,
    totalQuickLists: 2,
    revenue: { mrr: 198, arr: 2376, paidActiveSubscriptions: 2, activeSubscriptions: 2 },
    subscriptionStats: { ACTIVE: 3, TRIALING: 1 },
  }

  it('maps card fields from overview payload', () => {
    expect(sample.orders?.today).toBe(2)
    expect(sample.activeCarts).toBe(3)
    expect(sample.chatsLast24h).toBe(7)
    expect(sample.totalActiveStaff).toBe(4)
    expect(sample.reservations?.today).toBe(1)
    expect(sample.totalActiveProducts).toBe(20)
    expect(sample.totalQuickLists).toBe(2)
    expect(sample.orders?.total).toBe(100)
    expect(sample.tenants?.totalSuppliers).toBe(5)
    expect(sample.tenants?.totalRestaurants).toBe(6)
    expect(sample.revenue?.mrr).toBe(198)
  })

  it('prefers paidActiveSubscriptions for Active Subs card', () => {
    expect(getPaidActiveSubscriptionCount(sample)).toBe(2)
    expect(
      getPaidActiveSubscriptionCount({
        revenue: { activeSubscriptions: 5, paidActiveSubscriptions: 2 },
        subscriptionStats: { ACTIVE: 5 },
      })
    ).toBe(2)
  })
})
