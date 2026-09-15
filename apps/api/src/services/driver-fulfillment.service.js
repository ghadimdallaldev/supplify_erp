import { query, withTransaction } from '../lib/db.js'
import { NotFoundError, ValidationError } from '../middlewares/errorHandler.js'
import { logger } from '../lib/logger.js'
import { buildObjectPublicUrl } from './storage/storage.service.js'
import { createFulfillmentException } from '../lib/fulfillment-exceptions.js'
import {
  syncWarehouseFulfillmentOnOrderStatus,
  releaseInventoryForFailedDelivery,
  markWarehouseAssignmentDelivered,
  releaseInventoryForAssignment,
  allWarehouseAssignmentsDelivered,
} from './warehouseInventory.js'
import { notifyOrderStatusChange, notifyDriverDeliveryMilestone } from './notification.service.js'
import { invalidateDispatchCacheForSupplier } from '../lib/dispatch-cache.js'
import { assertPodPresentWhenRequired } from '../lib/pod-requirement.js'

function dbQuery(client) {
  return client ? (text, params) => client.query(text, params) : query
}

/** Run irreversible side effects after DB commit; failures must not undo committed state. */
export async function runDeliveryPostCommitEffects(effects = []) {
  for (const effect of effects) {
    try {
      await effect()
    } catch (error) {
      logger.warn({
        event: 'delivery.status.side_effect.failed',
        error: error?.message ?? String(error),
      })
    }
  }
}

export const DRIVER_STATUS_TRANSITIONS = {
  assigned: ['picked_up', 'out_for_delivery', 'failed', 'reassigned', 'rescheduled'],
  picked_up: ['out_for_delivery', 'failed', 'rescheduled'],
  out_for_delivery: ['delivered', 'failed', 'rescheduled'],
  rescheduled: ['assigned'],
}

const ACTIVE_ASSIGNMENT_STATUSES = ['assigned', 'picked_up', 'out_for_delivery']
const NON_REASSIGNED_STATUSES = ['reassigned', 'superseded']

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

export async function assertRestaurantOwnsOrder(restaurantId, orderId) {
  const { rows } = await query(
    `SELECT id FROM customer_order WHERE id = $1 AND restaurant_id = $2 LIMIT 1`,
    [orderId, restaurantId]
  )
  if (!rows.length) throw new NotFoundError('Order not found')
  return rows[0]
}

export async function getActiveDriverAssignment(
  orderId,
  warehouseAssignmentId = null,
  { client = null, forUpdate = false } = {}
) {
  const run = dbQuery(client)
  const lock = forUpdate && client ? ' FOR UPDATE OF da' : ''
  if (warehouseAssignmentId) {
    const { rows } = await run(
      `SELECT da.*, d.full_name AS driver_name, d.phone AS driver_phone,
              d.vehicle_type, d.vehicle_plate
       FROM driver_assignments da
       JOIN drivers d ON d.id = da.driver_id
       WHERE da.order_id = $1
         AND da.warehouse_assignment_id = $2
         AND da.status = ANY($3::text[])
       ORDER BY da.assigned_at DESC
       LIMIT 1${lock}`,
      [orderId, warehouseAssignmentId, ACTIVE_ASSIGNMENT_STATUSES]
    )
    return rows[0] ?? null
  }

  const { rows } = await run(
    `SELECT da.*, d.full_name AS driver_name, d.phone AS driver_phone,
            d.vehicle_type, d.vehicle_plate
     FROM driver_assignments da
     JOIN drivers d ON d.id = da.driver_id
     WHERE da.order_id = $1 AND da.status = ANY($2::text[])
     ORDER BY da.assigned_at DESC
     LIMIT 1${lock}`,
    [orderId, ACTIVE_ASSIGNMENT_STATUSES]
  )
  return rows[0] ?? null
}

