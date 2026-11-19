import { query } from './db.js'
import { config } from '../config/env.js'
import { addCalendarDays, getZonedParts } from './delivery-rollover-time.js'

const WEEKDAY_TO_DOW = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
}

/** Platform default IANA timezone for tenant-local day boundaries. */
export function getDefaultTenantTimezone() {
  return config.DEFAULT_TENANT_TIMEZONE || config.DELIVERY_ROLLOVER_TIMEZONE || 'Asia/Beirut'
}

/** Validate named timezones that can be used consistently by Intl and PostgreSQL. */
export function isValidTenantTimezone(value) {
  if (typeof value !== 'string' || !value || /^[+-]/.test(value)) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

/** Resolve blank or historical invalid settings to the platform timezone. */
export function normalizeTenantTimezone(value) {
  const timeZone = typeof value === 'string' ? value.trim() : ''
  return isValidTenantTimezone(timeZone) ? timeZone : getDefaultTenantTimezone()
}

/**
 * @param {Date} date
 * @param {string} timeZone
 * @returns {number} 0=Sunday … 6=Saturday (matches JS getUTCDay / cadence day_of_week)
 */
export function getZonedDayOfWeek(date, timeZone) {
  const d = date instanceof Date ? date : new Date(date)
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
  }).format(d)
  return WEEKDAY_TO_DOW[weekday] ?? 0
}

/**
 * Resolve restaurant timezone (falls back to platform default).
 * @param {string} restaurantId
 */
export async function getRestaurantTimezone(restaurantId, runQuery = query) {
  const { rows } = await runQuery(`SELECT timezone FROM restaurant WHERE id = $1`, [restaurantId])
  return rows[0]?.timezone || getDefaultTenantTimezone()
}

export function isValidTimeZone(timeZone) {
  if (!timeZone || typeof timeZone !== 'string') return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

/**
 * Supplier-local calendar day. Uses last-order timezone, then the platform default. An unknown
 * zone string would make `AT TIME ZONE` fail in SQL (500 on the driver run sheet), so it is
 * validated here and falls back to the default.
 */
export async function getSupplierTimezone(supplierId) {
  const { rows } = await query(
    `SELECT COALESCE(NULLIF(TRIM(last_order_timezone), ''), $2) AS tz FROM supplier WHERE id = $1`,
    [supplierId, getDefaultTenantTimezone()]
  )
<<<<<<< HEAD
  return normalizeTenantTimezone(rows[0]?.tz)
=======
  const tz = rows[0]?.tz
  return isValidTimeZone(tz) ? tz : getDefaultTenantTimezone()
>>>>>>> audit/perf-security-readiness-2026-11-19
}

/**
 * SQL fragment: COALESCE(restaurant.timezone, $default) for use in queries.
 */
function zonedClockParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const parts = Object.fromEntries(fmt.formatToParts(date).map((part) => [part.type, part.value]))
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
  }
}

/** UTC instant for a wall-clock time on a calendar day in an IANA timezone. */
export function zonedWallTimeToUtc(dateKey, hour, minute, second, ms, timeZone) {
  const [year, month, day] = String(dateKey).split('-').map(Number)
  let utc = Date.UTC(year, month - 1, day, hour, minute, second, ms)
  let previousUtc
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const got = zonedClockParts(new Date(utc), timeZone)
    const gotUtc = Date.UTC(got.year, got.month - 1, got.day, got.hour, got.minute, got.second, ms)
    const want = Date.UTC(year, month - 1, day, hour, minute, second, ms)
    const delta = want - gotUtc
    if (delta === 0) break
    if (utc + delta === previousUtc) {
      // A skipped wall time oscillates across the gap. Advance through it.
      utc = Math.max(utc, previousUtc)
      break
    }
    previousUtc = utc
    utc += delta
  }
  return new Date(utc)
}

/** Inclusive start and end instants of a YYYY-MM-DD day in the given timezone. */
export function zonedDayBounds(dateKey, timeZone) {
  const start = zonedWallTimeToUtc(dateKey, 0, 0, 0, 0, timeZone)
  const nextStart = zonedWallTimeToUtc(addCalendarDays(dateKey, 1), 0, 0, 0, 0, timeZone)
  return { start, end: new Date(nextStart.getTime() - 1) }
}

export function sqlRestaurantTimezoneExpr(restaurantAlias = 'r', paramIndex = 1) {
  return `COALESCE(NULLIF(TRIM(${restaurantAlias}.timezone), ''), $${paramIndex})`
}

export { getZonedParts }
