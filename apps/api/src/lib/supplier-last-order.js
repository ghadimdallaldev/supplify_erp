import { addCalendarDays, getZonedParts } from './delivery-rollover-time.js'
import { normalizeTenantTimezone, zonedWallTimeToUtc } from './tenant-timezone.js'
import { isQuoteCalendarDate } from './quote-response-validation.js'

/**
 * Resolve next eligible delivery date from supplier last-order rules.
 *
 * Modes:
 * - none: no cutoff; requested date kept (or tomorrow if missing/past)
 * - cutoff + absolute_time: after HH:mm local, roll forward rolloverDays
 * - cutoff + minutes_before_window: within N minutes of delivery day start (00:00), roll forward
 */
export function parseClockToMinutes(hhmm) {
  if (!hhmm || typeof hhmm !== 'string') return null
  const match = hhmm.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (h > 23 || m > 59) return null
  return h * 60 + m
}

function requestedCalendarDay(value, timeZone) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value))
    return isQuoteCalendarDate(value) ? value : null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : getZonedParts(date, timeZone).calendarDate
}

/**
 * @param {object} settings
 * @param {string} [settings.lastOrderMode]
 * @param {string|null} [settings.lastOrderCutoffType]
 * @param {string|null} [settings.lastOrderCutoffTime]
 * @param {number|null} [settings.lastOrderCutoffMinutes]
 * @param {number} [settings.lastOrderRolloverDays]
 * @param {string} [settings.lastOrderTimezone]
 * @param {Date|string|null} [requestedDeliveryDate]
 * @param {Date} [now]
 */
export function resolveSupplierDeliveryDate(
  settings,
  requestedDeliveryDate = null,
  now = new Date()
) {
  const mode = settings?.lastOrderMode || settings?.last_order_mode || 'none'
  const rolloverDays = Math.max(
    1,
    Number(settings?.lastOrderRolloverDays ?? settings?.last_order_rollover_days ?? 1) || 1
  )

  const timeZone = normalizeTenantTimezone(
    settings?.lastOrderTimezone || settings?.last_order_timezone
  )
  const localNow = getZonedParts(now, timeZone)
  const today = localNow.calendarDate
  let requested = requestedCalendarDay(requestedDeliveryDate, timeZone)
  if (!requested || requested < today) {
    requested = addCalendarDays(today, 1)
  }

  if (mode !== 'cutoff') {
    return {
      deliveryDate: requested,
      rolled: false,
      reason: 'no_cutoff',
      mode: 'none',
    }
  }

  const cutoffType =
    settings?.lastOrderCutoffType || settings?.last_order_cutoff_type || 'absolute_time'
  let pastCutoff = false

  if (cutoffType === 'minutes_before_window') {
    const minutes = Number(
      settings?.lastOrderCutoffMinutes ?? settings?.last_order_cutoff_minutes ?? 30
    )
    const windowStart = zonedWallTimeToUtc(requested, 0, 0, 0, 0, timeZone)
    const cutoffAt = new Date(windowStart.getTime() - minutes * 60 * 1000)
    pastCutoff = now > cutoffAt
  } else {
    const cutoffMinutes = parseClockToMinutes(
      settings?.lastOrderCutoffTime || settings?.last_order_cutoff_time || '15:00'
    )
    const nowMinutes = (localNow.hour % 24) * 60 + localNow.minute
    // If ordering for tomorrow (or later) and still before today's cutoff, OK.
    // If ordering for tomorrow and past today's cutoff, roll.
    // If ordering for day after tomorrow+, allow unless somehow past a same-day rule.
    if (requested <= addCalendarDays(today, 1)) {
      pastCutoff = cutoffMinutes != null ? nowMinutes > cutoffMinutes : false
    } else {
      pastCutoff = false
    }
  }

  if (!pastCutoff) {
    return {
      deliveryDate: requested,
      rolled: false,
      reason: 'before_cutoff',
      mode: 'cutoff',
    }
  }

  const rolledDate = addCalendarDays(requested, rolloverDays)
  return {
    deliveryDate: rolledDate,
    rolled: true,
    reason: 'past_cutoff',
    mode: 'cutoff',
    rolloverDays,
  }
}