export async function listActiveDriverAssignments(
  orderId,
  { client = null, forUpdate = false } = {}
) {
  const run = dbQuery(client)
  const lock = forUpdate && client ? ' FOR UPDATE OF da' : ''
  const { rows } = await run(
    `SELECT da.*, d.full_name AS driver_name, d.phone AS driver_phone,
            d.vehicle_type, d.vehicle_plate
     FROM driver_assignments da
     JOIN drivers d ON d.id = da.driver_id
     WHERE da.order_id = $1 AND da.status = ANY($2::text[])
     ORDER BY da.assigned_at DESC${lock}`,
    [orderId, ACTIVE_ASSIGNMENT_STATUSES]
  )
  return rows
}

export async function getLatestDriverAssignment(
  orderId,
  { client = null, forUpdate = false } = {}
) {
  const run = dbQuery(client)
  const lock = forUpdate && client ? ' FOR UPDATE OF da' : ''
  const { rows } = await run(
    `SELECT da.*, d.full_name AS driver_name, d.phone AS driver_phone,
            d.vehicle_type, d.vehicle_plate
     FROM driver_assignments da
     JOIN drivers d ON d.id = da.driver_id
     WHERE da.order_id = $1 AND da.status <> ALL($2::text[])
     ORDER BY da.created_at DESC
     LIMIT 1${lock}`,
    [orderId, NON_REASSIGNED_STATUSES]
  )
  return rows[0] ?? null
}

const DRIVER_ASSIGNMENT_SELECT = `da.*, d.full_name AS driver_name, d.phone AS driver_phone,
            d.vehicle_type, d.vehicle_plate`

async function resolveDriverAssignmentForStatusUpdate({
  orderId,
  status,
  driverAssignmentId,
  warehouseAssignmentId,
  client = null,
  forUpdate = false,
}) {
  const run = dbQuery(client)
  const lock = forUpdate && client ? ' FOR UPDATE OF da' : ''
  if (driverAssignmentId) {
    const { rows } = await run(
      `SELECT ${DRIVER_ASSIGNMENT_SELECT}
       FROM driver_assignments da
       JOIN drivers d ON d.id = da.driver_id
       WHERE da.id = $1 AND da.order_id = $2
       LIMIT 1${lock}`,
      [driverAssignmentId, orderId]
    )
    if (!rows.length) {
      throw new ValidationError('Driver assignment not found for this order')
    }
    return rows[0]
  }

  if (warehouseAssignmentId) {
    const assignment = await getActiveDriverAssignment(orderId, warehouseAssignmentId, {
      client,
      forUpdate,
    })
    if (!assignment) {
      throw new ValidationError('No active driver assignment for this warehouse leg')
    }
    return assignment
  }

  if (status === 'assigned') {
    return getLatestDriverAssignment(orderId, { client, forUpdate })
  }

  const active = await listActiveDriverAssignments(orderId, { client, forUpdate })
  if (active.length === 0) return null
  if (active.length === 1) return active[0]
  throw new ValidationError(
    'Multiple active driver assignments exist; specify driver_assignment_id or warehouse_assignment_id'
  )
}

