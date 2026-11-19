import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'

/** Outstanding physical supply; receipt quantities are deducted exactly once per order line. */
export async function loadIncomingSupply(restaurantId, productIds, { branchId = null } = {}) {
  const ids = [...new Set(productIds.filter(Boolean))]
  if (!ids.length) return { known: true, products: new Map() }
  try {
    const { rows } = await query(
      `SELECT oi.product_id,
        GREATEST(0, oi.quantity - COALESCE(receipts.received, 0))::float AS quantity,
        co.requested_delivery_date::text AS delivery_date,
        COALESCE(receipts.units_known, true) AS units_known,
        (co.requested_delivery_date < (now() AT TIME ZONE COALESCE(NULLIF(r.timezone, ''), 'UTC'))::date) AS overdue,
        (co.requested_delivery_date IS NOT NULL AND co.status::text IN ('ACKNOWLEDGED','PROCESSING','SHIPPED','INVOICED','RECEIVED_PARTIAL')) AS dependable
       FROM order_item oi
       JOIN customer_order co ON co.id = oi.order_id
       JOIN restaurant r ON r.id = co.restaurant_id
       JOIN product p ON p.id = oi.product_id
       LEFT JOIN LATERAL (
         SELECT SUM(rli.received_quantity) AS received,
           BOOL_AND(lower(trim(rli.unit)) = lower(trim(p.unit))) AS units_known
         FROM receiving_line_item rli JOIN receiving_report rr ON rr.id = rli.receiving_report_id
         WHERE rli.order_item_id = oi.id AND rr.restaurant_id = co.restaurant_id
           AND rr.status IN ('ACCEPTED','PARTIAL','REJECTED')
       ) receipts ON true
       WHERE co.restaurant_id = $1 AND oi.product_id = ANY($2::uuid[])
         AND ($3::uuid IS NULL OR co.branch_id = $3)
         AND co.status::text IN ('PLACED','ACKNOWLEDGED','PROCESSING','SHIPPED','INVOICED','RECEIVED_PARTIAL')`,
      [restaurantId, ids, branchId]
    )
    const products = new Map()
    for (const row of rows) {
      const value = products.get(row.product_id) || {
        confirmed: 0,
        uncertain: 0,
        overdue: 0,
        deliveries: [],
        known: true,
      }
      if (row.units_known === false) value.known = false
      const quantity = Math.max(0, Number(row.quantity) || 0)
      if (row.overdue) value.overdue += quantity
      else if (row.dependable) value.confirmed += quantity
      else value.uncertain += quantity
      if (quantity > 0)
        value.deliveries.push({
          quantity,
          date: row.delivery_date,
          dependable: Boolean(row.dependable && !row.overdue),
        })
      products.set(row.product_id, value)
    }
    return { known: true, products }
  } catch (error) {
    logger.warn('Incoming reorder supply unavailable', { restaurantId, error: error.message })
    return { known: false, products: new Map() }
  }
}
