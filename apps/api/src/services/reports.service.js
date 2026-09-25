import { query } from '../lib/db.js'
import { ValidationError } from '../middlewares/errorHandler.js'
import { addCalendarDays } from '../lib/delivery-rollover-time.js'
import { getZonedParts, zonedDayBounds } from '../lib/tenant-timezone.js'

const GRANULARITIES = ['day', 'week', 'month']
/** Maximum inclusive report window (days). */
export const MAX_REPORT_RANGE_DAYS = 366

function startOfDay(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function endOfDay(d) {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

/** YYYY-MM-DD is a calendar day in the server's local timezone, not UTC midnight. */
export function parseReportBoundary(value, boundary) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number)
    if (boundary === 'end') return new Date(year, month - 1, day, 23, 59, 59, 999)
    return new Date(year, month - 1, day, 0, 0, 0, 0)
  }
  const parsed = new Date(value)
  return boundary === 'end' ? endOfDay(parsed) : startOfDay(parsed)
}

export function formatReportDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function calendarKeyFromInput(value, fallback) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  if (value) {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return formatReportDate(parsed)
  }
  return typeof fallback === 'string' ? fallback : formatReportDate(fallback)
}

function assertReportTimezone(timeZone) {
  if (typeof timeZone !== 'string' || !/^[A-Za-z0-9_+/-]{1,64}$/.test(timeZone)) {
    throw new ValidationError('Invalid timezone')
  }
  try {
    Intl.DateTimeFormat('en-US', { timeZone }).format(new Date())
  } catch {
    throw new ValidationError('Invalid timezone')
  }
  return timeZone
}

export function parseReportQuery(query = {}, options = {}) {
  const timeZone = options.timeZone ? assertReportTimezone(options.timeZone) : null
  const todayKey = timeZone
    ? getZonedParts(new Date(), timeZone).calendarDate
    : formatReportDate(new Date())
  const fromDate = calendarKeyFromInput(
    query.from,
    timeZone ? addCalendarDays(todayKey, -30) : startOfDay(defaultFrom())
  )
  const toDate = calendarKeyFromInput(query.to, timeZone ? todayKey : new Date())
  let from
  let to
  if (timeZone) {
    from = zonedDayBounds(fromDate, timeZone).start
    to = zonedDayBounds(toDate, timeZone).end
  } else {
    from = query.from ? parseReportBoundary(query.from, 'start') : startOfDay(defaultFrom())
    to = query.to ? parseReportBoundary(query.to, 'end') : endOfDay(new Date())
  }
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new ValidationError('Invalid from or to date')
  }
  if (from > to) {
    throw new ValidationError('from must be before to')
  }
  const spanMs = to.getTime() - from.getTime()
  const maxSpanMs = MAX_REPORT_RANGE_DAYS * 24 * 60 * 60 * 1000
  if (spanMs > maxSpanMs) {
    throw new ValidationError(`Date range cannot exceed ${MAX_REPORT_RANGE_DAYS} days`)
  }
  const granularity = (query.granularity || 'day').toLowerCase()
  if (!GRANULARITIES.includes(granularity)) {
    throw new ValidationError(`granularity must be one of: ${GRANULARITIES.join(', ')}`)
  }
  return {
    from,
    to,
    fromDate: timeZone ? fromDate : formatReportDate(from),
    toDate: timeZone ? toDate : formatReportDate(to),
    timeZone,
    branchId: query.branch_id || query.branchId || null,
    granularity,
  }
}

function defaultFrom() {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d
}

/**
 * SQL expression to bucket a timestamptz column by granularity.
 */
export function dateBucketExpression(column, granularity, timeZone) {
  const source = timeZone ? `(${column} AT TIME ZONE '${assertReportTimezone(timeZone)}')` : column
  switch (granularity) {
    case 'week':
      return `date_trunc('week', ${source})::date`
    case 'month':
      return `date_trunc('month', ${source})::date`
    case 'day':
    default:
      return timeZone ? `${source}::date` : `(${column})::date`
  }
}

/**
 * Generate expected bucket labels between from and to (inclusive) for tests and meta.
 */
export function generateDateBuckets(from, to, granularity) {
  const buckets = []
  const cursor = new Date(from)
  cursor.setHours(0, 0, 0, 0)
  const end = new Date(to)
  end.setHours(23, 59, 59, 999)

  while (cursor <= end) {
    buckets.push(formatBucket(cursor, granularity))
    advanceBucket(cursor, granularity)
  }
  return buckets
}

function formatBucket(d, granularity) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  if (granularity === 'month') return `${y}-${m}-01`
  if (granularity === 'week') {
    const wd = new Date(d)
    const dayOfWeek = wd.getDay()
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    wd.setDate(wd.getDate() + diff)
    return formatBucket(wd, 'day')
  }
  return `${y}-${m}-${day}`
}

