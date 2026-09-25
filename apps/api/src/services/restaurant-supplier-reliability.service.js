/**
 * Deterministic supplier-reliability facts for one restaurant.
 *
 * The existing reports service already exposes receiving fill rate and quality.
 * This service composes those records with order completion, driver-assignment
 * delivery timing, and disputes; it does not assign an opaque reliability score
 * or treat missing measurements as a zero.
 */
import { query } from '../lib/db.js'

const DEFAULT_DAYS = 90
const MAX_DAYS = 730

function clampDays(value) {
  const days = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(days)) return DEFAULT_DAYS
  return Math.min(MAX_DAYS, Math.max(7, days))
}

function numberOrNull(value) {
  if (value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function integer(value) {
  return Number.parseInt(String(value ?? 0), 10) || 0
}

/**
 * @param {string} restaurantId
 * @param {{ days?: number }} [opts]
 * @param {Function} [dbQuery]
 */
export async function listSupplierReliability(restaurantId, opts = {}, dbQuery = query) {
  if (!restaurantId) throw new Error('restaurantId is required')
  const days = clampDays(opts.days)

  const { rows } = await dbQuery(
    `
    WITH scoped_orders AS (
      SELECT DISTINCT
        co.id AS order_id,
        oi.supplier_id,
        co.status
      FROM customer_order co
      JOIN order_item oi ON oi.order_id = co.id
      WHERE co.restaurant_id = $1
        AND co.placed_at >= now() - ($2::int * INTERVAL '1 day')
        AND co.status NOT IN ('DRAFT', 'CANCELLED', 'PENDING_APPROVAL')
    ),
    order_metrics AS (
      SELECT
        supplier_id,
        COUNT(*)::int AS orders_placed,
        COUNT(*) FILTER (
          WHERE status IN (
            'COMPLETED', 'DELIVERED', 'RECEIVED_FULL', 'RECEIVED_PARTIAL',
            'RECEIVED_WITH_DISPUTE', 'INVOICED'
          )
        )::int AS completed_orders
      FROM scoped_orders
      GROUP BY supplier_id
    ),
    receiving_metrics AS (
      SELECT
        rr.supplier_id,
        COUNT(*)::int AS receiving_reports,
        COUNT(*) FILTER (WHERE rr.quality_score IS NOT NULL)::int AS quality_scored_reports,
        SUM(rr.total_items_ordered) AS total_items_ordered,
        SUM(rr.total_items_received) AS total_items_received,
        AVG(rr.quality_score) FILTER (WHERE rr.quality_score IS NOT NULL) AS average_quality_score
      FROM receiving_report rr
      WHERE rr.restaurant_id = $1
        AND rr.received_at >= now() - ($2::int * INTERVAL '1 day')
      GROUP BY rr.supplier_id
    ),
    delivery_orders AS (
      SELECT
        so.supplier_id,
        so.order_id,
        BOOL_AND(
          da.delivered_at::date <= da.scheduled_delivery_date
        ) FILTER (WHERE da.scheduled_delivery_date IS NOT NULL) AS delivered_on_time,
        COUNT(*) FILTER (WHERE da.scheduled_delivery_date IS NULL)::int AS untimed_legs
      FROM scoped_orders so
      JOIN driver_assignments da
        ON da.order_id = so.order_id
       AND da.supplier_id = so.supplier_id
       AND da.status = 'delivered'
       AND da.delivered_at IS NOT NULL
      GROUP BY so.supplier_id, so.order_id
    ),
    delivery_metrics AS (
      SELECT
        supplier_id,
        COUNT(*) FILTER (WHERE delivered_on_time IS NOT NULL)::int AS timed_deliveries,
        COUNT(*) FILTER (WHERE delivered_on_time = true)::int AS on_time_deliveries,
        COUNT(*) FILTER (WHERE delivered_on_time = false)::int AS late_deliveries,
        COUNT(*) FILTER (WHERE delivered_on_time IS NULL)::int AS deliveries_without_schedule
      FROM delivery_orders
      GROUP BY supplier_id
    ),
    dispute_metrics AS (
      SELECT
        d.supplier_id,
        COUNT(DISTINCT d.order_id)::int AS disputed_orders,
        COUNT(DISTINCT d.order_id) FILTER (
          WHERE d.status IN ('open', 'under_review', 'escalated')
        )::int AS unresolved_disputed_orders
      FROM disputes d
      WHERE d.restaurant_id = $1
        AND d.created_at >= now() - ($2::int * INTERVAL '1 day')
      GROUP BY d.supplier_id
    ),
    suppliers AS (
      SELECT supplier_id FROM order_metrics
      UNION SELECT supplier_id FROM receiving_metrics
      UNION SELECT supplier_id FROM delivery_metrics
      UNION SELECT supplier_id FROM dispute_metrics
    )
    SELECT
      s.id AS supplier_id,
      s.name AS supplier_name,
      om.orders_placed,
      om.completed_orders,
      rm.receiving_reports,
      rm.quality_scored_reports,
      rm.total_items_ordered,
      rm.total_items_received,
      rm.average_quality_score,
      dm.timed_deliveries,
      dm.on_time_deliveries,
      dm.late_deliveries,
      dm.deliveries_without_schedule,
      dsm.disputed_orders,
      dsm.unresolved_disputed_orders
    FROM suppliers source
    JOIN supplier s ON s.id = source.supplier_id
    LEFT JOIN order_metrics om ON om.supplier_id = source.supplier_id
    LEFT JOIN receiving_metrics rm ON rm.supplier_id = source.supplier_id
    LEFT JOIN delivery_metrics dm ON dm.supplier_id = source.supplier_id
    LEFT JOIN dispute_metrics dsm ON dsm.supplier_id = source.supplier_id
    ORDER BY s.name ASC
    `,
    [restaurantId, days]
  )

  const suppliers = rows.map((row) => {
    const ordersPlaced = integer(row.orders_placed)
    const completedOrders = integer(row.completed_orders)
    const totalItemsOrdered = numberOrNull(row.total_items_ordered)
    const totalItemsReceived = numberOrNull(row.total_items_received)
    const fillRatePct =
      totalItemsOrdered !== null && totalItemsReceived !== null && totalItemsOrdered > 0
        ? (totalItemsReceived / totalItemsOrdered) * 100
        : null
    const timedDeliveries = integer(row.timed_deliveries)
    const onTimeDeliveries = integer(row.on_time_deliveries)
    const lateDeliveries = integer(row.late_deliveries)
    const unresolvedDisputedOrders = integer(row.unresolved_disputed_orders)

    // These are objective operational exceptions, not an invented score or
    // arbitrary reliability threshold.
    const signals = [
      fillRatePct !== null && fillRatePct < 100 && 'short_receipt',
      lateDeliveries > 0 && 'late_delivery',
      unresolvedDisputedOrders > 0 && 'open_dispute',
    ].filter(Boolean)

    return {
      supplierId: row.supplier_id,
      supplierName: row.supplier_name,
      orders: {
        placed: ordersPlaced,
        completed: completedOrders,
        completionRatePct: ordersPlaced > 0 ? (completedOrders / ordersPlaced) * 100 : null,
      },
      receiving: {
        reports: integer(row.receiving_reports),
        fillRatePct,
        averageQualityScore: numberOrNull(row.average_quality_score),
        qualityScoredReports: integer(row.quality_scored_reports),
      },
      delivery: {
        timedDeliveries,
        onTimeDeliveries,
        lateDeliveries,
        deliveriesWithoutSchedule: integer(row.deliveries_without_schedule),
        onTimeRatePct: timedDeliveries > 0 ? (onTimeDeliveries / timedDeliveries) * 100 : null,
      },
      disputes: {
        disputedOrders: integer(row.disputed_orders),
        unresolvedDisputedOrders,
      },
      signals,
    }
  })

  return { windowDays: days, suppliers }
}
