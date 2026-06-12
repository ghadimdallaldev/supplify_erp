import { query } from './db.js'
import { logger } from './logger.js'
import { config } from '../config/env.js'
import {
  buildAdminOperationalOverviewCounters,
  getAiPlatformConfigSummary,
  getAiReorderMetrics,
} from './admin-operational-metrics.js'
import { buildTenantLimitOverviewCounts } from './admin-tenant-usage-metrics.js'

const PAID_PLAN_EXCLUDE = `LOWER(sp.code) NOT IN ('free', 'enterprise')`

/**
 * Run a metrics SQL query; on failure log and return fallback (does not abort other metrics).
 * @template T
 * @param {string} name
 * @param {string} sql
 * @param {T} fallback
 * @param {unknown[]} [params]
 * @returns {Promise<T>}
 */
export async function safeOverviewQuery(name, sql, fallback, params = []) {
  try {
    const { rows } = await query(sql, params)
    if (config.ADMIN_OVERVIEW_DEBUG) {
      logger.debug({ metric: name, rows }, 'admin overview metric')
    }
    return rows
  } catch (error) {
    logger.warn(
      { metric: name, code: error.code, message: error.message },
      'admin overview metric query failed'
    )
    return fallback
  }
}

/**
 * Build admin dashboard overview metrics (resilient per-query; partial data on single query failure).
 * @returns {Promise<Record<string, unknown>>}
 */