export async function assignDriverToOrder({
  supplierId,
  orderId,
  driverId,
  assignedByUserId,
  warehouseAssignmentId = null,
  assignAllWarehouseLegs = false,
}) {
  const order = await assertSupplierOwnsOrder(supplierId, orderId)

  const { rows: drivers } = await query(
    `SELECT id, warehouse_id FROM drivers
     WHERE id = $1 AND supplier_id = $2 AND is_active = TRUE`,
    [driverId, supplierId]
  )
  if (!drivers.length) throw new ValidationError('Driver not found or inactive')

  const { rows: openWhAssignments } = await query(
    `SELECT id, warehouse_id
     FROM order_warehouse_assignment
     WHERE order_id = $1 AND status NOT IN ('failed', 'delivered', 'superseded')
     ORDER BY
       CASE WHEN $2::uuid IS NOT NULL AND warehouse_id = $2::uuid THEN 0 ELSE 1 END,
       assigned_at DESC NULLS LAST`,
    [orderId, drivers[0].warehouse_id ?? null]
  )

  let targetWhAssignmentIds = []
  if (warehouseAssignmentId) {
    const match = openWhAssignments.find((row) => row.id === warehouseAssignmentId)
    if (!match) {
      throw new ValidationError('Warehouse assignment not found for this order')
    }
    targetWhAssignmentIds = [warehouseAssignmentId]
  } else if (assignAllWarehouseLegs || openWhAssignments.length > 1) {
    // Multi-WH: create/link a driver leg for every open warehouse assignment that is free.
    targetWhAssignmentIds = openWhAssignments.map((row) => row.id)
  } else if (openWhAssignments.length === 1) {
    targetWhAssignmentIds = [openWhAssignments[0].id]
  } else {
    targetWhAssignmentIds = [null]
  }

  const created = await withTransaction(async (client) => {
    const results = []
    for (const whAssignmentId of targetWhAssignmentIds) {
      if (whAssignmentId) {
        const { rows: existingForLeg } = await client.query(
          `SELECT id FROM driver_assignments
           WHERE order_id = $1
             AND warehouse_assignment_id = $2
             AND status = ANY($3::text[])
           LIMIT 1`,
          [orderId, whAssignmentId, ACTIVE_ASSIGNMENT_STATUSES]
        )
        if (existingForLeg.length) {
          if (warehouseAssignmentId) {
            throw new ValidationError('This warehouse leg already has an active driver assignment')
          }
          continue
        }
      } else {
        const current = await getActiveDriverAssignment(orderId)
        if (current) throw new ValidationError('Order already has an active driver assignment')
      }

      const { rows: assignments } = await client.query(
        `INSERT INTO driver_assignments (
           order_id, warehouse_assignment_id, driver_id, supplier_id, assigned_by, status,
           scheduled_delivery_date
         ) VALUES ($1, $2, $3, $4, $5, 'assigned', CURRENT_DATE)
         RETURNING *`,
        [orderId, whAssignmentId, driverId, supplierId, assignedByUserId ?? null]
      )
      results.push(assignments[0])
    }

    if (!results.length) {
      throw new ValidationError('All warehouse legs already have active driver assignments')
    }

    if (['PLACED', 'ACKNOWLEDGED'].includes(order.status)) {
      await client.query(
        `UPDATE customer_order SET status = 'PROCESSING', updated_at = now() WHERE id = $1`,
        [orderId]
      )
      await syncWarehouseFulfillmentOnOrderStatus(client, orderId, 'PROCESSING', order.status)
    }

    return results
  })

  try {
    const { rows: orderRows } = await query(
      `SELECT o.*, r.name AS restaurant_name
       FROM customer_order o
       JOIN restaurant r ON r.id = o.restaurant_id
       WHERE o.id = $1`,
      [orderId]
    )
    const { rows: driverRows } = await query(`SELECT full_name FROM drivers WHERE id = $1`, [
      driverId,
    ])
    if (orderRows[0]) {
      await notifyDriverDeliveryMilestone({
        order: orderRows[0],
        supplierId,
        milestone: 'driver_assigned',
        driverName: driverRows[0]?.full_name,
        driverId,
      })
    }
  } catch {
    /* non-blocking */
  }

  await invalidateDispatchCacheForSupplier(supplierId)
  // Backward compatible: single assignment object when one leg; array when multi.
  return created.length === 1 ? created[0] : created
}

/**
 * Advance a driver assignment status.
 *
 * @param {object} opts
 * @param {import('pg').PoolClient} [opts.client] - When set, DB work joins this transaction
 *   (caller owns COMMIT/ROLLBACK). Notifications are queued on `postCommitEffects` and must
 *   run only after the outer transaction commits.
 * @param {Array<() => Promise<void>>} [opts.postCommitEffects] - Mutable bag for deferred
 *   side effects when `client` is provided. Ignored for standalone calls (effects run after
 *   this function's own commit).
 */
