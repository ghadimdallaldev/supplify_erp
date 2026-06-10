import { query } from '../lib/db.js'
import { ValidationError } from '../middlewares/errorHandler.js'
import { listRestaurantReminders } from './reorder-cadence.service.js'
import { listExpiryLots } from './inventory-expiry.service.js'

const URGENCY_RANK = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }

const REASON_LABELS = {
  low_stock: 'Low stock',
  near_expiry: 'Near expiry',
  expired: 'Expired',
  cadence: 'Usually ordered on this day',
  frequent: 'Frequently ordered',
  quick_list: 'On a recurring order list',
  not_ordered_recently: 'Last ordered a while ago',
}

export async function getActiveSuppressions(restaurantId) {
  const { rows } = await query(
    `
    SELECT scope_type, scope_id, action, snooze_until
    FROM reorder_suggestion_suppression
    WHERE restaurant_id = $1
      AND (
        action = 'not_needed'
        OR (action = 'snooze' AND snooze_until > now())
      )
    `,
    [restaurantId]
  )
  return rows
}

function isSuppressed(suppressions, scopeType, scopeId) {
  return suppressions.some((s) => s.scope_type === scopeType && s.scope_id === String(scopeId))
}

async function fetchLowStockSuggestions(restaurantId) {
  const { rows } = await query(
    `
    WITH usage_stats AS (
      SELECT
        iml.product_id,
        COALESCE((
          SELECT SUM(ABS(iml2.quantity))
          FROM inventory_movement_log iml2
          WHERE iml2.restaurant_id = iml.restaurant_id
            AND iml2.product_id = iml.product_id
            AND iml2.type = 'SUBTRACT'
            AND iml2.created_at >= NOW() - INTERVAL '30 days'
        ), 0) / 30.0 AS avg_daily_usage_30day,
        COALESCE((
          SELECT oi.quantity
          FROM order_item oi
          JOIN customer_order co ON co.id = oi.order_id
          WHERE co.restaurant_id = iml.restaurant_id AND oi.product_id = iml.product_id
          ORDER BY co.placed_at DESC NULLS LAST
          LIMIT 1
        ), 0) AS last_order_qty,
        COALESCE((
          SELECT EXTRACT(DAY FROM NOW() - MAX(co.placed_at))::int
          FROM order_item oi
          JOIN customer_order co ON co.id = oi.order_id
          WHERE co.restaurant_id = iml.restaurant_id AND oi.product_id = iml.product_id
        ), 999) AS days_since_last_order
      FROM inventory_movement_log iml
      WHERE iml.restaurant_id = $1
      GROUP BY iml.product_id, iml.restaurant_id
    )
    SELECT
      ri.product_id,
      p.name AS product_name,
      p.unit AS product_unit,
      s.id AS supplier_id,
      s.name AS supplier_name,
      ri.quantity AS current_qty,
      ri.low_stock_threshold,
      COALESCE(us.avg_daily_usage_30day, 0) AS avg_daily_usage_30day,
      COALESCE(us.last_order_qty, 0) AS last_order_qty,
      COALESCE(us.days_since_last_order, 999) AS days_since_last_order,
      COALESCE(pis.lead_time_days, 7) AS lead_time_days,
      CASE
        WHEN ri.quantity <= COALESCE(ri.low_stock_threshold, 0) THEN 'URGENT'
        WHEN COALESCE(us.avg_daily_usage_30day, 0) > 0
          AND ri.quantity / NULLIF(us.avg_daily_usage_30day, 0) < (COALESCE(pis.lead_time_days, 7) + 7) THEN 'HIGH'
        WHEN COALESCE(us.avg_daily_usage_30day, 0) > 0
          AND ri.quantity / NULLIF(us.avg_daily_usage_30day, 0) < (COALESCE(pis.lead_time_days, 7) + 21) THEN 'MEDIUM'
        ELSE 'LOW'
      END AS urgency_level,
      CASE
        WHEN ri.quantity <= COALESCE(ri.low_stock_threshold, 0) THEN
          GREATEST(COALESCE(us.avg_daily_usage_30day, 0) * (COALESCE(pis.lead_time_days, 7) + 14), COALESCE(us.last_order_qty, 1), COALESCE(pis.moq, 1))
        WHEN COALESCE(us.avg_daily_usage_30day, 0) > 0 THEN
          GREATEST(COALESCE(us.avg_daily_usage_30day, 0) * (COALESCE(pis.lead_time_days, 7) + 14) - ri.quantity, COALESCE(pis.moq, 1))
        ELSE NULL
      END AS suggested_reorder_qty
    FROM restaurant_inventory ri
    JOIN product p ON p.id = ri.product_id
    JOIN supplier s ON s.id = p.supplier_id
    LEFT JOIN product_inventory_settings pis ON pis.product_id = p.id
    LEFT JOIN usage_stats us ON us.product_id = ri.product_id
    WHERE ri.restaurant_id = $1
      AND (
        ri.quantity <= COALESCE(ri.low_stock_threshold, 0)
        OR (
          COALESCE(us.avg_daily_usage_30day, 0) > 0
          AND ri.quantity / us.avg_daily_usage_30day < (COALESCE(pis.lead_time_days, 7) + 21)
        )
        OR us.days_since_last_order >= 14
      )
    ORDER BY
      CASE
        WHEN ri.quantity <= COALESCE(ri.low_stock_threshold, 0) THEN 1
        WHEN COALESCE(us.avg_daily_usage_30day, 0) > 0
          AND ri.quantity / us.avg_daily_usage_30day < (COALESCE(pis.lead_time_days, 7) + 14) THEN 2
        ELSE 3
      END,
      ri.quantity ASC
    LIMIT 30
    `,
    [restaurantId]
  )

  return rows.map((row) => {
    const isLow = row.current_qty <= (row.low_stock_threshold || 0)
    const isFrequent = row.avg_daily_usage_30day >= 0.5 && row.days_since_last_order < 14
    let reasonCode = 'not_ordered_recently'
    let reasonLabel = `Last ordered ${row.days_since_last_order} days ago`

    if (isLow) {
      reasonCode = 'low_stock'
      reasonLabel = REASON_LABELS.low_stock
    } else if (isFrequent) {
      reasonCode = 'frequent'
      reasonLabel = REASON_LABELS.frequent
    }

    return {
      id: `stock-${row.product_id}`,
      productId: row.product_id,
      productName: row.product_name,
      productUnit: row.product_unit,
      supplierId: row.supplier_id,
      supplierName: row.supplier_name,
      reasonCode,
      reasonLabel,
      urgency: row.urgency_level,
      suggestedQty: Math.max(1, Math.ceil(row.suggested_reorder_qty || row.last_order_qty || 1)),
      currentQty: parseFloat(row.current_qty),
      scopeType: 'product',
      scopeId: String(row.product_id),
    }
  })
}

