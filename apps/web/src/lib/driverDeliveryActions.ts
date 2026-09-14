export type DriverDeliveryStatus = 'out_for_delivery' | 'delivered' | 'failed' | 'rescheduled'

/** Next statuses a driver can set from the current delivery board status. */
export function getAvailableDriverDeliveryStatuses(
  deliveryStatus: string | null | undefined
): DriverDeliveryStatus[] {
  const s = String(deliveryStatus || '').toLowerCase()
  if (s === 'out_for_delivery') {
    return ['delivered', 'failed', 'rescheduled']
  }
  // `picked_up` has not departed yet, so it keeps the departure step rather than
  // jumping to Delivered.
  if (s === 'assigned' || s === 'picked_up') {
    return ['out_for_delivery', 'failed', 'rescheduled']
  }
  // `pending` has no driver assignment and `rescheduled` awaits re-dispatch; the API
  // rejects driver status calls for both, so offer nothing over a button that errors.
  return []
}

/**
 * Whether setting this status must capture proof of delivery first.
 *
 * Suppliers with `pod_required` make the API reject `delivered` until proof exists,
 * and delivering is irreversible, so it routes through capture instead of firing
 * straight from a tap.
 */
export function driverStatusNeedsProofOfDelivery(status: string | null | undefined): boolean {
  return String(status || '').toLowerCase() === 'delivered'
}
