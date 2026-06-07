/** Next statuses a driver can set from the current delivery board status. */
export function getAvailableDriverDeliveryStatuses(
  deliveryStatus: string | null | undefined
): Array<'out_for_delivery' | 'delivered' | 'failed' | 'rescheduled'> {
  const s = String(deliveryStatus || 'pending').toLowerCase()
  if (s === 'out_for_delivery' || s === 'picked_up') {
    return ['delivered', 'failed', 'rescheduled']
  }
  if (s === 'assigned' || s === 'pending') {
    return ['out_for_delivery', 'failed', 'rescheduled']
  }
  return []
}
