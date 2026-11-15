type ConfirmDeliveryInput = {
  /** Persists the proof-of-delivery record (photo key, recipient, notes, GPS). */
  submitProof: () => Promise<unknown>
  /** Flips the driver assignment to `delivered`. */
  markDelivered: () => Promise<unknown>
}

/**
 * Confirm a delivery in the only order the API accepts.
 *
 * Suppliers with `pod_required` enabled make the API reject `delivered` until a
 * proof-of-delivery row exists, so submitting the proof first is what lets the
 * confirmation succeed at all. Ordering it this way also means a failure on the
 * status step leaves the proof on file for a retry, instead of leaving an order
 * marked delivered with no proof attached.
 */
export async function confirmDeliveryWithProof({
  submitProof,
  markDelivered,
}: ConfirmDeliveryInput): Promise<void> {
  await submitProof()
  await markDelivered()
}