export async function updateDeliveryStatus({
  supplierId,
  orderId,
  status,
  notes,
  failureReason,
  userId,
  driverAssignmentId = null,
  warehouseAssignmentId = null,
  client = null,
  postCommitEffects = null,
}) {
  if (client) {
    return applyDeliveryStatusUpdate({
      supplierId,
      orderId,
      status,
      notes,
      failureReason,
      driverAssignmentId,
      warehouseAssignmentId,
      client,
      postCommitEffects: postCommitEffects ?? [],
    })
  }

  // Fast path (unlocked): preserve prior behavior of skipping a transaction on no-ops.
  const peek = await resolveDriverAssignmentForStatusUpdate({
    orderId,
    status,
    driverAssignmentId,
    warehouseAssignmentId,
  })
  if (!peek || peek.supplier_id !== supplierId) {
    throw new ValidationError('No active driver assignment for this order')
  }
  if (status === 'assigned' && peek.status !== 'rescheduled') {
    throw new ValidationError('Only rescheduled assignments can be marked ready to dispatch')
  }
  if (peek.status === status) {
    if (notes == null && !(status === 'failed' && failureReason)) {
      return peek
    }
  } else {
    const allowed = DRIVER_STATUS_TRANSITIONS[peek.status] ?? []
    if (!allowed.includes(status)) {
      throw new ValidationError(`Cannot transition from ${peek.status} to ${status}`)
    }
  }

  await assertPodPresentWhenRequired({ supplierId, orderId, status })

  const effects = []
  const result = await withTransaction((txClient) =>
    applyDeliveryStatusUpdate({
      supplierId,
      orderId,
      status,
      notes,
      failureReason,
      driverAssignmentId,
      warehouseAssignmentId,
      client: txClient,
      postCommitEffects: effects,
      // Skip duplicate transition/POD checks already done unlocked; re-validate under lock.
      skipPrechecks: false,
    })
  )
  await runDeliveryPostCommitEffects(effects)
  await invalidateDispatchCacheForSupplier(supplierId)
  return result
}

