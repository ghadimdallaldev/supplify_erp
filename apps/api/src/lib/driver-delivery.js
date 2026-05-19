import { query, withTransaction } from './db.js'
import { ValidationError, NotFoundError } from '../middlewares/errorHandler.js'
import { createFulfillmentException } from './fulfillment-exceptions.js'

export const DELIVERY_STATUSES = [
  'assigned',
  'picked_up',
  'out_for_delivery',
  'delivered',
  'failed',
  'reassigned',
]

const NEXT_STATUS = {
  assigned: ['picked_up'],
  picked_up: ['out_for_delivery'],
  out_for_delivery: ['delivered', 'failed'],
}

export async function getSupplierIdForOrder(orderId) {
  const { rows } = await query(`SELECT supplier_id FROM order_item WHERE order_id = $1 LIMIT 1`, [
    orderId,
  ])
  return rows[0]?.supplier_id ?? null
}

export async function getActiveDriverAssignment(orderId, client = null) {
  const run = client ? (sql, params) => client.query(sql, params) : query
  const { rows } = await run(
    `SELECT da.*, d.full_name AS driver_name, d.phone AS driver_phone,
            d.vehicle_type, d.vehicle_plate
     FROM driver_assignments da
     JOIN drivers d ON d.id = da.driver_id
     WHERE da.order_id = $1 AND da.status NOT IN ('reassigned')
     ORDER BY da.created_at DESC
     LIMIT 1`,
    [orderId]
  )
  return rows[0] ?? null
}

export async function assignDriverToOrder({
  orderId,
  supplierId,
  driverId,
  assignedBy,
  warehouseAssignmentId = null,
}) {
  const { rows: drivers } = await query(
    `SELECT id FROM drivers WHERE id = $1 AND supplier_id = $2 AND is_active = true`,
    [driverId, supplierId]
  )
  if (!drivers.length) {
    throw new ValidationError('Driver not found or inactive')
  }

  const active = await getActiveDriverAssignment(orderId)
  if (active && !['delivered', 'failed', 'reassigned'].includes(active.status)) {
    throw new ValidationError('Order already has an active driver assignment')
  }

  return withTransaction(async (client) => {
    const { rows: assignments } = await client.query(
      `INSERT INTO driver_assignments (
         order_id, warehouse_assignment_id, driver_id, supplier_id, assigned_by, status
       ) VALUES ($1, $2, $3, $4, $5, 'assigned')
       RETURNING *`,
      [orderId, warehouseAssignmentId, driverId, supplierId, assignedBy]
    )

    const { rows: orders } = await client.query(`SELECT status FROM customer_order WHERE id = $1`, [
      orderId,
    ])
    if (orders[0] && ['PLACED', 'ACKNOWLEDGED'].includes(orders[0].status)) {
      await client.query(
        `UPDATE customer_order SET status = 'PROCESSING', updated_at = now() WHERE id = $1`,
        [orderId]
      )
    }

    return assignments[0]
  })
}

export async function reassignDriverToOrder({ orderId, supplierId, driverId, assignedBy, reason }) {
  const current = await getActiveDriverAssignment(orderId)
  if (!current) {
    throw new ValidationError('No active assignment to reassign')
  }

  return withTransaction(async (client) => {
    await client.query(
      `UPDATE driver_assignments
       SET status = 'reassigned', notes = COALESCE($2, notes), updated_at = now()
       WHERE id = $1`,
      [current.id, reason ?? null]
    )
    const { rows: assignments } = await client.query(
      `INSERT INTO driver_assignments (
         order_id, warehouse_assignment_id, driver_id, supplier_id, assigned_by, status
       ) VALUES ($1, $2, $3, $4, $5, 'assigned')
       RETURNING *`,
      [orderId, current.warehouse_assignment_id, driverId, supplierId, assignedBy]
    )
    return assignments[0]
  })
}

export async function updateDriverDeliveryStatus({
  orderId,
  supplierId,
  status,
  notes,
  failureReason,
  actorUserId,
}) {
  const assignment = await getActiveDriverAssignment(orderId)
  if (!assignment) {
    throw new ValidationError('No active driver assignment for this order')
  }
  if (assignment.supplier_id !== supplierId) {
    throw new ValidationError('Assignment does not belong to this supplier')
  }

  const allowed = NEXT_STATUS[assignment.status] ?? []
  if (!allowed.includes(status)) {
    throw new ValidationError(
      `Cannot transition from ${assignment.status} to ${status}. Allowed: ${allowed.join(', ') || 'none'}`
    )
  }

  return withTransaction(async (client) => {
    const tsFields = []
    if (status === 'picked_up') tsFields.push('picked_up_at = now()')
    if (status === 'delivered') tsFields.push('delivered_at = now()')
    if (status === 'failed') tsFields.push('failed_at = now()')

    const { rows: updated } = await client.query(
      `UPDATE driver_assignments
       SET status = $1,
           notes = COALESCE($2, notes),
           failure_reason = COALESCE($3, failure_reason),
           updated_at = now()
           ${tsFields.length ? `, ${tsFields.join(', ')}` : ''}
       WHERE id = $4
       RETURNING *`,
      [status, notes ?? null, failureReason ?? null, assignment.id]
    )

    if (status === 'delivered') {
      await client.query(
        `UPDATE customer_order SET status = 'DELIVERED', updated_at = now() WHERE id = $1`,
        [orderId]
      )
    }

    if (status === 'failed') {
      const driverLabel = assignment.driver_name || 'Driver'
      await createFulfillmentException(client, {
        supplierId,
        orderId,
        driverAssignmentId: assignment.id,
        warehouseId: null,
        type: 'failed_delivery',
        description: `${driverLabel}: ${failureReason || notes || 'Delivery failed'}`,
      })
    }

    return updated[0]
  })
}

export async function orderHasProofOfDelivery(orderId) {
  const { rows } = await query(`SELECT id FROM proof_of_delivery WHERE order_id = $1 LIMIT 1`, [
    orderId,
  ])
  return rows.length > 0
}

export async function submitProofOfDelivery({
  orderId,
  supplierId,
  fileKey,
  notes,
  recipientName,
  createdByUserId,
}) {
  const assignment = await getActiveDriverAssignment(orderId)
  const supplierForOrder = await getSupplierIdForOrder(orderId)
  if (supplierForOrder !== supplierId) {
    throw new NotFoundError('Order not found for supplier')
  }

  const { rows } = await query(
    `INSERT INTO proof_of_delivery (
       order_id, driver_assignment_id, delivery_date, delivered_by,
       recipient_name, delivery_photo_url, file_key, notes, delivery_timestamp
     ) VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6, $7, now())
     RETURNING *`,
    [
      orderId,
      assignment?.id ?? null,
      createdByUserId ? String(createdByUserId) : null,
      recipientName ?? null,
      fileKey ?? null,
      fileKey ?? null,
      notes ?? null,
    ]
  )
  return rows[0]
}

export async function confirmProofOfDelivery(orderId, userId) {
  const { rows } = await query(
    `UPDATE proof_of_delivery
     SET confirmed_by = $2, confirmed_at = now()
     WHERE order_id = $1
     RETURNING *`,
    [orderId, userId]
  )
  if (!rows.length) throw new NotFoundError('Proof of delivery not found')
  return rows[0]
}
