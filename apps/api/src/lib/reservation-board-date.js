/**
 * Calendar-day bounds for the reservations board (local server timezone).
 * Avoids `new Date('YYYY-MM-DD')` UTC midnight shifting which hides/misplaces bookings.
 */

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

export function formatYmd(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** @param {string | Date | undefined} input */
export function parseBoardDateParam(input) {
  if (input == null || input === '') return formatYmd(new Date())
  if (typeof input === 'string' && YMD_RE.test(input.trim())) return input.trim()
  const date = input instanceof Date ? input : new Date(String(input))
  if (Number.isNaN(date.getTime())) return formatYmd(new Date())
  return formatYmd(date)
}

/** @param {string} ymd */
export function getLocalDayBounds(ymd) {
  const [y, m, d] = ymd.split('-').map(Number)
  const start = new Date(y, m - 1, d, 0, 0, 0, 0)
  const end = new Date(y, m - 1, d, 23, 59, 59, 999)
  return { start, end, ymd }
}
