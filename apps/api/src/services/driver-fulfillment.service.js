import { query, withTransaction } from '../lib/db.js'
import { NotFoundError, ValidationError } from '../middlewares/errorHandler.js'
import { createFulfillmentException } from '../lib/fulfillment-exceptions.js'
import { syncWarehouseFulfillmentOnOrderStatus } from './warehouseInventory.js'
import { notifyOrderStatusChange } from './notification.service.js'

export const DRIVER_STATUS_TRANSITIONS = {
  assigned: ['picked_up', 'failed', 'reassigned', 'rescheduled'],
  picked_up: ['out_for_delivery', 'failed', 'rescheduled'],
  out_for_delivery: ['delivered', 'failed', 'rescheduled'],
  rescheduled: ['assigned'],
}

const ACTIVE_ASSIGNMENT_STATUSES = ['assigned', 'picked_up', 'out_for_delivery']

export async function assertSupplierOwnsOrder(supplierId, orderId) {
  const { rows } = await query(
    `SELECT o.id, o.status, o.restaurant_id
     FROM customer_order o
     JOIN order_item oi ON oi.order_id = o.id AND oi.supplier_id = $1
     WHERE o.id = $2
     LIMIT 1`,
    [supplierId, orderId]
  )
  if (!rows.length) throw new NotFoundError('Order not found')
  return rows[0]
}

export async function getActiveDriverAssignment(orderId) {
  const { rows } = await query(
    `SELECT da.*, d.full_name AS driver_name, d.phone AS driver_phone,
            d.vehicle_type, d.vehicle_plate
     FROM driver_assignments da
     JOIN drivers d ON d.id = da.driver_id
     WHERE da.order_id = $1 AND da.status = ANY($2::text[])
     ORDER BY da.assigned_at DESC
     LIMIT 1`,
    [orderId, ACTIVE_ASSIGNMENT_STATUSES]
  )
  return rows[0] ?? null
}

export async function assignDriverToOrder({ supplierId, orderId, driverId, assignedByUserId }) {
  const order = await assertSupplierOwnsOrder(supplierId, orderId)

  const { rows: drivers } = await query(
    `SELECT id, warehouse_id FROM drivers
     WHERE id = $1 AND supplier_id = $2 AND is_active = TRUE`,
    [driverId, supplierId]
  )
  if (!drivers.length) throw new ValidationError('Driver not found or inactive')

  const existing = await getActiveDriverAssignment(orderId)
  if (existing) {
    throw new ValidationError('Order already has an active driver assignment')
  }

  const { rows: whRows } = await query(
    `SELECT id FROM order_warehouse_assignment
     WHERE order_id = $1
     ORDER BY assigned_at DESC NULLS LAST
     LIMIT 1`,
    [orderId]
  )

  return withTransaction(async (client) => {
    const current = await getActiveDriverAssignment(orderId)
    if (current) throw new ValidationError('Order already has an active driver assignment')

    const { rows: assignments } = await client.query(
      `INSERT INTO driver_assignments (
         order_id, warehouse_assignment_id, driver_id, supplier_id, assigned_by, status
       ) VALUES ($1, $2, $3, $4, $5, 'assigned')
       RETURNING *`,
      [orderId, whRows[0]?.id ?? null, driverId, supplierId, assignedByUserId ?? null]
    )

    if (['PLACED', 'ACKNOWLEDGED'].includes(order.status)) {
      await client.query(
        `UPDATE customer_order SET status = 'PROCESSING', updated_at = now() WHERE id = $1`,
        [orderId]
      )
      await syncWarehouseFulfillmentOnOrderStatus(client, orderId, 'PROCESSING', order.status)
    }

    return assignments[0]
  })
}

