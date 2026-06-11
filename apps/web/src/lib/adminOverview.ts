/** Admin dashboard GET /api/admin-dashboard/overview (after envelope unwrap). */
export interface AdminOverview {
  tenantCounts?: Record<string, number>
  subscriptionStats?: Record<string, number>
  revenue?: {
    mrr?: number
    arr?: number
    activeSubscriptions?: number
    paidActiveSubscriptions?: number
    paidActiveOnly?: number
  }
  orders?: {
    today?: number
    week?: number
    month?: number
    total?: number
  }
  activeCarts?: number
  chatsLast24h?: number
  totalActiveStaff?: number
  reservations?: {
    today?: number
    week?: number
    confirmed?: number
  }
  tenants?: {
    totalSuppliers?: number
    newSuppliers7d?: number
    totalRestaurants?: number
    newRestaurants7d?: number
  }
  totalActiveProducts?: number
  totalQuickLists?: number
  alerts?: {
    pastDueSubscriptions?: number
    trialsExpiringSoon?: number
    pendingDealApprovals?: number
    pendingDealPayments?: number
    overdueInvoices?: number
  }
  operational?: {
    emailFailed24h?: number
    emailSkipped24h?: number
    openFulfillmentIssues?: number
    staleGpsDeliveries?: number
    expiredInventoryLots?: number
  }
  activity?: {
    ordersLast24h?: number
    chatsLast24h?: number
  }
  tenantsOverLimit?: number
  tenantsNearLimit?: number
}

/** Primary metric for Active Subs card (paid plans, excludes Free Trial catalog). */
export function getPaidActiveSubscriptionCount(overview?: AdminOverview | null): number {
  const paid = overview?.revenue?.paidActiveSubscriptions
  if (typeof paid === 'number') return paid
  return overview?.revenue?.activeSubscriptions ?? 0
}

export function getTotalTenantCount(overview?: AdminOverview | null): number {
  const suppliers = overview?.tenants?.totalSuppliers ?? 0
  const restaurants = overview?.tenants?.totalRestaurants ?? 0
  return suppliers + restaurants
}

export function getActiveSubscriptionCount(overview?: AdminOverview | null): number {
  const stats = overview?.subscriptionStats ?? {}
  const active = Number(stats.ACTIVE ?? 0)
  const trialing = Number(stats.TRIALING ?? 0)
  return active + trialing
}

export type SystemHealthStatus = 'healthy' | 'degraded' | 'critical'

export function deriveSystemHealth(
  overview?: AdminOverview | null,
  recentErrorCount = 0
): SystemHealthStatus {
  const pastDue = overview?.alerts?.pastDueSubscriptions ?? 0
  const emailFailed = overview?.operational?.emailFailed24h ?? 0
  const fulfillment = overview?.operational?.openFulfillmentIssues ?? 0

  if (recentErrorCount > 0 || pastDue > 0) return 'critical'
  if (emailFailed >= 5 || fulfillment >= 10) return 'degraded'
  return 'healthy'
}

export function formatSystemHealthLabel(status: SystemHealthStatus): string {
  if (status === 'healthy') return 'Healthy'
  if (status === 'degraded') return 'Degraded'
  return 'Critical'
}
