const RESTORABLE = new Set(['CANCELLED', 'NO_SHOW'])
const RESTORE_TARGETS = new Set(['CONFIRMED', 'PENDING'])
const CAPACITY_STATUSES = new Set(['PENDING', 'CONFIRMED', 'SEATED'])

/**
 * Host board status changes. A completed visit stays completed.
 * Cancelled and no-show bookings can be restored to confirmed or pending.
 * @param {string} previousStatus
 * @param {string} nextStatus
 * @returns {string | null}
 */
/**
 * A party with a free table is confirmed while the room is under 90% full,
 * and held as pending once it is busier. Waitlist is only for a party with no table.
 */
export function resolveHostBookingStatus({ seated, utilization }) {
  if (!seated) return 'WAITLIST'
  if (Number(utilization) < 0.9) return 'CONFIRMED'
  return 'PENDING'
}

export function entersCapacity(previousStatus, nextStatus) {
  const previous = String(previousStatus || '').toUpperCase()
  const next = String(nextStatus || '').toUpperCase()
  return !CAPACITY_STATUSES.has(previous) && CAPACITY_STATUSES.has(next)
}

export function leavesNoShow(previousStatus, nextStatus) {
  const previous = String(previousStatus || '').toUpperCase()
  const next = String(nextStatus || '').toUpperCase()
  return previous === 'NO_SHOW' && next !== previous
}

export function getReservationTransitionError(previousStatus, nextStatus) {
  const previous = String(previousStatus || '').toUpperCase()
  const next = String(nextStatus || '').toUpperCase()
  if (!previous || previous === next) return null
  if (previous === 'COMPLETED') {
    return 'A completed visit cannot change status'
  }
  if (RESTORABLE.has(previous) && !RESTORE_TARGETS.has(next)) {
    return 'Restore this reservation to confirmed before choosing another status'
  }
  return null
}

/**
 * Side effects run only when the status actually changes.
 * @param {string} previousStatus
 * @param {string} nextStatus
 */
export function getReservationStatusChange(previousStatus, nextStatus) {
  const previous = String(previousStatus || '').toUpperCase()
  const next = String(nextStatus || '').toUpperCase()
  const changed = previous !== next
  return {
    changed,
    recordVisit: changed && next === 'COMPLETED',
    recordNoShow: changed && next === 'NO_SHOW',
    promoteWaitlist: changed && next === 'CANCELLED',
    notifyGuest: changed && (next === 'CONFIRMED' || next === 'WAITLIST'),
    notifyStaffCancel: changed && next === 'CANCELLED',
  }
}
