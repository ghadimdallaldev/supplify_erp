/**
 * Time/date helpers for deterministic seed data (no dependency on system time for RNG).
 * All "today" is the day the script runs; ranges are relative to that.
 */

/**
 * @param {Date} d
 * @returns {string} YYYY-MM-DD
 */
export function toDateString(d) {
  return d.toISOString().slice(0, 10);
}

/**
 * @param {Date} d
 * @returns {string} ISO timestamp for DB
 */
export function toTimestamp(d) {
  return d.toISOString();
}

/**
 * Add days to a date (mutates and returns the same Date).
 * @param {Date} d
 * @param {number} days
 * @returns {Date}
 */
export function addDays(d, days) {
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * New date at start of day (UTC).
 * @param {number} year
 * @param {number} month (1-12)
 * @param {number} day
 * @returns {Date}
 */
export function dateAt(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

/**
 * Get a random date between start and end (inclusive day).
 * @param {() => number} rng
 * @param {Date} start
 * @param {Date} end
 * @returns {Date}
 */
export function randomDateBetween(rng, start, end) {
  const startMs = start.getTime();
  const endMs = end.getTime();
  const ms = startMs + rng() * (endMs - startMs);
  return new Date(ms);
}

/**
 * Start of today (UTC) as Date.
 * @returns {Date}
 */
export function todayStart() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}
