/**
 * Legacy import path — delegates to driver-fulfillment.service.js (canonical delivery logic).
 */
import { query } from './db.js'
import { NotFoundError } from '../middlewares/errorHandler.js'
import {
  assignDriverToOrder as assignDriverToOrderCanonical,
  updateDeliveryStatus,
  getProofOfDelivery,
  submitProofOfDelivery as submitProofOfDeliveryCanonical,
  getActiveDriverAssignment as getActiveDriverAssignmentCanonical,
  confirmProofOfDelivery as confirmProofOfDeliveryCanonical,
  reassignDriver,
} from '../services/driver-fulfillment.service.js'

export const DELIVERY_STATUSES = [
  'assigned',
  'picked_up',
  'out_for_delivery',
  'delivered',
  'failed',
  'reassigned',
  'rescheduled',
]

export async function getSupplierIdForOrder(orderId) {
  const { rows } = await query(`SELECT supplier_id FROM order_item WHERE order_id = $1 LIMIT 1`, [
    orderId,
  ])
  return rows[0]?.supplier_id ?? null
}

export const getActiveDriverAssignment = getActiveDriverAssignmentCanonical

export async function assignDriverToOrder({ orderId, supplierId, driverId, assignedBy }) {
  return assignDriverToOrderCanonical({
    supplierId,
    orderId,
    driverId,
    assignedByUserId: assignedBy,
  })
}

export async function reassignDriverToOrder({ orderId, supplierId, driverId, assignedBy, reason }) {
  return reassignDriver({
    supplierId,
    orderId,
    driverId,
    reason,
    assignedByUserId: assignedBy,
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
  return updateDeliveryStatus({
    supplierId,
    orderId,
    status,
    notes,
    failureReason,
    userId: actorUserId,
  })
}

export async function orderHasProofOfDelivery(orderId) {
  const proof = await getProofOfDelivery(orderId)
  return Boolean(proof)
}

export async function submitProofOfDelivery({
  orderId,
  supplierId,
  fileKey,
  notes,
  recipientName,
  createdByUserId,
  latitude,
  longitude,
}) {
  return submitProofOfDeliveryCanonical({
    orderId,
    supplierId,
    fileKey,
    notes,
    recipientName,
    userId: createdByUserId,
    latitude,
    longitude,
  })
}

export async function confirmProofOfDelivery(orderId, userId, restaurantId = null) {
  if (restaurantId) {
    return confirmProofOfDeliveryCanonical(orderId, restaurantId, userId)
  }
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
