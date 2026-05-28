/** @typedef {{ open?: string; close?: string; closed?: boolean }} DayHours */

const DEFAULT_OPENING_HOUR = 17
const DEFAULT_CLOSING_HOUR = 22

const WEEKDAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

const ALL_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

/**
 * @param {string | undefined} timeStr "HH:mm"
 * @returns {number | null} hour as decimal (e.g. 17.5 = 5:30 PM)
 */
export function parseTimeToHour(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return hours + minutes / 60
}

/** @param {number} hour */
export function formatHourToTime(hour) {
  const h = Math.floor(hour)
  const m = Math.round((hour - h) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * @param {Record<string, DayHours> | null | undefined} operatingHours
 * @param {Date} date
 */
export function resolveBookingWindow(operatingHours, date) {
  const day = pickDayHours(operatingHours, date)
  if (day?.closed === true) {
    return { closed: true, source: 'operating_hours', openingHour: null, closingHour: null }
  }

  const open = parseTimeToHour(day?.open)
  const close = parseTimeToHour(day?.close)
  if (open != null && close != null && close > open) {
    return {
      closed: false,
      source: 'operating_hours',
      openingHour: open,
      closingHour: close,
      openTime: day.open,
      closeTime: day.close,
    }
  }

  return {
    closed: false,
    source: 'default',
    openingHour: DEFAULT_OPENING_HOUR,
    closingHour: DEFAULT_CLOSING_HOUR,
    openTime: formatHourToTime(DEFAULT_OPENING_HOUR),
    closeTime: formatHourToTime(DEFAULT_CLOSING_HOUR),
  }
}

/**
 * @param {string} openTime "HH:mm"
 * @param {string} closeTime "HH:mm"
 */
export function buildUniformOperatingHours(openTime, closeTime) {
  /** @type {Record<string, DayHours>} */
  const hours = {}
  for (const day of ALL_DAYS) {
    hours[day] = { open: openTime, close: closeTime }
  }
  return hours
}

/**
 * @param {Record<string, DayHours> | null | undefined} operatingHours
 */
/** @param {unknown} raw */
export function parseOperatingHours(raw) {
  if (raw == null) return null
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (typeof raw === 'object') return /** @type {Record<string, DayHours>} */ (raw)
  return null
}

export function summarizeBookingHours(operatingHours) {
  const parsed = parseOperatingHours(operatingHours)
  const sample = resolveBookingWindow(parsed, new Date())
  if (sample.source === 'default') {
    return {
      openTime: sample.openTime,
      closeTime: sample.closeTime,
      usesCustomHours: false,
      note: 'Using default online booking hours (5:00 PM – 10:00 PM) until you set hours below.',
    }
  }
  return {
    openTime: sample.openTime,
    closeTime: sample.closeTime,
    usesCustomHours: true,
    note: 'Online booking uses your restaurant operating hours (same schedule applied to all days when saved here).',
  }
}

/**
 * @param {Record<string, DayHours> | null | undefined} operatingHours
 * @param {Date} date
 * @returns {DayHours | null}
 */
function pickDayHours(operatingHours, date) {
  if (!operatingHours || typeof operatingHours !== 'object') return null
  const key = WEEKDAY_KEYS[date.getDay()]
  const variants = [key, key.slice(0, 3), key.charAt(0).toUpperCase() + key.slice(1)]
  for (const variant of variants) {
    const day = operatingHours[variant]
    if (day && typeof day === 'object' && ('open' in day || 'close' in day || 'closed' in day)) {
      return day
    }
  }
  return null
}

export { DEFAULT_OPENING_HOUR, DEFAULT_CLOSING_HOUR, ALL_DAYS }
