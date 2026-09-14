import { ValidationError } from '../middlewares/errorHandler.js'
import { query } from './db.js'

/**
 * Look up whether this supplier requires proof of delivery before delivered status.
 * Defaults to false when the supplier row is missing.
 */
export async function isPodRequiredForSupplier(supplierId, dbQuery = query) {
  if (!supplierId) return false
  const { rows } = await dbQuery(`SELECT pod_required FROM supplier WHERE id = $1`, [supplierId])
  return Boolean(rows[0]?.pod_required)
}

export async function orderHasProofOfDeliveryRecord(orderId, dbQuery = query) {
  const { rows } = await dbQuery(`SELECT 1 FROM proof_of_delivery WHERE order_id = $1 LIMIT 1`, [
    orderId,
  ])
  return Boolean(rows[0])
}

/** Response flags for delivery-status endpoints — podRequired reflects policy, not capture state. */
export async function resolveDeliveryPodFlags({ supplierId, orderId, deliveryStatus }) {
  const hasPod = await orderHasProofOfDeliveryRecord(orderId)
  const podRequired =
    deliveryStatus === 'delivered' ? await isPodRequiredForSupplier(supplierId) : false
  return { podRequired, hasPod }
}

/**
 * Ensure POD exists when the supplier requires it for `delivered`.
 * Pass `dbQuery` (e.g. `client.query.bind(client)`) when validating inside a transaction
 * so the check sees the same snapshot as the status mutation.
 */
export async function assertPodPresentWhenRequired({
  supplierId,
  orderId,
  status,
  dbQuery = query,
}) {
  if (status !== 'delivered') return
  if (!(await isPodRequiredForSupplier(supplierId, dbQuery))) return
  const hasPod = await orderHasProofOfDeliveryRecord(orderId, dbQuery)
  if (!hasPod) {
    throw new ValidationError('Proof of delivery is required before marking delivered')
  }
}
