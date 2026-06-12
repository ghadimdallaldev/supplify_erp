import { query } from './db.js'
import { logger } from './logger.js'
import { config } from '../config/env.js'
import { parseAdminListPagination } from './admin-list-pagination.js'
import { buildTrackingPayload, isGpsTrackingEnabled } from './delivery-tracking-payload.js'
import { redactEmail } from '../services/email/email-delivery-log.js'
import { getBillingStatus } from './billing/billing-service.js'
import { getEffectiveFeaturesForTenant } from './feature-flags.js'
import { resolveActiveBillingSubscription } from './org-billing-tenant.js'
import { isAiEnvEnabled } from './ai-platform.js'

const OPEN_ISSUE_STATUSES = `('shortage_reported', 'substitution_suggested', 'waiting_restaurant_approval')`
const FAILED_EMAIL_THRESHOLD = 5
const STALE_GPS_THRESHOLD = 10
const EXPIRED_LOTS_THRESHOLD = 20
const OPEN_ISSUES_THRESHOLD = 10

const SNAPSHOT_FEATURE_KEYS = [
  'smart_reorder',
  'quick_lists',
  'inventory_management',
  'driver_management',
  'fulfillment',
  'fulfillment_tools',
]

/**
 * @template T
 * @param {string} name
 * @param {string} sql
 * @param {T} fallback
 * @param {unknown[]} [params]
 */
export async function safeOperationalQuery(name, sql, fallback, params = []) {
  try {
    const { rows } = await query(sql, params)
    return rows
  } catch (error) {
    if (error.code === '42P01') {
      logger.warn({ metric: name, code: error.code }, 'admin operational table missing')
      return fallback
    }
    logger.warn(
      { metric: name, code: error.code, message: error.message },
      'admin operational metric query failed'
    )
    return fallback
  }
}

export function getEmailConfigSummary() {
  const provider = config.EMAIL_PROVIDER || (config.SMTP_HOST ? 'smtp' : '')
  const providerConfigured = Boolean(provider && config.SMTP_HOST && config.SMTP_PASS)
  return {
    enabled: config.EMAIL_ENABLED,
    logOnly: config.EMAIL_LOG_ONLY,
    providerLabel: provider || 'none',
    providerConfigured,
  }
}

export function getGpsConfigSummary() {
  return {
    platformGpsEnabled: config.GPS_TRACKING_ENABLED,
    restaurantTrackingAllowed: config.GPS_ALLOW_RESTAURANT_LIVE_TRACKING,
    showDriverName: config.GPS_RESTAURANT_SHOW_DRIVER_NAME,
    showDriverPhone: config.GPS_RESTAURANT_SHOW_DRIVER_PHONE,
  }
}

export function getAiPlatformConfigSummary() {
  return {
    enabled: config.AI_ENABLED,
    provider: config.AI_PROVIDER || 'none',
    model: config.AI_MODEL || null,
    envReady: isAiEnvEnabled(),
  }
}

