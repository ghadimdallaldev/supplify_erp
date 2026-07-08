import { query } from '../lib/db.js'
import { notifyTenantUsers } from './notification/in-app.js'

const DEFAULT_GRACE_DAYS = 7
const MIN_ORDERS_FOR_PATTERN = 2
const LOOKBACK_DAYS = 180

export async function getReorderIntelligence(supplierId, { graceDays = DEFAULT_GRACE_DAYS } = {}) {
  const { rows } = await query(
    `
    WITH restaurant_orders AS (
      SELECT
        o.restaurant_id,
        o.id AS order_id,
        COALESCE(o.placed_at, o.created_at) AS ordered_at
      FROM customer_order o
      JOIN order_item oi ON oi.order_id = o.id AND oi.supplier_id = $1
      WHERE o.status NOT IN ('DRAFT', 'CANCELLED', 'PENDING_APPROVAL')
        AND COALESCE(o.placed_at, o.created_at) >= NOW() - ($2::int || ' days')::interval
    ),
    order_gaps AS (
      SELECT
        restaurant_id,
        ordered_at,
        LAG(ordered_at) OVER (PARTITION BY restaurant_id ORDER BY ordered_at) AS prev_ordered_at
      FROM restaurant_orders
    ),
    cadence AS (
      SELECT
        ro.restaurant_id,
        COUNT(DISTINCT ro.order_id)::int AS order_count,
        MAX(ro.ordered_at) AS last_order_at,
        AVG(
          CASE
            WHEN og.prev_ordered_at IS NOT NULL
            THEN EXTRACT(EPOCH FROM (og.ordered_at - og.prev_ordered_at)) / 86400.0
          END
        ) AS avg_days_between
      FROM restaurant_orders ro
      LEFT JOIN order_gaps og ON og.restaurant_id = ro.restaurant_id AND og.ordered_at = ro.ordered_at
      GROUP BY ro.restaurant_id
      HAVING COUNT(DISTINCT ro.order_id) >= $3
    )
    SELECT
      c.restaurant_id,
      r.name AS restaurant_name,
      c.order_count,
      c.last_order_at,
      COALESCE(c.avg_days_between, 14)::numeric AS avg_days_between
    FROM cadence c
    JOIN restaurant r ON r.id = c.restaurant_id
    WHERE c.last_order_at < NOW() - ((COALESCE(c.avg_days_between, 14) + $4)::text || ' days')::interval
    ORDER BY c.last_order_at ASC
    LIMIT 50
    `,
    [supplierId, LOOKBACK_DAYS, MIN_ORDERS_FOR_PATTERN, graceDays]
  )

  const restaurantIds = rows.map((row) => row.restaurant_id)
  const suggestedByRestaurant = await getSuggestedProductsBatch(supplierId, restaurantIds)

  const dueCustomers = []
  for (const row of rows) {
    const suggestedProducts = suggestedByRestaurant.get(row.restaurant_id) ?? []
    const daysSinceLast = Math.floor(
      (Date.now() - new Date(row.last_order_at).getTime()) / (24 * 60 * 60 * 1000)
    )
    dueCustomers.push({
      restaurantId: row.restaurant_id,
      restaurantName: row.restaurant_name,
      orderCount: row.order_count,
      lastOrderAt: row.last_order_at,
      avgDaysBetween: Math.round(parseFloat(row.avg_days_between) || 14),
      daysSinceLastOrder: daysSinceLast,
      graceDays,
      suggestedFollowUp: `Usually orders every ~${Math.round(parseFloat(row.avg_days_between) || 14)} days. Last order was ${daysSinceLast} days ago.`,
      suggestedProducts,
      riskLevel:
        daysSinceLast > (parseFloat(row.avg_days_between) || 14) + graceDays + 7
          ? 'high'
          : 'medium',
    })
  }

  return {
    dueCount: dueCustomers.length,
    graceDays,
    customersAtRisk: dueCustomers,
  }
}

function mapSuggestedProductRow(r) {
  return {
    productId: r.product_id,
    productName: r.product_name,
    sku: r.sku,
    totalQuantity: parseFloat(r.total_qty) || 0,
    orderCount: r.order_count,
  }
}

