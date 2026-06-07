/** Matches API driver_assignments statuses that accept location pings. */
export const DRIVER_GPS_ASSIGNMENT_STATUSES = ['assigned', 'picked_up', 'out_for_delivery'] as const

/**
 * Delivery board normalizes DB `assigned` → `assigned`; unassigned orders are `pending`.
 * Include both so GPS starts as soon as a driver has work, not only after "out for delivery".
 */
export function isTrackableDeliveryStatus(status: string | null | undefined): boolean {
  const s = String(status || 'pending').toLowerCase()
  return (
    DRIVER_GPS_ASSIGNMENT_STATUSES.includes(s as (typeof DRIVER_GPS_ASSIGNMENT_STATUSES)[number]) ||
    s === 'pending'
  )
}
