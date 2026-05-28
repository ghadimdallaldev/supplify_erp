import { query } from '../lib/db.js'
import { ValidationError } from '../middlewares/errorHandler.js'

const GRANULARITIES = ['day', 'week', 'month']

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

export function parseReportQuery(query = {}) {
  const from = query.from ? startOfDay(new Date(query.from)) : startOfDay(defaultFrom())
  const to = query.to ? endOfDay(new Date(query.to)) : endOfDay(new Date())
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new ValidationError('Invalid from or to date')
  }
  if (from > to) {
    throw new ValidationError('from must be before to')
  }
  const granularity = (query.granularity || 'day').toLowerCase()
  if (!GRANULARITIES.includes(granularity)) {
    throw new ValidationError(`granularity must be one of: ${GRANULARITIES.join(', ')}`)
  }
  return {
    from,
    to,
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
export function dateBucketExpression(column, granularity) {
  switch (granularity) {
    case 'week':
      return `date_trunc('week', ${column})::date`
    case 'month':
      return `date_trunc('month', ${column})::date`
    case 'day':
    default:
      return `(${column})::date`
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
    from: params.from.toISOString().slice(0, 10),
    to: params.to.toISOString().slice(0, 10),
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
    GROUP BY s.id, s.name
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
    GROUP BY COALESCE(pc.name, p.category, 'Uncategorized')
    ORDER BY total_spend DESC
    `,
    qParams
  )
  return { data: rows, meta: reportMeta(params, rows.length) }
}

export async function restaurantOrderVolume(restaurantId, params) {
  const bucket = dateBucketExpression('co.placed_at', params.granularity)
  const qParams = [restaurantId, params.from, params.to]
  const branch = branchFilter('co', params.branchId, qParams)
  const { rows } = await query(
    `
    SELECT
      ${bucket} AS period,
      COUNT(*)::int AS order_count,
      COALESCE(SUM(co.total_amount), 0)::numeric AS total_amount
    FROM customer_order co
    WHERE co.restaurant_id = $1
      AND co.placed_at >= $2
      AND co.placed_at <= $3
      AND co.status NOT IN ('DRAFT', 'CANCELLED')
      ${branch.sql}
    GROUP BY period
    ORDER BY period
    `,
    qParams
  )
  return { data: rows, meta: reportMeta(params, rows.length) }
}

export async function restaurantCogsTrend(restaurantId, params) {
  const bucket = dateBucketExpression('co.placed_at', params.granularity)
  const qParams = [restaurantId, params.from, params.to]
  const branch = branchFilter('co', params.branchId, qParams)
  const { rows } = await query(
    `
    SELECT
      ${bucket} AS period,
      COALESCE(SUM(oi.line_total), 0)::numeric AS cogs
    FROM customer_order co
    JOIN order_item oi ON oi.order_id = co.id
    WHERE co.restaurant_id = $1
      AND co.placed_at >= $2
      AND co.placed_at <= $3
      AND co.status NOT IN ('DRAFT', 'CANCELLED', 'PENDING_APPROVAL')
      ${branch.sql}
    GROUP BY period
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
    GROUP BY p.id, p.name, p.sku
    ORDER BY total_spend DESC
    LIMIT 20
    `,
    qParams
  )
  return { data: rows, meta: reportMeta(params, rows.length) }
}

export async function restaurantReceivingQuality(restaurantId, params) {
  const qParams = [restaurantId, params.from, params.to]
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
    WHERE rr.restaurant_id = $1
      AND rr.received_at >= $2
      AND rr.received_at <= $3
    GROUP BY s.id, s.name
    ORDER BY report_count DESC
    `,
    qParams
  )
  return { data: rows, meta: reportMeta(params, rows.length) }
}

export async function restaurantWaste(restaurantId, params) {
  const bucket = dateBucketExpression('ia.created_at', params.granularity)
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
    GROUP BY period, ia.waste_category
    ORDER BY period, total_cost DESC
    `,
    [restaurantId, params.from, params.to]
  )
  return { data: rows, meta: reportMeta(params, rows.length) }
}

export async function restaurantInvoiceAging(restaurantId, params) {
  const { rows } = await query(
    `
    SELECT
      CASE
        WHEN i.due_date >= CURRENT_DATE THEN 'current'
        WHEN CURRENT_DATE - i.due_date <= 30 THEN '1_30'
        WHEN CURRENT_DATE - i.due_date <= 60 THEN '31_60'
        WHEN CURRENT_DATE - i.due_date <= 90 THEN '61_90'
        ELSE '90_plus'
      END AS bucket,
      COUNT(*)::int AS invoice_count,
      COALESCE(SUM(i.balance_due), 0)::numeric AS total_balance
    FROM invoice i
    WHERE i.restaurant_id = $1
      AND i.status NOT IN ('PAID', 'VOID')
      AND i.invoice_date >= $2::date
      AND i.invoice_date <= $3::date
    GROUP BY bucket
    ORDER BY bucket
    `,
    [restaurantId, params.from, params.to]
  )
  return { data: rows, meta: reportMeta(params, rows.length) }
}

// --- Supplier reports ---

export async function supplierRevenueTrend(supplierId, params) {
  const bucket = dateBucketExpression('co.placed_at', params.granularity)
  const { rows } = await query(
    `
    SELECT
      ${bucket} AS period,
      COALESCE(SUM(oi.line_total), 0)::numeric AS revenue,
      COUNT(DISTINCT co.id)::int AS order_count
    FROM customer_order co
    JOIN order_item oi ON oi.order_id = co.id
    WHERE oi.supplier_id = $1
      AND co.placed_at >= $2
      AND co.placed_at <= $3
      AND co.status NOT IN ('DRAFT', 'CANCELLED', 'PENDING_APPROVAL')
    GROUP BY period
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
      COALESCE(SUM(oi.line_total), 0)::numeric AS revenue,
      COUNT(DISTINCT co.id)::int AS order_count
    FROM customer_order co
    JOIN order_item oi ON oi.order_id = co.id
    JOIN restaurant r ON r.id = co.restaurant_id
    WHERE oi.supplier_id = $1
      AND co.placed_at >= $2
      AND co.placed_at <= $3
      AND co.status NOT IN ('DRAFT', 'CANCELLED', 'PENDING_APPROVAL')
    GROUP BY r.id, r.name
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
      COALESCE(SUM(oi.quantity), 0)::numeric AS total_qty,
      COALESCE(SUM(oi.line_total), 0)::numeric AS revenue
    FROM customer_order co
    JOIN order_item oi ON oi.order_id = co.id
    JOIN product p ON p.id = oi.product_id
    WHERE oi.supplier_id = $1
      AND co.placed_at >= $2
      AND co.placed_at <= $3
      AND co.status NOT IN ('DRAFT', 'CANCELLED', 'PENDING_APPROVAL')
    GROUP BY p.id, p.name, p.sku
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
        100.0 * COUNT(*) FILTER (WHERE co.status IN ('COMPLETED', 'DELIVERED', 'RECEIVED_FULL', 'RECEIVED_PARTIAL', 'INVOICED'))
        / NULLIF(COUNT(*), 0),
        2
      ) AS completion_rate_pct
    FROM customer_order co
    WHERE EXISTS (
      SELECT 1 FROM order_item oi WHERE oi.order_id = co.id AND oi.supplier_id = $1
    )
      AND co.placed_at >= $2
      AND co.placed_at <= $3
      AND co.status NOT IN ('DRAFT', 'CANCELLED')
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
      COUNT(*)::int AS invoice_count,
      COALESCE(SUM(i.total_amount), 0)::numeric AS total_amount,
      COALESCE(SUM(i.balance_due), 0)::numeric AS balance_due,
      COALESCE(SUM(i.paid_amount), 0)::numeric AS paid_amount
    FROM invoice i
    WHERE i.supplier_id = $1
      AND i.invoice_date >= $2::date
      AND i.invoice_date <= $3::date
    GROUP BY i.status
    ORDER BY invoice_count DESC
    `,
    [supplierId, params.from, params.to]
  )
  return { data: rows, meta: reportMeta(params, rows.length) }
}
