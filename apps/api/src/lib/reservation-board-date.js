/**
 * Calendar-day bounds for the reservations board.
 * A YYYY-MM-DD is the restaurant's local day, not UTC midnight and not the server process timezone.
 */
import { addCalendarDays, getZonedParts } from './delivery-rollover-time.js'

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

function zonedLocalToUtc(ymd, hour, minute, timeZone) {
  const [y, m, d] = ymd.split('-').map(Number)
  let utc = new Date(Date.UTC(y, m - 1, d, hour, minute, 0, 0))
  for (let pass = 0; pass < 3; pass += 1) {
    const got = getZonedParts(utc, timeZone)
    let gotHour = got.hour
    let gotDate = got.calendarDate
    if (gotHour === 24) {
      gotHour = 0
      gotDate = addCalendarDays(gotDate, 1)
    }
    const [gy, gm, gd] = gotDate.split('-').map(Number)
    const gotUtc = Date.UTC(gy, gm - 1, gd, gotHour, got.minute, 0, 0)
    const wanted = Date.UTC(y, m - 1, d, hour, minute, 0, 0)
    const delta = gotUtc - wanted
    if (delta === 0) break
    utc = new Date(utc.getTime() - delta)
  }
  return utc
}

/** A clock time on a calendar day in an IANA timezone. Hour 24 is the next local midnight. */
export function zonedDateAtHour(calendarDate, hourDecimal, timeZone) {
  const wholeHours = Math.floor(Number(hourDecimal) || 0)
  const minutes = Math.round((Number(hourDecimal) - wholeHours) * 60)
  const dayOffset = Math.floor(wholeHours / 24)
  const hour = wholeHours - dayOffset * 24
  const ymd = dayOffset ? addCalendarDays(calendarDate, dayOffset) : calendarDate
  return zonedLocalToUtc(ymd, hour, minutes, timeZone)
}

/** Start and end of a calendar day in an IANA timezone. End is the last millisecond of that day. */
export function getZonedDayBounds(ymd, timeZone) {
  const start = zonedLocalToUtc(ymd, 0, 0, timeZone)
  const end = new Date(zonedLocalToUtc(addCalendarDays(ymd, 1), 0, 0, timeZone).getTime() - 1)
  return { start, end, ymd }
}