function advanceBucket(d, granularity) {
  if (granularity === 'month') {
    d.setMonth(d.getMonth() + 1)
    d.setDate(1)
  } else if (granularity === 'week') {
    d.setDate(d.getDate() + 7)
  } else {
    d.setDate(d.getDate() + 1)
  }
}

function branchFilter(alias, branchId, params) {
  if (!branchId) return { sql: '', params }
  params.push(branchId)
  return { sql: ` AND ${alias}.branch_id = $${params.length}`, params }
}

function reportMeta(params, rowCount) {
  return {
    from: params.fromDate || formatReportDate(params.from),
    to: params.toDate || formatReportDate(params.to),
    branchId: params.branchId,
    granularity: params.granularity,
    rowCount,
  }
}

// --- Restaurant reports ---

export async function restaurantSpendBySupplier(restaurantId, params) {
  const qParams = [restaurantId, params.from, params.to]
  const branch = branchFilter('co', params.branchId, qParams)
  const { rows } = await query(
    `
    SELECT
      s.id AS supplier_id,
      s.name AS supplier_name,
      co.currency,
      COALESCE(SUM(oi.line_total), 0)::numeric AS total_spend,
      COUNT(DISTINCT co.id)::int AS order_count
    FROM customer_order co
    JOIN order_item oi ON oi.order_id = co.id
    JOIN supplier s ON s.id = oi.supplier_id
    WHERE co.restaurant_id = $1
      AND co.placed_at >= $2
      AND co.placed_at <= $3
      AND co.status NOT IN ('DRAFT', 'CANCELLED', 'PENDING_APPROVAL')
      ${branch.sql}
    GROUP BY s.id, s.name, co.currency
    ORDER BY total_spend DESC
    `,
    qParams
  )
  return { data: rows, meta: reportMeta(params, rows.length) }
}

export async function restaurantSpendByCategory(restaurantId, params) {
  const qParams = [restaurantId, params.from, params.to]
  const branch = branchFilter('co', params.branchId, qParams)
  const { rows } = await query(
    `
    SELECT
      COALESCE(pc.name, p.category, 'Uncategorized') AS category,
      co.currency,
      COALESCE(SUM(oi.line_total), 0)::numeric AS total_spend,
      COUNT(DISTINCT co.id)::int AS order_count
    FROM customer_order co
    JOIN order_item oi ON oi.order_id = co.id
    JOIN product p ON p.id = oi.product_id
    LEFT JOIN product_category pc ON pc.id = p.category_id
    WHERE co.restaurant_id = $1
      AND co.placed_at >= $2
      AND co.placed_at <= $3
      AND co.status NOT IN ('DRAFT', 'CANCELLED', 'PENDING_APPROVAL')
      ${branch.sql}
    GROUP BY COALESCE(pc.name, p.category, 'Uncategorized'), co.currency
    ORDER BY total_spend DESC
    `,
    qParams
  )
  return { data: rows, meta: reportMeta(params, rows.length) }
}

export async function restaurantOrderVolume(restaurantId, params) {
  const bucket = dateBucketExpression('co.placed_at', params.granularity, params.timeZone)
  const qParams = [restaurantId, params.from, params.to]
  const branch = branchFilter('co', params.branchId, qParams)
  const { rows } = await query(
    `
    SELECT
      ${bucket} AS period,
      co.currency,
      COUNT(*)::int AS order_count,
      COALESCE(SUM(co.total_amount), 0)::numeric AS total_amount
    FROM customer_order co
    WHERE co.restaurant_id = $1
      AND co.placed_at >= $2
      AND co.placed_at <= $3
      AND co.status NOT IN ('DRAFT', 'CANCELLED', 'PENDING_APPROVAL')
      ${branch.sql}
    GROUP BY period, co.currency
    ORDER BY period
    `,
    qParams
  )
  return { data: rows, meta: reportMeta(params, rows.length) }
}

export async function restaurantCogsTrend(restaurantId, params) {
  const bucket = dateBucketExpression('co.placed_at', params.granularity, params.timeZone)
  const qParams = [restaurantId, params.from, params.to]
  const branch = branchFilter('co', params.branchId, qParams)
  const { rows } = await query(
    `
    SELECT
      ${bucket} AS period,
      co.currency,
      COALESCE(SUM(oi.line_total), 0)::numeric AS cogs
    FROM customer_order co
    JOIN order_item oi ON oi.order_id = co.id
    WHERE co.restaurant_id = $1
      AND co.placed_at >= $2
      AND co.placed_at <= $3
      AND co.status NOT IN ('DRAFT', 'CANCELLED', 'PENDING_APPROVAL')
      ${branch.sql}
    GROUP BY period, co.currency
    ORDER BY period
    `,
    qParams
  )
  return { data: rows, meta: reportMeta(params, rows.length) }
}

