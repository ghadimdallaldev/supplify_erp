import { describe, expect, it } from 'vitest'
import {
  getPaidActiveSubscriptionCount,
  getTotalTenantCount,
  getActiveSubscriptionCount,
  deriveSystemHealth,
} from './adminOverview'
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

  it('computes total tenant count', () => {
    expect(getTotalTenantCount(sample)).toBe(11)
  })

  it('computes active subscription count', () => {
    expect(getActiveSubscriptionCount(sample)).toBe(4)
  })

  it('derives system health from errors and alerts', () => {
    expect(deriveSystemHealth(sample, 0)).toBe('healthy')
    expect(deriveSystemHealth({ alerts: { pastDueSubscriptions: 1 } }, 0)).toBe('critical')
    expect(deriveSystemHealth({ operational: { emailFailed24h: 6 } }, 0)).toBe('degraded')
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

  it('accepts tenantsOverLimit and tenantsNearLimit from overview', () => {
    const withLimits: AdminOverview = {
      ...sample,
      tenantsOverLimit: 3,
      tenantsNearLimit: 7,
    }
    expect(withLimits.tenantsOverLimit).toBe(3)
    expect(withLimits.tenantsNearLimit).toBe(7)
  })
})