export async function buildAdminOverviewMetrics() {
  const [
    tenantCountsRows,
    subscriptionStatsRows,
    revenueRows,
    orderStatsRows,
    cartStatsRows,
    chatStatsRows,
    staffStatsRows,
    reservationStatsRows,
    supplierStatsRows,
    restaurantStatsRows,
    productStatsRows,
    quickListStatsRows,
    alertStatsRows,
    trialExpStatsRows,
    pendingDealStatsRows,
    pendingPaymentDealStatsRows,
    overdueInvoiceStatsRows,
  ] = await Promise.all([
    safeOverviewQuery(
      'tenantCounts',
      `SELECT tenant_type, COUNT(*)::int AS count
       FROM subscription WHERE status IN ('ACTIVE','TRIALING')
       GROUP BY tenant_type`,
      []
    ),
    safeOverviewQuery(
      'subscriptionStats',
      `SELECT status, COUNT(*)::int AS count FROM subscription GROUP BY status`,
      []
    ),
    safeOverviewQuery(
      'revenue',
      `SELECT
         COALESCE(SUM(
           CASE
             WHEN s.billing_cycle = 'YEARLY' AND COALESCE(sp.price_per_year, 0) > 0
               THEN sp.price_per_year / 12.0
             ELSE sp.price_per_month
           END
         ), 0)::float AS mrr,
         COUNT(*) FILTER (WHERE ${PAID_PLAN_EXCLUDE})::int AS paid_active_subscriptions,
         COUNT(*) FILTER (WHERE s.status = 'ACTIVE' AND ${PAID_PLAN_EXCLUDE})::int AS paid_active_only
       FROM subscription s
       JOIN subscription_plan sp ON sp.id = s.plan_id
       WHERE s.status IN ('ACTIVE', 'TRIALING')
         AND ${PAID_PLAN_EXCLUDE}
         AND COALESCE(sp.price_per_month, 0) > 0`,
      [{ mrr: 0, paid_active_subscriptions: 0, paid_active_only: 0 }]
    ),
    safeOverviewQuery(
      'orders',
      `SELECT
         COUNT(*) FILTER (
           WHERE status NOT IN ('DRAFT','CANCELLED')
             AND DATE(COALESCE(placed_at, created_at)) = CURRENT_DATE
         )::int AS today,
         COUNT(*) FILTER (
           WHERE status NOT IN ('DRAFT','CANCELLED')
             AND COALESCE(placed_at, created_at) >= NOW() - INTERVAL '7 days'
         )::int AS week,
         COUNT(*) FILTER (
           WHERE status NOT IN ('DRAFT','CANCELLED')
             AND COALESCE(placed_at, created_at) >= NOW() - INTERVAL '30 days'
         )::int AS month,
         COUNT(*) FILTER (WHERE status NOT IN ('DRAFT','CANCELLED'))::int AS total
       FROM customer_order`,
      [{ today: 0, week: 0, month: 0, total: 0 }]
    ),
    safeOverviewQuery(
      'activeCarts',
      `SELECT COUNT(DISTINCT co.id)::int AS count
       FROM customer_order co
       INNER JOIN order_item oi ON oi.order_id = co.id
       WHERE co.status = 'DRAFT'`,
      [{ count: 0 }]
    ),
    safeOverviewQuery(
      'chatsLast24h',
      `SELECT COUNT(*)::int AS count
       FROM message
       WHERE created_at >= NOW() - INTERVAL '24 hours'`,
      [{ count: 0 }]
    ),
    safeOverviewQuery(
      'activeStaff',
      `SELECT (
         (SELECT COUNT(*)::int FROM staff_member WHERE status = 'ACTIVE')
         + (SELECT COUNT(*)::int FROM restaurant_team)
       ) AS count`,
      [{ count: 0 }]
    ),
    safeOverviewQuery(
      'reservations',
      `SELECT
         COUNT(*) FILTER (WHERE scheduled_at::date = CURRENT_DATE)::int AS today,
         COUNT(*) FILTER (WHERE scheduled_at >= NOW() - INTERVAL '7 days')::int AS week,
         COUNT(*) FILTER (WHERE status IN ('CONFIRMED','SEATED'))::int AS confirmed
       FROM reservation`,
      [{ today: 0, week: 0, confirmed: 0 }]
    ),
    safeOverviewQuery(
      'suppliers',
      `SELECT
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS new_suppliers,
         COUNT(*)::int AS count
       FROM supplier`,
      [{ new_suppliers: 0, count: 0 }]
    ),
    safeOverviewQuery(
      'restaurants',
      `SELECT
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS new_restaurants,
         COUNT(*)::int AS count
       FROM restaurant`,
      [{ new_restaurants: 0, count: 0 }]
    ),
    safeOverviewQuery('activeProducts', `SELECT COUNT(*)::int AS count FROM product`, [
      { count: 0 },
    ]),
    safeOverviewQuery('quickLists', `SELECT COUNT(*)::int AS count FROM quick_list`, [
      { count: 0 },
    ]),
    safeOverviewQuery(
      'pastDueSubscriptions',
      `SELECT COUNT(*)::int AS count FROM subscription WHERE status = 'PAST_DUE'`,
      [{ count: 0 }]
    ),
    safeOverviewQuery(
      'trialsExpiringSoon',
      `SELECT COUNT(*)::int AS count
       FROM subscription
       WHERE status = 'TRIALING'
         AND trial_ends_at BETWEEN NOW() AND NOW() + INTERVAL '7 days'`,
      [{ count: 0 }]
    ),
    safeOverviewQuery(
      'pendingDealApprovals',
      `SELECT COUNT(*)::int AS count
       FROM promotions
       WHERE status IN ('pending_approval', 'pending_admin_approval')`,
      [{ count: 0 }]
    ),
    safeOverviewQuery(
      'pendingDealPayments',
      `SELECT COUNT(*)::int AS count
       FROM promotions
       WHERE status = 'approved_pending_payment'`,
      [{ count: 0 }]
    ),
    safeOverviewQuery(
      'overdueInvoices',
      `SELECT COUNT(*)::int AS count
       FROM invoice
       WHERE status = 'OVERDUE' AND balance_due > 0`,
      [{ count: 0 }]
    ),
  ])

  const tenantCounts = tenantCountsRows.reduce((acc, row) => {
    acc[row.tenant_type] = parseInt(row.count, 10) || 0
    return acc
  }, {})

  const subscriptionStats = subscriptionStatsRows.reduce((acc, row) => {
    acc[row.status] = parseInt(row.count, 10) || 0
    return acc
  }, {})

  const revenueRow = revenueRows[0] || {}
  const mrr = parseFloat(revenueRow.mrr || 0)
  const orderRow = orderStatsRows[0] || {}
  const tenantLimitCounts = await buildTenantLimitOverviewCounts(safeOverviewQuery)
  const [operational, aiReorderMetrics] = await Promise.all([
    buildAdminOperationalOverviewCounters(),
    getAiReorderMetrics(),
  ])
  const aiPlatform = getAiPlatformConfigSummary()

  const payload = {
    tenantCounts,
    subscriptionStats,
    revenue: {
      mrr,
      arr: mrr * 12,
      activeSubscriptions: parseInt(revenueRow.paid_active_subscriptions, 10) || 0,
      paidActiveSubscriptions: parseInt(revenueRow.paid_active_subscriptions, 10) || 0,
      paidActiveOnly: parseInt(revenueRow.paid_active_only, 10) || 0,
    },
    orders: {
      today: parseInt(orderRow.today, 10) || 0,
      week: parseInt(orderRow.week, 10) || 0,
      month: parseInt(orderRow.month, 10) || 0,
      total: parseInt(orderRow.total, 10) || 0,
    },
    activeCarts: parseInt(cartStatsRows[0]?.count, 10) || 0,
    chatsLast24h: parseInt(chatStatsRows[0]?.count, 10) || 0,
    totalActiveStaff: parseInt(staffStatsRows[0]?.count, 10) || 0,
    reservations: {
      today: parseInt(reservationStatsRows[0]?.today, 10) || 0,
      week: parseInt(reservationStatsRows[0]?.week, 10) || 0,
      confirmed: parseInt(reservationStatsRows[0]?.confirmed, 10) || 0,
    },
    tenants: {
      totalSuppliers: parseInt(supplierStatsRows[0]?.count, 10) || 0,
      newSuppliers7d: parseInt(supplierStatsRows[0]?.new_suppliers, 10) || 0,
      totalRestaurants: parseInt(restaurantStatsRows[0]?.count, 10) || 0,
      newRestaurants7d: parseInt(restaurantStatsRows[0]?.new_restaurants, 10) || 0,
    },
    totalActiveProducts: parseInt(productStatsRows[0]?.count, 10) || 0,
    totalQuickLists: parseInt(quickListStatsRows[0]?.count, 10) || 0,
    alerts: {
      pastDueSubscriptions: parseInt(alertStatsRows[0]?.count, 10) || 0,
      trialsExpiringSoon: parseInt(trialExpStatsRows[0]?.count, 10) || 0,
      pendingDealApprovals: parseInt(pendingDealStatsRows[0]?.count, 10) || 0,
      pendingDealPayments: parseInt(pendingPaymentDealStatsRows[0]?.count, 10) || 0,
      overdueInvoices: parseInt(overdueInvoiceStatsRows[0]?.count, 10) || 0,
    },
    operational,
    aiReorder: {
      requests24h: aiReorderMetrics.totalRequests,
      successRate:
        aiReorderMetrics.successRate != null
          ? Math.round(aiReorderMetrics.successRate * 100)
          : null,
      aiEnabled: aiPlatform.envReady,
    },
    tenantsOverLimit: tenantLimitCounts.tenantsOverLimit,
    tenantsNearLimit: tenantLimitCounts.tenantsNearLimit,
    activity: {
      ordersLast24h: parseInt(orderRow.today, 10) || 0,
      chatsLast24h: parseInt(chatStatsRows[0]?.count, 10) || 0,
    },
  }

  if (config.ADMIN_OVERVIEW_DEBUG) {
    logger.info({ overview: payload }, 'admin overview metrics built')
  }

  return payload
}
