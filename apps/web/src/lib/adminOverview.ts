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
  activity?: {
    ordersLast24h?: number
    chatsLast24h?: number
  }
}

/** Primary metric for Active Subs card (paid plans, excludes Free Trial catalog). */
export function getPaidActiveSubscriptionCount(overview?: AdminOverview | null): number {
  const paid = overview?.revenue?.paidActiveSubscriptions
  if (typeof paid === 'number') return paid
  return overview?.revenue?.activeSubscriptions ?? 0
}