async function getSuggestedProductsBatch(supplierId, restaurantIds) {
  const map = new Map()
  if (!restaurantIds.length) return map

  const { rows } = await query(
    `
    WITH ranked AS (
      SELECT
        o.restaurant_id,
        p.id AS product_id,
        p.name AS product_name,
        p.sku,
        SUM(oi.quantity)::numeric AS total_qty,
        COUNT(DISTINCT o.id)::int AS order_count,
        ROW_NUMBER() OVER (
          PARTITION BY o.restaurant_id
          ORDER BY SUM(oi.quantity) DESC
        ) AS rn
      FROM customer_order o
      JOIN order_item oi ON oi.order_id = o.id AND oi.supplier_id = $1
      JOIN product p ON p.id = oi.product_id
      WHERE o.restaurant_id = ANY($2::uuid[])
        AND o.status NOT IN ('DRAFT', 'CANCELLED', 'PENDING_APPROVAL')
      GROUP BY o.restaurant_id, p.id, p.name, p.sku
    )
    SELECT restaurant_id, product_id, product_name, sku, total_qty, order_count
    FROM ranked
    WHERE rn <= 5
    `,
    [supplierId, restaurantIds]
  )

  for (const r of rows) {
    const list = map.get(r.restaurant_id) ?? []
    list.push(mapSuggestedProductRow(r))
    map.set(r.restaurant_id, list)
  }
  return map
}

async function getSuggestedProducts(supplierId, restaurantId) {
  const batch = await getSuggestedProductsBatch(supplierId, [restaurantId])
  return batch.get(restaurantId) ?? []
}

export async function createReorderReminderDraft(supplierId, restaurantId, createdBy) {
  const intelligence = await getReorderIntelligence(supplierId)
  const customer = intelligence.customersAtRisk.find((c) => c.restaurantId === restaurantId)
  if (!customer) {
    return null
  }

  const productLines = customer.suggestedProducts
    .map((p) => `- ${p.productName} (${p.sku})`)
    .join('\n')

  const subject = `Reorder reminder — ${customer.restaurantName}`
  const body = `Hi ${customer.restaurantName},

We noticed it has been ${customer.daysSinceLastOrder} days since your last order. Based on your usual ordering pattern (about every ${customer.avgDaysBetween} days), you may be due for a restock.

Items you often order:
${productLines || '- (see your recent order history)'}

Reply to this message or place an order when convenient.

Thank you,
Your supplier team`

  const { rows } = await query(
    `
    INSERT INTO supplier_reorder_reminder_draft (
      supplier_id, restaurant_id, created_by, subject, body, suggested_products, status
    ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'draft')
    RETURNING *
    `,
    [supplierId, restaurantId, createdBy, subject, body, JSON.stringify(customer.suggestedProducts)]
  )

  return {
    id: rows[0].id,
    status: rows[0].status,
    subject: rows[0].subject,
    body: rows[0].body,
    suggestedProducts: customer.suggestedProducts,
    autoSent: false,
  }
}

export async function sendReorderReminderDraft(supplierId, draftId, sentBy) {
  const { rows } = await query(
    `
    SELECT d.*, r.name AS restaurant_name
    FROM supplier_reorder_reminder_draft d
    JOIN restaurant r ON r.id = d.restaurant_id
    WHERE d.id = $1 AND d.supplier_id = $2 AND d.status = 'draft'
    `,
    [draftId, supplierId]
  )
  if (!rows.length) return null

  const draft = rows[0]
  await notifyTenantUsers({
    tenantId: draft.restaurant_id,
    tenantType: 'RESTAURANT',
    notificationType: 'REORDER',
    notificationCategory: 'reorder_cadence_missed',
    title: draft.subject,
    message: draft.body,
    referenceId: draft.id,
    referenceType: 'REORDER_REMINDER',
    metadata: {
      supplier_id: supplierId,
      draft_id: draft.id,
      sent_by: sentBy || null,
      ctaUrl: '/app/orders',
    },
  })

  const { rows: updated } = await query(
    `
    UPDATE supplier_reorder_reminder_draft
    SET status = 'sent', sent_at = now(), updated_at = now()
    WHERE id = $1
    RETURNING *
    `,
    [draftId]
  )

  return {
    id: updated[0].id,
    status: updated[0].status,
    subject: updated[0].subject,
    body: updated[0].body,
    sent: true,
    restaurantName: draft.restaurant_name,
  }
}
