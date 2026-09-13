import { ValidationError } from '../middlewares/errorHandler.js'
import { getProofOfDelivery } from '../services/driver-fulfillment.service.js'

/**
 * Proof of delivery is optional for all suppliers — there is no supplier/tenant
 * setting that blocks delivery confirmation without a POD record yet. When such
 * a setting is added, implement the lookup here and enforce in updateDeliveryStatus.
 */
export async function isPodRequiredForSupplier(_supplierId) {
  return false
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
