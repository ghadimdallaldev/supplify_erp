/**
 * Reservation policy helpers (cancel window, deposit acknowledgment).
 */
import { readBookingMeta } from './reservation-availability.js'
import { parseOperatingHours } from './reservation-booking-hours.js'

/**
 * @param {unknown} operatingHours
 * @param {Date|string} scheduledAt
 * @param {Date} [now]
 * @returns {{ allowed: boolean, cancelWindowHours: number, hoursUntil: number }}
 */
export function evaluateCancelWindow(operatingHours, scheduledAt, now = new Date()) {
  const meta = readBookingMeta(parseOperatingHours(operatingHours))
  const cancelWindowHours = Number(meta.cancelWindowHours ?? 2)
  const start = new Date(scheduledAt)
  const hoursUntil = (start.getTime() - now.getTime()) / (1000 * 60 * 60)
  if (Number.isNaN(start.getTime())) {
    return { allowed: false, cancelWindowHours, hoursUntil: 0 }
  }
  // Within the window (or already past start) → guest cannot self-cancel
  const allowed = hoursUntil >= cancelWindowHours
  return { allowed, cancelWindowHours, hoursUntil }
}

/**
 * @param {unknown} operatingHours
 * @param {boolean} [acknowledged]
 */
export function assertDepositAcknowledged(operatingHours, acknowledged) {
  const meta = readBookingMeta(parseOperatingHours(operatingHours))
  if (meta.depositMode === 'none') {
    return { required: false, meta }
  }
  if (!acknowledged) {
    const err = new Error(
      meta.depositPolicyText ||
        'This restaurant requires deposit acknowledgment before booking. Please confirm the deposit policy.'
    )
    err.name = 'DEPOSIT_ACK_REQUIRED'
    err.statusCode = 400
    throw err
  }
  return { required: true, meta }
}