export async function restaurantTopProducts(restaurantId, params) {
  const qParams = [restaurantId, params.from, params.to]
  const branch = branchFilter('co', params.branchId, qParams)
  const { rows } = await query(
    `
    SELECT
      p.id AS product_id,
      p.name AS product_name,
      p.sku,
      co.currency,
      COALESCE(SUM(oi.quantity), 0)::numeric AS total_qty,
      COALESCE(SUM(oi.line_total), 0)::numeric AS total_spend
    FROM customer_order co
    JOIN order_item oi ON oi.order_id = co.id
    JOIN product p ON p.id = oi.product_id
    WHERE co.restaurant_id = $1
      AND co.placed_at >= $2
      AND co.placed_at <= $3
      AND co.status NOT IN ('DRAFT', 'CANCELLED', 'PENDING_APPROVAL')
      ${branch.sql}
    GROUP BY p.id, p.name, p.sku, co.currency
    ORDER BY total_spend DESC
    LIMIT 20
    `,
    qParams
  )
  return { data: rows, meta: reportMeta(params, rows.length) }
}

export async function restaurantReceivingQuality(restaurantId, params) {
  const qParams = [restaurantId, params.from, params.to]
  const branch = branchFilter('co', params.branchId, qParams)
  const { rows } = await query(
    `
    SELECT
      s.id AS supplier_id,
      s.name AS supplier_name,
      COUNT(*)::int AS report_count,
      ROUND(AVG(rr.quality_score)::numeric, 2) AS avg_quality_score,
      ROUND(AVG(
        CASE WHEN rr.total_items_ordered > 0
          THEN (rr.total_items_received / rr.total_items_ordered) * 100
          ELSE NULL END
      )::numeric, 2) AS avg_fill_rate_pct
    FROM receiving_report rr
    JOIN supplier s ON s.id = rr.supplier_id
    LEFT JOIN customer_order co ON co.id = rr.order_id
    WHERE rr.restaurant_id = $1
      AND rr.received_at >= $2
      AND rr.received_at <= $3
      ${branch.sql}
    GROUP BY s.id, s.name
    ORDER BY report_count DESC
    `,
    qParams
  )
  return { data: rows, meta: reportMeta(params, rows.length) }
}

export async function restaurantWaste(restaurantId, params) {
  const bucket = dateBucketExpression('ia.created_at', params.granularity, params.timeZone)
  const qParams = [restaurantId, params.from, params.to]
  const branch = branchFilter('ia', params.branchId, qParams)
  const { rows } = await query(
    `
    SELECT
      ${bucket} AS period,
      ia.waste_category,
      COUNT(*)::int AS incident_count,
      COALESCE(SUM(ia.quantity), 0)::numeric AS total_qty,
      COALESCE(SUM(COALESCE(ia.total_cost, ia.unit_cost * ia.quantity)), 0)::numeric AS total_cost
    FROM inventory_adjustment ia
    WHERE ia.restaurant_id = $1
      AND ia.created_at >= $2
      AND ia.created_at <= $3
      AND ia.adjustment_type IN ('WASTAGE', 'SPOILAGE')
      ${branch.sql}
    GROUP BY period, ia.waste_category
    ORDER BY period, total_cost DESC
    `,
    qParams
  )
  return { data: rows, meta: reportMeta(params, rows.length) }
}

export async function restaurantInvoiceAging(restaurantId, params) {
  const qParams = [restaurantId, params.toDate || formatReportDate(params.to)]
  const branch = branchFilter('i', params.branchId, qParams)
  const { rows } = await query(
    `
    SELECT
      CASE
        WHEN i.due_date >= $2::date THEN 'current'
        WHEN $2::date - i.due_date <= 30 THEN '1_30'
        WHEN $2::date - i.due_date <= 60 THEN '31_60'
        WHEN $2::date - i.due_date <= 90 THEN '61_90'
        ELSE '90_plus'
      END AS bucket,
      i.currency,
      COUNT(*)::int AS invoice_count,
      COALESCE(SUM(i.balance_due), 0)::numeric AS total_balance
    FROM invoice i
    WHERE i.restaurant_id = $1
      AND i.status NOT IN ('PAID', 'VOID', 'DRAFT')
      AND i.balance_due > 0
      AND i.invoice_date <= $2::date
      ${branch.sql}
    GROUP BY bucket, i.currency
    ORDER BY bucket
    `,
    qParams
  )
  return { data: rows, meta: reportMeta(params, rows.length) }
}

// --- Supplier reports ---

