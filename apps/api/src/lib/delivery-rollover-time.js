/**
 * Timezone helpers for delivery rollover cutoff (no extra dependencies).
 */

/**
 * @param {Date} date
 * @param {string} timeZone IANA zone, e.g. Asia/Beirut
 * @returns {{ calendarDate: string, hour: number, minute: number }}
 */
export function getZonedParts(date, timeZone) {
  const d = date instanceof Date ? date : new Date(date)
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]))
  const calendarDate = `${parts.year}-${parts.month}-${parts.day}`
  const hour = parseInt(parts.hour, 10)
  const minute = parseInt(parts.minute, 10)
  return { calendarDate, hour, minute }
}

/** Add N calendar days to YYYY-MM-DD (UTC-safe for date-only strings). */
export function addCalendarDays(dateStr, days) {
  const [y, m, d] = String(dateStr).split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

/**
 * Whether an assignment with effectiveDeliveryDate is eligible for rollover at `now`.
 * Eligible when date is before local today, or same local day after cutoff hour.
 */
export function isDeliveryDateEligibleForRollover({
  effectiveDeliveryDate,
  now,
  timeZone,
  cutoffHour,
}) {
  if (!effectiveDeliveryDate) return false
  const { calendarDate: today, hour } = getZonedParts(now, timeZone)
  if (effectiveDeliveryDate < today) return true
  if (effectiveDeliveryDate === today && hour >= cutoffHour) return true
  return false
}
