export const DRIVER_GPS_ASSIGNMENT_STATUSES = ['assigned', 'picked_up', 'out_for_delivery'] as const

/**
 * Only deliveries with a live driver assignment accept location pings.
 *
 * `pending` means no driver is assigned yet, and the API rejects location posts for
 * those orders — including them made every ping fail, so nothing was ever stored.
 */
export function isTrackableDeliveryStatus(status: string | null | undefined): boolean {
  const s = String(status || '').toLowerCase()
  return DRIVER_GPS_ASSIGNMENT_STATUSES.includes(
    s as (typeof DRIVER_GPS_ASSIGNMENT_STATUSES)[number]
  )
}