async function fetchCadenceSuggestions(restaurantId) {
  const reminders = await listRestaurantReminders(restaurantId)
  return reminders.map((r) => ({
    id: `cadence-${r.id}`,
    cadenceId: r.id,
    productId: null,
    productName: r.label,
    supplierId: r.supplierId,
    supplierName: r.supplierName,
    reasonCode: 'cadence',
    reasonLabel: `Usually ordered every ${r.dayName}`,
    urgency: 'MEDIUM',
    suggestedQty: null,
    scopeType: 'cadence',
    scopeId: String(r.id),
  }))
}

async function fetchExpirySuggestions(restaurantId) {
  const { lots } = await listExpiryLots(restaurantId, {})
  return lots
    .filter((lot) => lot.status === 'expiring_soon' || lot.status === 'expired')
    .slice(0, 15)
    .map((lot) => ({
      id: `expiry-${lot.id}`,
      productId: lot.productId,
      productName: lot.productName || lot.label,
      supplierId: lot.supplierId,
      supplierName: lot.supplierName,
      reasonCode: lot.status === 'expired' ? 'expired' : 'near_expiry',
      reasonLabel: lot.status === 'expired' ? REASON_LABELS.expired : REASON_LABELS.near_expiry,
      urgency: lot.status === 'expired' ? 'URGENT' : 'HIGH',
      suggestedQty: Math.max(1, Math.ceil(lot.quantity || 1)),
      expiryDate: lot.expiryDate,
      scopeType: 'product',
      scopeId: String(lot.productId || lot.id),
    }))
}