async function applyDeliveryStatusUpdate({
  supplierId,
  orderId,
  status,
  notes,
  failureReason,
  driverAssignmentId,
  warehouseAssignmentId,
  client,
  postCommitEffects,
}) {
  const assignment = await resolveDriverAssignmentForStatusUpdate({
    orderId,
    status,
    driverAssignmentId,
    warehouseAssignmentId,
    client,
    forUpdate: true,
  })
  if (!assignment || assignment.supplier_id !== supplierId) {
    throw new ValidationError('No active driver assignment for this order')
  }

  if (status === 'assigned' && assignment.status !== 'rescheduled') {
    throw new ValidationError('Only rescheduled assignments can be marked ready to dispatch')
  }

  if (assignment.status === status) {
    if (notes == null && !(status === 'failed' && failureReason)) {
      return assignment
    }
  } else {
    const allowed = DRIVER_STATUS_TRANSITIONS[assignment.status] ?? []
    if (!allowed.includes(status)) {
      throw new ValidationError(`Cannot transition from ${assignment.status} to ${status}`)
    }
  }

  // Validate POD against the locked transaction snapshot before mutating.
  await assertPodPresentWhenRequired({
    supplierId,
    orderId,
    status,
    dbQuery: (text, params) => client.query(text, params),
  })

  let assignmentUpdate = `status = $1, notes = COALESCE($2, notes), updated_at = now()`
  const params = [status, notes ?? null]
  let orderMarkedDelivered = false

  if (status === 'picked_up') {
    assignmentUpdate += `, picked_up_at = COALESCE(picked_up_at, now())`
  } else if (status === 'out_for_delivery') {
    assignmentUpdate += `, picked_up_at = COALESCE(picked_up_at, now())`
  } else if (status === 'delivered') {
    assignmentUpdate += `, delivered_at = now()`
  } else if (status === 'failed') {
    assignmentUpdate += `, failed_at = now(), failure_reason = $3`
    params.push(failureReason ?? null)
  } else if (status === 'rescheduled') {
    assignmentUpdate += `, notes = COALESCE($2, notes)`
  } else if (status === 'assigned' && assignment.status === 'rescheduled') {
    assignmentUpdate += `, scheduled_delivery_date = CURRENT_DATE`
  }

  const whereParam = params.length + 1
  // Compare-and-set: refuse if another writer already moved this assignment.
  params.push(assignment.id, assignment.status)
  const { rowCount } = await client.query(
    `UPDATE driver_assignments SET ${assignmentUpdate}
     WHERE id = $${whereParam} AND status = $${whereParam + 1}`,
    params
  )
  if (rowCount === 0 && assignment.status !== status) {
    throw new ValidationError(
      `Cannot transition from ${assignment.status} to ${status}; assignment changed concurrently`
    )
  }

  const { rows: whRows } = await client.query(
    `SELECT warehouse_id FROM order_warehouse_assignment
     WHERE id = $1`,
    [assignment.warehouse_assignment_id]
  )
  const warehouseId = whRows[0]?.warehouse_id ?? null

  if (status === 'delivered') {
    const { rows: orders } = await client.query(
      `SELECT status FROM customer_order WHERE id = $1 FOR UPDATE`,
      [orderId]
    )
    const oldStatus = orders[0]?.status

    // Driver delivery may only promote the order to DELIVERED after SHIPPED
    // (or leave it already DELIVERED). Earlier fulfillment states must ship first.
    if (oldStatus && oldStatus !== 'SHIPPED' && oldStatus !== 'DELIVERED') {
      throw new ValidationError(
        `Cannot mark order delivered from ${oldStatus}; order must be shipped first`
      )
    }

    if (assignment.warehouse_assignment_id) {
      await markWarehouseAssignmentDelivered(client, orderId, assignment.warehouse_assignment_id)
      // Order is DELIVERED only when every warehouse leg succeeded. Mixed
      // delivered+failed legs stay at the current order status (typically SHIPPED).
      const allDelivered = await allWarehouseAssignmentsDelivered(client, orderId)
      if (allDelivered && oldStatus === 'SHIPPED') {
        await client.query(
          `UPDATE customer_order SET status = 'DELIVERED', updated_at = now() WHERE id = $1`,
          [orderId]
        )
        orderMarkedDelivered = true
      }
    } else if (oldStatus === 'SHIPPED') {
      await client.query(
        `UPDATE customer_order SET status = 'DELIVERED', updated_at = now() WHERE id = $1`,
        [orderId]
      )
      orderMarkedDelivered = true
      await syncWarehouseFulfillmentOnOrderStatus(client, orderId, 'DELIVERED', oldStatus)
      await client.query(
        `UPDATE order_warehouse_assignment
         SET status = 'delivered'
         WHERE order_id = $1 AND status NOT IN ('delivered', 'failed', 'superseded')`,
        [orderId]
      )
    }
  }

  if (status === 'failed') {
    if (assignment.warehouse_assignment_id) {
      await releaseInventoryForAssignment(client, orderId, assignment.warehouse_assignment_id)
    } else {
      await releaseInventoryForFailedDelivery(client, orderId)
    }
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

  const { rows: orderRows } = await client.query(
    `SELECT o.*, s.name AS supplier_name, r.name AS restaurant_name
     FROM customer_order o
     JOIN order_item oi ON oi.order_id = o.id
     JOIN supplier s ON s.id = oi.supplier_id
     JOIN restaurant r ON r.id = o.restaurant_id
     WHERE o.id = $1
     LIMIT 1`,
    [orderId]
  )
  if (orderRows[0]) {
    const order = { ...orderRows[0], supplier_id: supplierId }
    const driverName = updatedAssignment[0]?.driver_name
    const driverId = assignment.driver_id
    if (status === 'delivered') {
      if (orderMarkedDelivered) {
        postCommitEffects.push(() => notifyOrderStatusChange(order, 'DELIVERED'))
      }
      postCommitEffects.push(() =>
        notifyDriverDeliveryMilestone({
          order,
          supplierId,
          milestone: 'delivered',
          driverName,
          driverId,
        })
      )
    } else if (status === 'out_for_delivery') {
      postCommitEffects.push(() =>
        notifyDriverDeliveryMilestone({
          order,
          supplierId,
          milestone: 'out_for_delivery',
          driverName,
          driverId,
        })
      )
    } else if (status === 'failed') {
      postCommitEffects.push(() =>
        notifyDriverDeliveryMilestone({
          order,
          supplierId,
          milestone: 'failed_delivery',
          driverName,
          driverId,
        })
      )
    }
  }

  return updatedAssignment[0]
}

async function resolveActiveDriverAssignmentForReassign({
  orderId,
  driverAssignmentId,
  warehouseAssignmentId,
}) {
  if (driverAssignmentId) {
    const { rows } = await query(
      `SELECT ${DRIVER_ASSIGNMENT_SELECT}
       FROM driver_assignments da
       JOIN drivers d ON d.id = da.driver_id
       WHERE da.id = $1 AND da.order_id = $2
       LIMIT 1`,
      [driverAssignmentId, orderId]
    )
    if (!rows.length) {
      throw new ValidationError('Driver assignment not found for this order')
    }
    if (!ACTIVE_ASSIGNMENT_STATUSES.includes(rows[0].status)) {
      throw new ValidationError('No active driver assignment to reassign')
    }
    return rows[0]
  }

  if (warehouseAssignmentId) {
    const assignment = await getActiveDriverAssignment(orderId, warehouseAssignmentId)
    if (!assignment) {
      throw new ValidationError('No active driver assignment for this warehouse leg')
    }
    return assignment
  }

  const active = await listActiveDriverAssignments(orderId)
  if (active.length === 0) {
    throw new ValidationError('No active driver assignment to reassign')
  }
  if (active.length > 1) {
    throw new ValidationError(
      'Multiple active driver assignments exist; specify driver_assignment_id or warehouse_assignment_id'
    )
  }
  return active[0]
}

export async function reassignDriver({
  supplierId,
  orderId,
  driverId,
  reason,
  assignedByUserId,
  driverAssignmentId = null,
  warehouseAssignmentId = null,
}) {
  const assignment = await resolveActiveDriverAssignmentForReassign({
    orderId,
    driverAssignmentId,
    warehouseAssignmentId,
  })
  if (assignment.supplier_id !== supplierId) {
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

    // Carry the operational delivery day forward — a NULL here drops the order out
    // of the rollover job's index and out of the driver's "today" list.
    const { rows: created } = await client.query(
      `INSERT INTO driver_assignments (
         order_id, warehouse_assignment_id, driver_id, supplier_id, assigned_by, status, notes,
         scheduled_delivery_date
       ) VALUES ($1, $2, $3, $4, $5, 'assigned', $6, COALESCE($7::date, CURRENT_DATE))
       RETURNING *`,
      [
        orderId,
        assignment.warehouse_assignment_id,
        driverId,
        supplierId,
        assignedByUserId ?? null,
        reason ?? null,
        assignment.scheduled_delivery_date ?? null,
      ]
    )

    // Keep any live route stop consistent with the new driver: a stop left on the
    // previous driver's route would show the order under a driver who no longer has it.
    await client.query(
      `DELETE FROM route_stop rs
       USING delivery_route dr
       WHERE rs.route_id = dr.id
         AND rs.order_id = $1
         AND dr.supplier_id = $2
         AND dr.driver_id IS DISTINCT FROM $3
         AND dr.status IN ('PLANNED', 'IN_PROGRESS')
         AND rs.status NOT IN ('COMPLETED', 'FAILED')`,
      [orderId, supplierId, driverId]
    )

    return created[0]
  }).then(async (created) => {
    await invalidateDispatchCacheForSupplier(supplierId)
    return created
  })
}