export async function updateDeliveryStatus({
  supplierId,
  orderId,
  status,
  notes,
  failureReason,
  userId,
}) {
  const assignment = await getActiveDriverAssignment(orderId)
  if (!assignment || assignment.supplier_id !== supplierId) {
    throw new ValidationError('No active driver assignment for this order')
  }

  const allowed = DRIVER_STATUS_TRANSITIONS[assignment.status] ?? []
  if (!allowed.includes(status)) {
    throw new ValidationError(`Cannot transition from ${assignment.status} to ${status}`)
  }

  return withTransaction(async (client) => {
    let assignmentUpdate = `status = $1, notes = COALESCE($2, notes), updated_at = now()`
    const params = [status, notes ?? null]

    if (status === 'picked_up') {
      assignmentUpdate += `, picked_up_at = COALESCE(picked_up_at, now())`
    } else if (status === 'delivered') {
      assignmentUpdate += `, delivered_at = now()`
    } else if (status === 'failed') {
      assignmentUpdate += `, failed_at = now(), failure_reason = $3`
      params.push(failureReason ?? null)
    } else if (status === 'rescheduled') {
      assignmentUpdate += `, notes = COALESCE($2, notes)`
    }

    const whereParam = params.length + 1
    params.push(assignment.id)

    await client.query(
      `UPDATE driver_assignments SET ${assignmentUpdate} WHERE id = $${whereParam}`,
      params
    )

    const { rows: whRows } = await client.query(
      `SELECT warehouse_id FROM order_warehouse_assignment
       WHERE id = $1`,
      [assignment.warehouse_assignment_id]
    )
    const warehouseId = whRows[0]?.warehouse_id ?? null

    if (status === 'delivered') {
      const { rows: orders } = await client.query(
        `SELECT status FROM customer_order WHERE id = $1`,
        [orderId]
      )
      const oldStatus = orders[0]?.status
      await client.query(
        `UPDATE customer_order SET status = 'COMPLETED', updated_at = now() WHERE id = $1`,
        [orderId]
      )
      await syncWarehouseFulfillmentOnOrderStatus(client, orderId, 'COMPLETED', oldStatus)
      await client.query(
        `UPDATE order_warehouse_assignment
         SET status = 'delivered'
         WHERE order_id = $1 AND status NOT IN ('delivered', 'failed')`,
        [orderId]
      )
    }

    if (status === 'failed') {
      await client.query(
        `UPDATE order_warehouse_assignment
         SET status = 'failed'
         WHERE order_id = $1 AND status NOT IN ('delivered', 'failed')`,
        [orderId]
      )
      await createFulfillmentException(client, {
        supplierId,
        orderId,
        driverAssignmentId: assignment.id,
        warehouseId,
        type: 'failed_delivery',
        description: failureReason
          ? `Driver delivery failed: ${failureReason}`
          : 'Driver marked delivery as failed',
      })
    }

    const { rows: updatedAssignment } = await client.query(
      `SELECT da.*, d.full_name AS driver_name
       FROM driver_assignments da
       JOIN drivers d ON d.id = da.driver_id
       WHERE da.id = $1`,
      [assignment.id]
    )

    if (status === 'delivered') {
      try {
        const { rows: orderRows } = await query(
          `SELECT o.*, s.name AS supplier_name
           FROM customer_order o
           JOIN order_item oi ON oi.order_id = o.id
           JOIN supplier s ON s.id = oi.supplier_id
           WHERE o.id = $1
           LIMIT 1`,
          [orderId]
        )
        if (orderRows[0]) {
          orderRows[0].supplier_id = supplierId
          await notifyOrderStatusChange(orderRows[0], 'COMPLETED')
        }
      } catch {
        /* non-blocking */
      }
    }

    return updatedAssignment[0]
  })
}

export async function reassignDriver({ supplierId, orderId, driverId, reason, assignedByUserId }) {
  const assignment = await getActiveDriverAssignment(orderId)
  if (!assignment || assignment.supplier_id !== supplierId) {
    throw new ValidationError('No active driver assignment to reassign')
  }

  return withTransaction(async (client) => {
    await client.query(
      `UPDATE driver_assignments
       SET status = 'reassigned', notes = COALESCE($1, notes), updated_at = now()
       WHERE id = $2`,
      [reason ?? null, assignment.id]
    )

    const { rows: drivers } = await client.query(
      `SELECT id FROM drivers
       WHERE id = $1 AND supplier_id = $2 AND is_active = TRUE`,
      [driverId, supplierId]
    )
    if (!drivers.length) throw new ValidationError('Driver not found or inactive')

    const { rows: created } = await client.query(
      `INSERT INTO driver_assignments (
         order_id, warehouse_assignment_id, driver_id, supplier_id, assigned_by, status, notes
       ) VALUES ($1, $2, $3, $4, $5, 'assigned', $6)
       RETURNING *`,
      [
        orderId,
        assignment.warehouse_assignment_id,
        driverId,
        supplierId,
        assignedByUserId ?? null,
        reason ?? null,
      ]
    )
    return created[0]
  })
}

export async function submitProofOfDelivery({
  orderId,
  supplierId,
  fileKey,
  notes,
  recipientName,
  driverAssignmentId,
  userId,
}) {
  await assertSupplierOwnsOrder(supplierId, orderId)
  const assignment =
    driverAssignmentId != null
      ? (
          await query(`SELECT id FROM driver_assignments WHERE id = $1 AND order_id = $2`, [
            driverAssignmentId,
            orderId,
          ])
        ).rows[0]
      : (
          await query(
            `SELECT id FROM driver_assignments
             WHERE order_id = $1 AND status = 'delivered'
             ORDER BY delivered_at DESC NULLS LAST LIMIT 1`,
            [orderId]
          )
        ).rows[0]

  const { rows } = await query(
    `INSERT INTO proof_of_delivery (
       order_id, driver_assignment_id, delivery_date, delivered_by,
       recipient_name, file_key, notes, delivery_timestamp
     ) VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6, now())
     RETURNING *`,
    [
      orderId,
      assignment?.id ?? null,
      userId ?? null,
      recipientName ?? null,
      fileKey ?? null,
      notes ?? null,
    ]
  )
  return rows[0]
}

export async function confirmProofOfDelivery(orderId, restaurantId, userId) {
  const { rows } = await query(
    `UPDATE proof_of_delivery pod
     SET confirmed_by = $1, confirmed_at = now()
     FROM customer_order o
     WHERE pod.order_id = o.id AND o.id = $2 AND o.restaurant_id = $3
     RETURNING pod.*`,
    [userId, orderId, restaurantId]
  )
  if (!rows.length) throw new NotFoundError('Proof of delivery not found')
  return rows[0]
}

export async function getProofOfDelivery(orderId, supplierId = null) {
  if (supplierId) {
    await assertSupplierOwnsOrder(supplierId, orderId)
  }
  const { rows } = await query(
    `SELECT * FROM proof_of_delivery WHERE order_id = $1 ORDER BY delivery_timestamp DESC LIMIT 1`,
    [orderId]
  )
  return rows[0] ?? null
}