export async function getAiReorderMetrics() {
  const [statsRows, topRows] = await Promise.all([
    safeOperationalQuery(
      'aiReorderMetrics24h',
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE success = true)::int AS success_count,
         COUNT(*) FILTER (WHERE success = false)::int AS failed_count
       FROM reorder_ai_request_log
       WHERE created_at >= NOW() - INTERVAL '24 hours'`,
      [{ total: 0, success_count: 0, failed_count: 0 }]
    ),
    safeOperationalQuery(
      'aiReorderTopRestaurants24h',
      `SELECT
         l.restaurant_id,
         r.name AS restaurant_name,
         COUNT(*)::int AS request_count
       FROM reorder_ai_request_log l
       JOIN restaurant r ON r.id = l.restaurant_id
       WHERE l.created_at >= NOW() - INTERVAL '24 hours'
       GROUP BY l.restaurant_id, r.name
       ORDER BY request_count DESC
       LIMIT 5`,
      []
    ),
  ])

  const row = statsRows[0] || {}
  const total = parseInt(row.total, 10) || 0
  const successCount = parseInt(row.success_count, 10) || 0
  const failedCount = parseInt(row.failed_count, 10) || 0

  return {
    totalRequests: total,
    successRate: total > 0 ? Math.round((successCount / total) * 1000) / 1000 : null,
    failedCount,
    topRestaurants: topRows.map((r) => ({
      restaurantId: r.restaurant_id,
      restaurantName: r.restaurant_name,
      requestCount: parseInt(r.request_count, 10) || 0,
    })),
  }
}

/**
 * Classify GPS state for admin views (no coordinates returned).
 * @param {ReturnType<typeof buildTrackingPayload>} tracking
 */
export function classifyGpsDeliveryState(tracking) {
  if (!tracking?.enabled) return 'off'
  if (!tracking.hasLocation) return 'noGps'
  if (tracking.isStale) return 'stale'
  return 'live'
}

/**
 * @param {Array<{ order_id: string, latitude?: number|null, longitude?: number|null, recorded_at?: Date|null, loc_order_id?: string|null }>} rows
 */
export function summarizeGpsDeliveryRows(rows) {
  let live = 0
  let stale = 0
  let noGps = 0
  for (const row of rows) {
    const tracking = buildTrackingPayload({
      orderId: row.order_id,
      locationRow:
        row.latitude != null
          ? {
              latitude: row.latitude,
              longitude: row.longitude,
              recordedAt: row.recorded_at,
              orderId: row.loc_order_id,
            }
          : null,
      allowDriverFallback: true,
    })
    const state = classifyGpsDeliveryState(tracking)
    if (state === 'live') live += 1
    else if (state === 'stale') stale += 1
    else if (state === 'noGps') noGps += 1
  }
  return { active: rows.length, live, stale, noGps }
}

function buildWarnings(ctx) {
  const warnings = []
  const { email, gps, gpsDeliveries, fulfillment, expiry, adoption } = ctx

  if (email.enabled && !email.logOnly && !email.providerConfigured) {
    warnings.push({
      id: 'email-provider-missing',
      severity: 'danger',
      message: 'Email is enabled but no provider is configured',
      tab: 'operations',
    })
  }
  if (email.failed24h >= FAILED_EMAIL_THRESHOLD) {
    warnings.push({
      id: 'email-high-failures',
      severity: 'warning',
      message: `${email.failed24h} failed emails in the last 24 hours`,
      tab: 'operations',
    })
  }
  if (gps.restaurantTrackingAllowed && !gps.platformGpsEnabled) {
    warnings.push({
      id: 'gps-restaurant-without-platform',
      severity: 'warning',
      message: 'Restaurant tracking is allowed but platform GPS is disabled',
      tab: 'operations',
    })
  }
  if (gpsDeliveries.stale >= STALE_GPS_THRESHOLD) {
    warnings.push({
      id: 'gps-many-stale',
      severity: 'warning',
      message: `${gpsDeliveries.stale} deliveries with stale GPS`,
      tab: 'operations',
    })
  }
  if (adoption.suppliersGpsEnabledNoDrivers > 0) {
    warnings.push({
      id: 'gps-no-drivers',
      severity: 'info',
      message: `${adoption.suppliersGpsEnabledNoDrivers} supplier(s) with active deliveries but no drivers`,
      tab: 'operations',
    })
  }
  if (fulfillment.openIssues >= OPEN_ISSUES_THRESHOLD) {
    warnings.push({
      id: 'fulfillment-open-issues',
      severity: 'warning',
      message: `${fulfillment.openIssues} unresolved fulfillment issues`,
      tab: 'operations',
    })
  }
  if (expiry.expiredLots >= EXPIRED_LOTS_THRESHOLD) {
    warnings.push({
      id: 'expiry-many-expired',
      severity: 'warning',
      message: `${expiry.expiredLots} expired inventory lots platform-wide`,
      tab: 'operations',
    })
  }

  return warnings.slice(0, 15)
}

/**
 * Lightweight counters for admin overview (subset of operational summary).
 */
export async function buildAdminOperationalOverviewCounters() {
  const [emailStats, fulfillmentStats, gpsRows, expiryStats, aiReorderMetrics] = await Promise.all([
    safeOperationalQuery(
      'emailFailed24h',
      `SELECT
         COUNT(*) FILTER (WHERE status = 'failed' AND created_at >= NOW() - INTERVAL '24 hours')::int AS failed,
         COUNT(*) FILTER (WHERE status = 'skipped' AND created_at >= NOW() - INTERVAL '24 hours')::int AS skipped
       FROM email_delivery_log`,
      [{ failed: 0, skipped: 0 }]
    ),
    safeOperationalQuery(
      'openFulfillmentIssues',
      `SELECT COUNT(*)::int AS count FROM order_fulfillment_issue
       WHERE status IN ${OPEN_ISSUE_STATUSES}`,
      [{ count: 0 }]
    ),
    isGpsTrackingEnabled()
      ? safeOperationalQuery(
          'gpsActiveDeliveries',
          `
          SELECT
            da.order_id,
            dll.latitude,
            dll.longitude,
            dll.recorded_at,
            dll.order_id AS loc_order_id
          FROM driver_assignments da
          JOIN customer_order o ON o.id = da.order_id
          LEFT JOIN driver_latest_location dll ON dll.driver_id = da.driver_id
          WHERE da.status IN ('assigned', 'picked_up', 'out_for_delivery')
            AND o.status IN ('ACKNOWLEDGED', 'PROCESSING', 'SHIPPED', 'DELIVERED')
            AND COALESCE(o.placed_at, o.created_at) >= date_trunc('day', now())
          LIMIT 500
          `,
          []
        )
      : Promise.resolve([]),
    safeOperationalQuery(
      'expiredLots',
      `SELECT COUNT(*)::int AS count FROM restaurant_inventory_lot
       WHERE is_archived = false AND expiry_date < CURRENT_DATE`,
      [{ count: 0 }]
    ),
    getAiReorderMetrics(),
  ])

  const emailRow = emailStats[0] || {}
  const gpsSummary = summarizeGpsDeliveryRows(gpsRows)
  return {
    emailFailed24h: parseInt(emailRow.failed, 10) || 0,
    emailSkipped24h: parseInt(emailRow.skipped, 10) || 0,
    openFulfillmentIssues: parseInt(fulfillmentStats[0]?.count, 10) || 0,
    staleGpsDeliveries: gpsSummary.stale,
    expiredInventoryLots: parseInt(expiryStats[0]?.count, 10) || 0,
    aiReorderRequests24h: aiReorderMetrics.totalRequests,
    aiReorderFailed24h: aiReorderMetrics.failedCount,
  }
}

export async function buildAdminOperationalSummary() {
  const emailConfig = getEmailConfigSummary()
  const gpsConfig = getGpsConfigSummary()
  const aiPlatform = getAiPlatformConfigSummary()

  const [
    emailStats,
    expiryStats,
    reorderStats,
    fulfillmentStats,
    quickListStats,
    gpsDeliveryRows,
    failedTodayRows,
    adoptionRows,
    subscriptionRows,
    pendingDealsRow,
    aiReorderMetrics,
  ] = await Promise.all([
    safeOperationalQuery(
      'emailStats24h',
      `SELECT
         COUNT(*) FILTER (WHERE status = 'failed' AND created_at >= NOW() - INTERVAL '24 hours')::int AS failed,
         COUNT(*) FILTER (WHERE status = 'skipped' AND created_at >= NOW() - INTERVAL '24 hours')::int AS skipped,
         COUNT(*) FILTER (WHERE status = 'sent' AND created_at >= NOW() - INTERVAL '24 hours')::int AS sent,
         COUNT(*) FILTER (WHERE status = 'log_only' AND created_at >= NOW() - INTERVAL '24 hours')::int AS log_only
       FROM email_delivery_log`,
      [{ failed: 0, skipped: 0, sent: 0, log_only: 0 }]
    ),
    safeOperationalQuery(
      'expiryStats',
      `SELECT
         COUNT(DISTINCT restaurant_id)::int AS restaurants_with_lots,
         COUNT(*) FILTER (WHERE is_archived = false AND expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7)::int AS expiring_7d,
         COUNT(*) FILTER (WHERE is_archived = false AND expiry_date < CURRENT_DATE)::int AS expired_lots
       FROM restaurant_inventory_lot`,
      [{ restaurants_with_lots: 0, expiring_7d: 0, expired_lots: 0 }]
    ),
    safeOperationalQuery(
      'reorderStats',
      `SELECT
         COUNT(*) FILTER (WHERE is_active = true)::int AS active_patterns,
         (SELECT COUNT(*)::int FROM reorder_cadence_reminder_log WHERE reminder_date = CURRENT_DATE) AS reminders_today,
         COUNT(DISTINCT restaurant_id) FILTER (WHERE is_active = true)::int AS restaurants_with_cadence
       FROM restaurant_order_cadence`,
      [{ active_patterns: 0, reminders_today: 0, restaurants_with_cadence: 0 }]
    ),
    safeOperationalQuery(
      'fulfillmentStats',
      `SELECT
         COUNT(*)::int AS open_issues,
         COUNT(*) FILTER (WHERE issue_type = 'shortage' AND status IN ${OPEN_ISSUE_STATUSES})::int AS shortage_open,
         COUNT(*) FILTER (WHERE issue_type = 'substitution' AND status IN ${OPEN_ISSUE_STATUSES})::int AS substitution_open,
         COUNT(*) FILTER (WHERE conversation_id IS NOT NULL AND status IN ${OPEN_ISSUE_STATUSES})::int AS with_chat
       FROM order_fulfillment_issue`,
      [{ open_issues: 0, shortage_open: 0, substitution_open: 0, with_chat: 0 }]
    ),
    safeOperationalQuery(
      'quickListStats',
      `SELECT
         COUNT(*)::int AS total_lists,
         COUNT(*) FILTER (WHERE is_scheduled = true)::int AS scheduled_lists,
         COUNT(DISTINCT restaurant_id)::int AS restaurants_using,
         COUNT(*) FILTER (WHERE branch_id IS NOT NULL)::int AS branch_scoped
       FROM quick_list`,
      [{ total_lists: 0, scheduled_lists: 0, restaurants_using: 0, branch_scoped: 0 }]
    ),
    isGpsTrackingEnabled()
      ? safeOperationalQuery(
          'platformGpsDeliveries',
          `
          SELECT
            da.order_id,
            dll.latitude,
            dll.longitude,
            dll.recorded_at,
            dll.order_id AS loc_order_id
          FROM driver_assignments da
          JOIN customer_order o ON o.id = da.order_id
          LEFT JOIN driver_latest_location dll ON dll.driver_id = da.driver_id
          WHERE da.status IN ('assigned', 'picked_up', 'out_for_delivery')
            AND o.status IN ('ACKNOWLEDGED', 'PROCESSING', 'SHIPPED', 'DELIVERED')
            AND COALESCE(o.placed_at, o.created_at) >= date_trunc('day', now())
          LIMIT 500
          `,
          []
        )
      : Promise.resolve([]),
    isGpsTrackingEnabled()
      ? safeOperationalQuery(
          'failedDeliveriesToday',
          `SELECT COUNT(DISTINCT order_id)::int AS count
           FROM driver_assignments
           WHERE status = 'failed' AND failed_at >= date_trunc('day', now())`,
          [{ count: 0 }]
        )
      : Promise.resolve([{ count: 0 }]),
    safeOperationalQuery(
      'gpsAdoption',
      `SELECT
         (SELECT COUNT(DISTINCT supplier_id)::int FROM drivers WHERE is_active = TRUE) AS suppliers_with_drivers,
         (
           SELECT COUNT(DISTINCT s.id)::int
           FROM supplier s
           WHERE EXISTS (
             SELECT 1 FROM driver_assignments da
             WHERE da.supplier_id = s.id
               AND da.status IN ('assigned', 'picked_up', 'out_for_delivery')
               AND da.created_at >= date_trunc('day', now())
           )
           AND NOT EXISTS (SELECT 1 FROM drivers d WHERE d.supplier_id = s.id AND d.is_active = TRUE)
         ) AS suppliers_gps_no_drivers`,
      [{ suppliers_with_drivers: 0, suppliers_gps_no_drivers: 0 }]
    ),
    safeOperationalQuery(
      'subscriptionOps',
      `SELECT
         COUNT(*) FILTER (WHERE status = 'TRIALING' AND trial_ends_at < NOW())::int AS expired_trials,
         COUNT(*) FILTER (
           WHERE status = 'TRIALING'
             AND trial_ends_at BETWEEN NOW() AND NOW() + INTERVAL '7 days'
         )::int AS trials_ending_7d,
         COUNT(*) FILTER (WHERE account_locked_at IS NOT NULL OR status = 'SUSPENDED')::int AS write_blocked
       FROM subscription`,
      [{ expired_trials: 0, trials_ending_7d: 0, write_blocked: 0 }]
    ),
    safeOperationalQuery(
      'pendingDeals',
      `SELECT COUNT(*)::int AS count FROM promotions
       WHERE status IN ('pending_approval', 'pending_admin_approval', 'approved_pending_payment')`,
      [{ count: 0 }]
    ),
    getAiReorderMetrics(),
  ])

  const emailRow = emailStats[0] || {}
  const expiryRow = expiryStats[0] || {}
  const reorderRow = reorderStats[0] || {}
  const fulfillmentRow = fulfillmentStats[0] || {}
  const quickRow = quickListStats[0] || {}
  const gpsDeliveries = summarizeGpsDeliveryRows(gpsDeliveryRows)
  const adoptionRow = adoptionRows[0] || {}
  const subRow = subscriptionRows[0] || {}

  const expiryRemindersToday = await safeOperationalQuery(
    'expiryRemindersToday',
    `SELECT COUNT(*)::int AS count FROM inventory_expiry_notification_log
     WHERE sent_at::date = CURRENT_DATE`,
    [{ count: 0 }]
  )

  const email = {
    ...emailConfig,
    failed24h: parseInt(emailRow.failed, 10) || 0,
    skipped24h: parseInt(emailRow.skipped, 10) || 0,
    sent24h: parseInt(emailRow.sent, 10) || 0,
    deduped24h: parseInt(emailRow.skipped, 10) || 0,
    logOnly24h: parseInt(emailRow.log_only, 10) || 0,
  }

  const expiry = {
    restaurantsWithLots: parseInt(expiryRow.restaurants_with_lots, 10) || 0,
    expiring7d: parseInt(expiryRow.expiring_7d, 10) || 0,
    expiredLots: parseInt(expiryRow.expired_lots, 10) || 0,
    remindersToday: parseInt(expiryRemindersToday[0]?.count, 10) || 0,
  }

  const reorder = {
    activeCadencePatterns: parseInt(reorderRow.active_patterns, 10) || 0,
    missedRemindersToday: parseInt(reorderRow.reminders_today, 10) || 0,
    restaurantsAtRisk: parseInt(reorderRow.restaurants_with_cadence, 10) || 0,
  }

  const fulfillment = {
    openIssues: parseInt(fulfillmentRow.open_issues, 10) || 0,
    shortageOpen: parseInt(fulfillmentRow.shortage_open, 10) || 0,
    substitutionOpen: parseInt(fulfillmentRow.substitution_open, 10) || 0,
    issuesWithChat: parseInt(fulfillmentRow.with_chat, 10) || 0,
  }

  const quickLists = {
    totalLists: parseInt(quickRow.total_lists, 10) || 0,
    scheduledLists: parseInt(quickRow.scheduled_lists, 10) || 0,
    restaurantsUsing: parseInt(quickRow.restaurants_using, 10) || 0,
    branchScopedLists: parseInt(quickRow.branch_scoped, 10) || 0,
  }

  const gpsDeliveriesPayload = {
    ...gpsDeliveries,
    failedToday: parseInt(failedTodayRows[0]?.count, 10) || 0,
  }

  const adoption = {
    suppliersWithDrivers: parseInt(adoptionRow.suppliers_with_drivers, 10) || 0,
    suppliersGpsEnabledNoDrivers: parseInt(adoptionRow.suppliers_gps_no_drivers, 10) || 0,
  }

  const subscription = {
    expiredTrials: parseInt(subRow.expired_trials, 10) || 0,
    trialsEnding7d: parseInt(subRow.trials_ending_7d, 10) || 0,
    writeBlockedTenants: parseInt(subRow.write_blocked, 10) || 0,
    limitExceededTenants: null,
  }

  const warnings = buildWarnings({
    email,
    gps: gpsConfig,
    gpsDeliveries: gpsDeliveriesPayload,
    fulfillment,
    expiry,
    adoption,
  })

  const pendingDeals = parseInt(pendingDealsRow[0]?.count, 10) || 0
  if (pendingDeals > 0) {
    warnings.push({
      id: 'deals-pending-review',
      severity: 'info',
      message: `${pendingDeals} deal(s) need admin review or payment`,
      tab: 'deals',
    })
  }

  return {
    email,
    expiry,
    reorder,
    fulfillment,
    quickLists,
    gps: gpsConfig,
    gpsDeliveries: gpsDeliveriesPayload,
    adoption,
    subscription,
    aiPlatform,
    aiReorder: aiReorderMetrics,
    warnings: warnings.slice(0, 15),
  }
}

/**
 * @param {Record<string, unknown>} queryParams
 */
export async function listAdminEmailDeliveryLogs(queryParams = {}) {
  const { limit, offset } = parseAdminListPagination(queryParams)
  const conditions = ['1=1']
  const params = []
  let n = 1

  if (queryParams.tenantId) {
    conditions.push(`e.tenant_id = $${n++}`)
    params.push(queryParams.tenantId)
  }
  if (queryParams.status) {
    conditions.push(`e.status = $${n++}`)
    params.push(String(queryParams.status))
  }
  if (queryParams.eventType) {
    conditions.push(`e.event_type = $${n++}`)
    params.push(String(queryParams.eventType))
  }
  if (queryParams.since) {
    conditions.push(`e.created_at >= $${n++}::timestamptz`)
    params.push(String(queryParams.since))
  }

  const where = conditions.join(' AND ')
  const countRows = await safeOperationalQuery(
    'emailLogCount',
    `SELECT COUNT(*)::int AS total FROM email_delivery_log e WHERE ${where}`,
    [{ total: 0 }],
    params
  )
  const total = parseInt(countRows[0]?.total, 10) || 0

  const listParams = [...params, limit, offset]
  const rows = await safeOperationalQuery(
    'emailLogs',
    `
    SELECT
      e.id,
      e.tenant_id,
      e.event_type,
      e.status,
      e.subject,
      e.sent_at,
      e.created_at,
      e.recipient,
      LEFT(e.error_message, 200) AS error_message,
      COALESCE(s.name, r.name) AS tenant_name
    FROM email_delivery_log e
    LEFT JOIN supplier s ON s.id = e.tenant_id
    LEFT JOIN restaurant r ON r.id = e.tenant_id
    WHERE ${where}
    ORDER BY e.created_at DESC
    LIMIT $${n++} OFFSET $${n++}
    `,
    [],
    listParams
  )

  return {
    total,
    limit,
    offset,
    logs: rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      tenantName: row.tenant_name,
      eventType: row.event_type,
      status: row.status,
      subject: row.subject,
      sentAt: row.sent_at,
      createdAt: row.created_at,
      recipientRedacted: redactEmail(row.recipient),
      errorMessage: row.error_message,
    })),
  }
}

/**
 * @param {Record<string, unknown>} queryParams
 */
export async function listAdminFulfillmentIssues(queryParams = {}) {
  const { limit, offset } = parseAdminListPagination(queryParams)
  const conditions = [`fi.status IN ${OPEN_ISSUE_STATUSES}`]
  const params = []
  let n = 1

  if (queryParams.supplierId) {
    conditions.push(`fi.supplier_id = $${n++}`)
    params.push(queryParams.supplierId)
  }
  if (queryParams.restaurantId) {
    conditions.push(`fi.restaurant_id = $${n++}`)
    params.push(queryParams.restaurantId)
  }

  const where = conditions.join(' AND ')
  const countRows = await safeOperationalQuery(
    'fulfillmentIssueCount',
    `SELECT COUNT(*)::int AS total FROM order_fulfillment_issue fi WHERE ${where}`,
    [{ total: 0 }],
    params
  )
  const total = parseInt(countRows[0]?.total, 10) || 0

  const listParams = [...params, limit, offset]
  const rows = await safeOperationalQuery(
    'fulfillmentIssues',
    `
    SELECT
      fi.id,
      fi.order_id,
      fi.issue_type,
      fi.status,
      fi.created_at,
      fi.conversation_id IS NOT NULL AS has_chat,
      s.name AS supplier_name,
      r.name AS restaurant_name
    FROM order_fulfillment_issue fi
    JOIN supplier s ON s.id = fi.supplier_id
    JOIN restaurant r ON r.id = fi.restaurant_id
    WHERE ${where}
    ORDER BY fi.created_at DESC
    LIMIT $${n++} OFFSET $${n++}
    `,
    [],
    listParams
  )

  return {
    total,
    limit,
    offset,
    issues: rows.map((row) => ({
      id: row.id,
      orderId: row.order_id,
      orderRef: row.order_id ? `ORD-${String(row.order_id).slice(0, 8)}` : null,
      issueType: row.issue_type,
      status: row.status,
      createdAt: row.created_at,
      hasChat: Boolean(row.has_chat),
      supplierName: row.supplier_name,
      restaurantName: row.restaurant_name,
    })),
  }
}

export async function listAdminActiveDeliveries({ limit = 30 } = {}) {
  if (!isGpsTrackingEnabled()) {
    return { deliveries: [] }
  }

  const cap = Math.min(Math.max(parseInt(String(limit), 10) || 30, 1), 50)
  const rows = await safeOperationalQuery(
    'activeDeliveries',
    `
    SELECT DISTINCT ON (da.order_id)
      da.order_id,
      da.status AS assignment_status,
      s.id AS supplier_id,
      s.name AS supplier_name,
      dll.latitude,
      dll.longitude,
      dll.recorded_at,
      dll.order_id AS loc_order_id
    FROM driver_assignments da
    JOIN customer_order o ON o.id = da.order_id
    JOIN order_item oi ON oi.order_id = o.id
    JOIN supplier s ON s.id = oi.supplier_id
    LEFT JOIN driver_latest_location dll ON dll.driver_id = da.driver_id
    WHERE da.status IN ('assigned', 'picked_up', 'out_for_delivery')
      AND o.status IN ('ACKNOWLEDGED', 'PROCESSING', 'SHIPPED')
    ORDER BY da.order_id, da.updated_at DESC
    LIMIT $1
    `,
    [],
    [cap]
  )

  return {
    deliveries: rows.map((row) => {
      const tracking = buildTrackingPayload({
        orderId: row.order_id,
        locationRow:
          row.latitude != null
            ? {
                latitude: row.latitude,
                longitude: row.longitude,
                recordedAt: row.recorded_at,
                orderId: row.loc_order_id,
              }
            : null,
        allowDriverFallback: true,
      })
      return {
        orderId: row.order_id,
        orderRef: `ORD-${String(row.order_id).slice(0, 8)}`,
        supplierId: row.supplier_id,
        supplierName: row.supplier_name,
        deliveryStatus: row.assignment_status,
        gpsState: classifyGpsDeliveryState(tracking),
        lastUpdatedLabel: tracking.lastUpdatedLabel,
      }
    }),
  }
}

export async function getAdminEmailHealthFailures({ limit = 20 } = {}) {
  const cap = Math.min(Math.max(parseInt(String(limit), 10) || 20, 1), 50)
  const rows = await safeOperationalQuery(
    'emailHealthFailures',
    `
    SELECT id, tenant_id, event_type, status, subject, recipient,
           LEFT(error_message, 200) AS error_message, created_at
    FROM email_delivery_log
    WHERE status = 'failed' AND created_at >= NOW() - INTERVAL '24 hours'
    ORDER BY created_at DESC
    LIMIT $1
    `,
    [],
    [cap]
  )

  return rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    eventType: row.event_type,
    status: row.status,
    subject: row.subject,
    recipientRedacted: redactEmail(row.recipient),
    errorMessage: row.error_message,
    createdAt: row.created_at,
  }))
}

/**
 * @param {string} tenantId
 * @param {'RESTAURANT'|'SUPPLIER'} tenantType
 */
export async function buildTenantOperationalSnapshot(tenantId, tenantType) {
  const billingResolved = await resolveActiveBillingSubscription(tenantId, tenantType)
  const subscription = billingResolved?.subscription ?? null
  const billingTenantId = billingResolved?.billingTenantId ?? tenantId

  let writeBlocked = false
  try {
    const billing = await getBillingStatus(billingTenantId, tenantType)
    writeBlocked = Boolean(billing?.access?.isLocked)
  } catch {
    writeBlocked = false
  }

  const effectiveFeatures = await getEffectiveFeaturesForTenant(tenantId, tenantType)
  const featureFlags = {}
  for (const key of SNAPSHOT_FEATURE_KEYS) {
    if (effectiveFeatures[key] !== undefined) {
      featureFlags[key] = effectiveFeatures[key]
    }
  }

  const recentEmailFailures = await safeOperationalQuery(
    'tenantEmailFailures',
    `
    SELECT id, event_type, status, subject, recipient,
           LEFT(error_message, 200) AS error_message, created_at
    FROM email_delivery_log
    WHERE tenant_id = $1 AND status = 'failed'
    ORDER BY created_at DESC
    LIMIT 5
    `,
    [],
    [tenantId]
  )

  const shared = {
    tenantId,
    tenantType,
    subscription: subscription
      ? {
          status: subscription.status,
          trialEndsAt: subscription.trial_ends_at ?? null,
          planCode: subscription.plan_code ?? null,
          planName: subscription.plan_name ?? null,
        }
      : null,
    featureFlags,
    writeBlocked,
    emailConfig: getEmailConfigSummary(),
    recentEmailFailures: recentEmailFailures.map((row) => ({
      id: row.id,
      eventType: row.event_type,
      status: row.status,
      subject: row.subject,
      recipientRedacted: redactEmail(row.recipient),
      errorMessage: row.error_message,
      createdAt: row.created_at,
    })),
    gpsConfig: getGpsConfigSummary(),
  }

  if (tenantType === 'SUPPLIER') {
    const [driverRows, gpsRows, issueRows, dealRows] = await Promise.all([
      safeOperationalQuery(
        'supplierDrivers',
        `SELECT COUNT(*)::int AS count FROM drivers WHERE supplier_id = $1 AND is_active = TRUE`,
        [{ count: 0 }],
        [tenantId]
      ),
      isGpsTrackingEnabled()
        ? safeOperationalQuery(
            'supplierGpsToday',
            `
            SELECT
              da.order_id,
              dll.latitude,
              dll.longitude,
              dll.recorded_at,
              dll.order_id AS loc_order_id
            FROM driver_assignments da
            JOIN customer_order o ON o.id = da.order_id
            LEFT JOIN driver_latest_location dll ON dll.driver_id = da.driver_id
            WHERE da.supplier_id = $1
              AND da.status IN ('assigned', 'picked_up', 'out_for_delivery')
              AND o.status IN ('ACKNOWLEDGED', 'PROCESSING', 'SHIPPED', 'DELIVERED')
              AND COALESCE(o.placed_at, o.created_at) >= date_trunc('day', now())
            `,
            [],
            [tenantId]
          )
        : Promise.resolve([]),
      safeOperationalQuery(
        'supplierFulfillmentOpen',
        `SELECT COUNT(*)::int AS count FROM order_fulfillment_issue
         WHERE supplier_id = $1 AND status IN ${OPEN_ISSUE_STATUSES}`,
        [{ count: 0 }],
        [tenantId]
      ),
      safeOperationalQuery(
        'supplierPendingDeals',
        `SELECT COUNT(*)::int AS count FROM promotions
         WHERE supplier_id = $1
           AND status IN ('pending_approval', 'pending_admin_approval', 'approved_pending_payment')`,
        [{ count: 0 }],
        [tenantId]
      ),
    ])

    const gpsToday = summarizeGpsDeliveryRows(gpsRows)
    const failedRows = await safeOperationalQuery(
      'supplierFailedToday',
      `SELECT COUNT(DISTINCT order_id)::int AS count FROM driver_assignments
       WHERE supplier_id = $1 AND status = 'failed' AND failed_at >= date_trunc('day', now())`,
      [{ count: 0 }],
      [tenantId]
    )

    return {
      ...shared,
      supplier: {
        driverCount: parseInt(driverRows[0]?.count, 10) || 0,
        gpsToday: { ...gpsToday, failed: parseInt(failedRows[0]?.count, 10) || 0 },
        openFulfillmentIssues: parseInt(issueRows[0]?.count, 10) || 0,
        pendingDeals: parseInt(dealRows[0]?.count, 10) || 0,
      },
    }
  }

  const [expiryRows, cadenceRows, quickRows, trackingOrders] = await Promise.all([
    safeOperationalQuery(
      'restaurantExpiry',
      `SELECT
         COUNT(*) FILTER (WHERE is_archived = false AND expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7)::int AS expiring,
         COUNT(*) FILTER (WHERE is_archived = false AND expiry_date < CURRENT_DATE)::int AS expired
       FROM restaurant_inventory_lot WHERE restaurant_id = $1`,
      [{ expiring: 0, expired: 0 }],
      [tenantId]
    ),
    safeOperationalQuery(
      'restaurantCadence',
      `SELECT COUNT(*)::int AS at_risk
       FROM restaurant_order_cadence
       WHERE restaurant_id = $1 AND is_active = true`,
      [{ at_risk: 0 }],
      [tenantId]
    ),
    safeOperationalQuery(
      'restaurantQuickLists',
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE is_scheduled = true)::int AS scheduled,
         COUNT(*) FILTER (WHERE branch_id IS NOT NULL)::int AS branch_scoped
       FROM quick_list WHERE restaurant_id = $1`,
      [{ total: 0, scheduled: 0, branch_scoped: 0 }],
      [tenantId]
    ),
    safeOperationalQuery(
      'restaurantActiveOrders',
      `SELECT COUNT(*)::int AS active_orders
       FROM customer_order
       WHERE restaurant_id = $1
         AND status IN ('ACKNOWLEDGED', 'PROCESSING', 'SHIPPED')`,
      [{ active_orders: 0 }],
      [tenantId]
    ),
  ])

  const restaurantTracking = {
    platformEnabled: config.GPS_ALLOW_RESTAURANT_LIVE_TRACKING && config.GPS_TRACKING_ENABLED,
    reason: !config.GPS_TRACKING_ENABLED
      ? 'gps_disabled'
      : !config.GPS_ALLOW_RESTAURANT_LIVE_TRACKING
        ? 'restaurant_tracking_disabled'
        : null,
    activeOrders: parseInt(trackingOrders[0]?.active_orders, 10) || 0,
    showDriverName: config.GPS_RESTAURANT_SHOW_DRIVER_NAME,
    showDriverPhone: config.GPS_RESTAURANT_SHOW_DRIVER_PHONE,
  }

  return {
    ...shared,
    restaurant: {
      expiry: {
        expiring7d: parseInt(expiryRows[0]?.expiring, 10) || 0,
        expiredLots: parseInt(expiryRows[0]?.expired, 10) || 0,
      },
      reorderCadenceAtRisk: parseInt(cadenceRows[0]?.at_risk, 10) || 0,
      quickLists: {
        total: parseInt(quickRows[0]?.total, 10) || 0,
        scheduled: parseInt(quickRows[0]?.scheduled, 10) || 0,
        branchScoped: parseInt(quickRows[0]?.branch_scoped, 10) || 0,
      },
      restaurantTracking,
    },
  }
}