export async function supplierRevenueTrend(supplierId, params) {
  const bucket = dateBucketExpression('co.placed_at', params.granularity, params.timeZone)
  const { rows } = await query(
    `
    SELECT
      ${bucket} AS period,
      co.currency,
      COALESCE(SUM(oi.line_total), 0)::numeric AS revenue,
      COUNT(DISTINCT co.id)::int AS order_count
    FROM customer_order co
    JOIN order_item oi ON oi.order_id = co.id
    WHERE oi.supplier_id = $1
      AND co.placed_at >= $2
      AND co.placed_at <= $3
      AND co.status NOT IN ('DRAFT', 'CANCELLED', 'PENDING_APPROVAL')
    GROUP BY period, co.currency
    ORDER BY period
    `,
    [supplierId, params.from, params.to]
  )
  return { data: rows, meta: reportMeta(params, rows.length) }
}

export async function supplierTopRestaurants(supplierId, params) {
  const { rows } = await query(
    `
    SELECT
      r.id AS restaurant_id,
      r.name AS restaurant_name,
      co.currency,
      COALESCE(SUM(oi.line_total), 0)::numeric AS revenue,
      COUNT(DISTINCT co.id)::int AS order_count
    FROM customer_order co
    JOIN order_item oi ON oi.order_id = co.id
    JOIN restaurant r ON r.id = co.restaurant_id
    WHERE oi.supplier_id = $1
      AND co.placed_at >= $2
      AND co.placed_at <= $3
      AND co.status NOT IN ('DRAFT', 'CANCELLED', 'PENDING_APPROVAL')
    GROUP BY r.id, r.name, co.currency
    ORDER BY revenue DESC
    LIMIT 20
    `,
    [supplierId, params.from, params.to]
  )
  return { data: rows, meta: reportMeta(params, rows.length) }
}

export async function supplierTopProducts(supplierId, params) {
  const { rows } = await query(
    `
    SELECT
      p.id AS product_id,
      p.name AS product_name,
      p.sku,
      co.currency,
      COALESCE(SUM(oi.quantity), 0)::numeric AS total_qty,
      COALESCE(SUM(oi.line_total), 0)::numeric AS revenue
    FROM customer_order co
    JOIN order_item oi ON oi.order_id = co.id
    JOIN product p ON p.id = oi.product_id
    WHERE oi.supplier_id = $1
      AND co.placed_at >= $2
      AND co.placed_at <= $3
      AND co.status NOT IN ('DRAFT', 'CANCELLED', 'PENDING_APPROVAL')
    GROUP BY p.id, p.name, p.sku, co.currency
    ORDER BY revenue DESC
    LIMIT 20
    `,
    [supplierId, params.from, params.to]
  )
  return { data: rows, meta: reportMeta(params, rows.length) }
}

export async function supplierFulfillmentPerformance(supplierId, params) {
  const { rows } = await query(
    `
    SELECT
      co.status,
      COUNT(*)::int AS order_count,
      ROUND(
        100.0 * SUM(COUNT(*) FILTER (
          WHERE co.status IN ('COMPLETED', 'DELIVERED', 'RECEIVED_FULL', 'RECEIVED_PARTIAL', 'INVOICED')
        )) OVER ()
        / NULLIF(SUM(COUNT(*)) OVER (), 0),
        2
      ) AS completion_rate_pct
    FROM customer_order co
    WHERE EXISTS (
      SELECT 1 FROM order_item oi WHERE oi.order_id = co.id AND oi.supplier_id = $1
    )
      AND co.placed_at >= $2
      AND co.placed_at <= $3
      AND co.status NOT IN ('DRAFT', 'CANCELLED', 'PENDING_APPROVAL')
    GROUP BY co.status
    ORDER BY order_count DESC
    `,
    [supplierId, params.from, params.to]
  )
  return { data: rows, meta: reportMeta(params, rows.length) }
}

export async function supplierInvoiceCollection(supplierId, params) {
  const { rows } = await query(
    `
    SELECT
      i.status,
      i.currency,
      COUNT(*)::int AS invoice_count,
      COALESCE(SUM(i.total_amount), 0)::numeric AS total_amount,
      COALESCE(SUM(i.balance_due), 0)::numeric AS balance_due,
      COALESCE(SUM(i.paid_amount), 0)::numeric AS paid_amount
    FROM invoice i
    WHERE i.supplier_id = $1
      AND i.invoice_date >= $2::date
      AND i.invoice_date <= $3::date
      AND i.status NOT IN ('VOID', 'DRAFT')
    GROUP BY i.status, i.currency
    ORDER BY invoice_count DESC
    `,
    [
      supplierId,
      params.fromDate || formatReportDate(params.from),
      params.toDate || formatReportDate(params.to),
    ]
  )
  return { data: rows, meta: reportMeta(params, rows.length) }
}