export async function submitProofOfDelivery({
  orderId,
  supplierId,
  fileKey,
  signatureFileKey,
  notes,
  recipientName,
  driverAssignmentId,
  userId,
  latitude = null,
  longitude = null,
}) {
  await assertSupplierOwnsOrder(supplierId, orderId)
  const assignment =
    driverAssignmentId != null
      ? (
          await query(
            `SELECT id FROM driver_assignments
             WHERE id = $1 AND order_id = $2 AND supplier_id = $3 AND status <> 'superseded'`,
            [driverAssignmentId, orderId, supplierId]
          )
        ).rows[0]
      : (
          await query(
            `SELECT id FROM driver_assignments
             WHERE order_id = $1 AND supplier_id = $2 AND status = 'delivered'
             ORDER BY delivered_at DESC NULLS LAST LIMIT 1`,
            [orderId, supplierId]
          )
        ).rows[0]

  const gpsLat = latitude != null && Number.isFinite(Number(latitude)) ? Number(latitude) : null
  const gpsLng = longitude != null && Number.isFinite(Number(longitude)) ? Number(longitude) : null
  const photoKey = fileKey ?? null
  const signatureKey = signatureFileKey ?? null
  const deliveryPhotoUrl = photoKey ? buildObjectPublicUrl(photoKey) : null
  const signatureImageUrl = signatureKey ? buildObjectPublicUrl(signatureKey) : null

  // One POD per order: a driver retrying on a flaky connection must update the
  // existing proof rather than stack up duplicate rows. COALESCE keeps whatever
  // artefacts an earlier partial submission already captured.
  const { rows } = await query(
    `INSERT INTO proof_of_delivery (
       order_id, driver_assignment_id, delivery_date, delivered_by,
       recipient_name, file_key, signature_file_key,
       delivery_photo_url, signature_image_url,
       notes, delivery_timestamp,
       delivery_gps_lat, delivery_gps_lng
     ) VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6, $7, $8, $9, now(), $10, $11)
     ON CONFLICT (order_id) DO UPDATE SET
       driver_assignment_id = COALESCE(EXCLUDED.driver_assignment_id, proof_of_delivery.driver_assignment_id),
       delivered_by = COALESCE(EXCLUDED.delivered_by, proof_of_delivery.delivered_by),
       recipient_name = COALESCE(EXCLUDED.recipient_name, proof_of_delivery.recipient_name),
       file_key = COALESCE(EXCLUDED.file_key, proof_of_delivery.file_key),
       signature_file_key = COALESCE(EXCLUDED.signature_file_key, proof_of_delivery.signature_file_key),
       delivery_photo_url = COALESCE(EXCLUDED.delivery_photo_url, proof_of_delivery.delivery_photo_url),
       signature_image_url = COALESCE(EXCLUDED.signature_image_url, proof_of_delivery.signature_image_url),
       notes = COALESCE(EXCLUDED.notes, proof_of_delivery.notes),
       delivery_gps_lat = COALESCE(EXCLUDED.delivery_gps_lat, proof_of_delivery.delivery_gps_lat),
       delivery_gps_lng = COALESCE(EXCLUDED.delivery_gps_lng, proof_of_delivery.delivery_gps_lng),
       delivery_timestamp = now()
     RETURNING *`,
    [
      orderId,
      assignment?.id ?? null,
      userId ?? null,
      recipientName ?? null,
      photoKey,
      signatureKey,
      deliveryPhotoUrl,
      signatureImageUrl,
      notes ?? null,
      gpsLat,
      gpsLng,
    ]
  )
  // has_pod is part of the cached dispatch payload.
  await invalidateDispatchCacheForSupplier(supplierId)
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

export async function getProofOfDelivery(orderId, supplierId = null, restaurantId = null) {
  if (supplierId) {
    await assertSupplierOwnsOrder(supplierId, orderId)
  } else if (restaurantId) {
    await assertRestaurantOwnsOrder(restaurantId, orderId)
  }
  const { rows } = await query(
    `SELECT * FROM proof_of_delivery WHERE order_id = $1 ORDER BY delivery_timestamp DESC LIMIT 1`,
    [orderId]
  )
  return rows[0] ?? null
}