async function fetchQuickListSuggestions(restaurantId) {
  const { rows } = await query(
    `
    SELECT DISTINCT ON (qli.product_id)
      qli.product_id,
      qli.quantity,
      p.name AS product_name,
      p.unit AS product_unit,
      ql.supplier_id,
      s.name AS supplier_name,
      ql.name AS quick_list_name,
      ql.frequency
    FROM quick_list ql
    JOIN quick_list_item qli ON qli.quick_list_id = ql.id
    JOIN product p ON p.id = qli.product_id
    JOIN supplier s ON s.id = ql.supplier_id
    WHERE ql.restaurant_id = $1
      AND ql.is_scheduled = true
      AND ql.status = 'ACTIVE'
    ORDER BY qli.product_id, ql.updated_at DESC
    LIMIT 20
    `,
    [restaurantId]
  )

  return rows.map((row) => ({
    id: `quicklist-${row.product_id}`,
    productId: row.product_id,
    productName: row.product_name,
    productUnit: row.product_unit,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    reasonCode: 'quick_list',
    reasonLabel: `On recurring list "${row.quick_list_name}"`,
    urgency: 'MEDIUM',
    suggestedQty: Math.max(1, Math.ceil(parseFloat(row.quantity) || 1)),
    scopeType: 'product',
    scopeId: String(row.product_id),
  }))
}

function mergeAndDedupe(items) {
  const byKey = new Map()
  for (const item of items) {
    const key = `${item.productId || item.cadenceId || item.id}:${item.reasonCode}`
    const existing = byKey.get(key)
    if (!existing || (URGENCY_RANK[item.urgency] || 0) > (URGENCY_RANK[existing.urgency] || 0)) {
      byKey.set(key, item)
    }
  }
  return [...byKey.values()].sort(
    (a, b) => (URGENCY_RANK[b.urgency] || 0) - (URGENCY_RANK[a.urgency] || 0)
  )
}

/**
 * Unified reorder assistance for a restaurant.
 */
export async function getReorderAssistance(restaurantId, { limit = 40 } = {}) {
  const suppressions = await getActiveSuppressions(restaurantId)

  const [stock, cadence, expiry, quickList] = await Promise.all([
    fetchLowStockSuggestions(restaurantId),
    fetchCadenceSuggestions(restaurantId),
    fetchExpirySuggestions(restaurantId),
    fetchQuickListSuggestions(restaurantId),
  ])

  const filtered = [...stock, ...cadence, ...expiry, ...quickList].filter(
    (item) => !isSuppressed(suppressions, item.scopeType, item.scopeId)
  )

  const suggestions = mergeAndDedupe(filtered).slice(0, limit)

  return {
    suggestions,
    total: suggestions.length,
  }
}

export async function suppressReorderSuggestion(
  restaurantId,
  { scopeType, scopeId, action, snoozeDays = 7 }
) {
  if (!['product', 'cadence', 'supplier_product'].includes(scopeType)) {
    throw new ValidationError('Invalid scopeType')
  }
  if (!['snooze', 'not_needed'].includes(action)) {
    throw new ValidationError('Invalid action')
  }
  if (!scopeId) {
    throw new ValidationError('scopeId is required')
  }

  const snoozeUntil =
    action === 'snooze'
      ? new Date(Date.now() + snoozeDays * 24 * 60 * 60 * 1000).toISOString()
      : null

  const { rows } = await query(
    `
    INSERT INTO reorder_suggestion_suppression (
      restaurant_id, scope_type, scope_id, action, snooze_until
    ) VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (restaurant_id, scope_type, scope_id) DO UPDATE SET
      action = EXCLUDED.action,
      snooze_until = EXCLUDED.snooze_until,
      updated_at = now()
    RETURNING *
    `,
    [restaurantId, scopeType, String(scopeId), action, snoozeUntil]
  )

  return rows[0]
}
