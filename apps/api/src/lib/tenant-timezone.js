import { query } from './db.js'
import { config } from '../config/env.js'
import { getZonedParts } from './delivery-rollover-time.js'

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
export async function getRestaurantTimezone(restaurantId) {
  const { rows } = await query(`SELECT timezone FROM restaurant WHERE id = $1`, [restaurantId])
  return rows[0]?.timezone || getDefaultTenantTimezone()
}

/**
 * SQL fragment: COALESCE(restaurant.timezone, $default) for use in queries.
 */
export function sqlRestaurantTimezoneExpr(restaurantAlias = 'r', paramIndex = 1) {
  return `COALESCE(NULLIF(TRIM(${restaurantAlias}.timezone), ''), $${paramIndex})`
}

export { getZonedParts }
