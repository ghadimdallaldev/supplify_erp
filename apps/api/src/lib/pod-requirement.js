import { ValidationError } from '../middlewares/errorHandler.js'
import { query } from './db.js'
import { getProofOfDelivery } from '../services/driver-fulfillment.service.js'

/**
 * Look up whether this supplier requires proof of delivery before delivered status.
 * Defaults to false when the supplier row is missing.
 */
export async function isPodRequiredForSupplier(supplierId, dbQuery = query) {
  if (!supplierId) return false
  const { rows } = await dbQuery(`SELECT pod_required FROM supplier WHERE id = $1`, [supplierId])
  return Boolean(rows[0]?.pod_required)
}

export async function orderHasProofOfDeliveryRecord(orderId) {
  const proof = await getProofOfDelivery(orderId)
  return Boolean(proof)
}

/** Response flags for delivery-status endpoints — podRequired reflects policy, not capture state. */
export async function resolveDeliveryPodFlags({ supplierId, orderId, deliveryStatus }) {
  const hasPod = await orderHasProofOfDeliveryRecord(orderId)
  const podRequired =
    deliveryStatus === 'delivered' ? await isPodRequiredForSupplier(supplierId) : false
  return { podRequired, hasPod }
}

export async function assertPodPresentWhenRequired({ supplierId, orderId, status }) {
  if (status !== 'delivered') return
  if (!(await isPodRequiredForSupplier(supplierId))) return
  const hasPod = await orderHasProofOfDeliveryRecord(orderId)
  if (!hasPod) {
    throw new ValidationError('Proof of delivery is required before marking delivered')
  }
}
