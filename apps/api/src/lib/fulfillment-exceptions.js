import { query } from './db.js'

const ACTIVE_ASSIGNMENT_STATUSES = ['assigned', 'picked_up', 'out_for_delivery']

/**
 * Create an open fulfillment exception if none exists for this order + type.
 */
export async function createFulfillmentException(
  client,
  { supplierId, orderId, driverAssignmentId = null, warehouseId = null, type, description }
) {
  const db = client || { query }
  const q = client ? client.query.bind(client) : query

  const { rows: existing } = await q(
    `SELECT id FROM fulfillment_exceptions
     WHERE order_id = $1 AND type = $2 AND status = 'open'
     LIMIT 1`,
    [orderId, type]
  )
  if (existing.length) return null

  const { rows } = await q(
    `INSERT INTO fulfillment_exceptions (
       supplier_id, order_id, driver_assignment_id, warehouse_id, type, description
     ) VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [supplierId, orderId, driverAssignmentId, warehouseId, type, description]
  )
  return rows[0]
}

export async function countActiveDeliveriesForDriver(driverId) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS count FROM driver_assignments
     WHERE driver_id = $1 AND status = ANY($2::text[])`,
    [driverId, ACTIVE_ASSIGNMENT_STATUSES]
  )
  return rows[0]?.count ?? 0
}
