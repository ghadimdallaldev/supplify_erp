/** Matches API driver_assignments statuses that accept location pings. */
export const DRIVER_GPS_ASSIGNMENT_STATUSES = ['assigned', 'picked_up', 'out_for_delivery'] as const

/**
 * Only deliveries with a live driver assignment accept location pings.
 *
 * The board reports `COALESCE(da.status, 'pending')`, so `pending` means no driver is
 * assigned and `POST /orders/:id/location` rejects it. Treating those as trackable
 * sent doomed pings whose rejection failed the whole batch, so nothing was stored.
 */
export function isTrackableDeliveryStatus(status: string | null | undefined): boolean {
  const s = String(status || '').toLowerCase()
  return DRIVER_GPS_ASSIGNMENT_STATUSES.includes(
    s as (typeof DRIVER_GPS_ASSIGNMENT_STATUSES)[number]
  )
}
