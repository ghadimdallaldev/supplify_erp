/**
 * Shared reservation capacity / slot availability logic (public + staff).
 */
import { parseOperatingHours, resolveBookingWindow } from './reservation-booking-hours.js'

/** Statuses that consume dining-room capacity */
export const CAPACITY_CONSUMING_STATUSES = ['PENDING', 'CONFIRMED', 'SEATED']

export const DEFAULT_DURATION_MINUTES = 90
export const DEFAULT_SLOT_INTERVAL_MINUTES = 30

/**
 * @param {unknown} operatingHours
 */
export function readBookingMeta(operatingHours) {
  const parsed = parseOperatingHours(operatingHours)
  const meta = parsed?._booking ?? parsed?.bookingMeta ?? {}
  return {
    durationMinutes: Number(meta.durationMinutes) || DEFAULT_DURATION_MINUTES,
    slotIntervalMinutes: Number(meta.slotIntervalMinutes) || DEFAULT_SLOT_INTERVAL_MINUTES,
  }
}

/**
 * Normalize to YYYY-MM-DD (local calendar date when given a Date).
 * @param {string | Date} input
 */
export function toCalendarDateString(input) {
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.trim())) {
    return input.trim()
  }
  const d = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(d.getTime())) {
    throw new Error('Invalid date')
  }
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * @param {string} calendarDate YYYY-MM-DD
 * @param {number} hourDecimal e.g. 13.5 = 13:30
 */
export function dateAtHour(calendarDate, hourDecimal) {
  const wholeHours = Math.floor(hourDecimal)
  const minutes = Math.round((hourDecimal - wholeHours) * 60)
  const [y, m, d] = calendarDate.split('-').map(Number)
  return new Date(y, m - 1, d, wholeHours, minutes, 0, 0)
}

/**
 * @param {string} calendarDate
 * @param {number} openingHour
 * @param {number} closingHour
 * @param {number} slotIntervalMinutes
 */
export function buildTimeSlots(calendarDate, openingHour, closingHour, slotIntervalMinutes) {
  const slots = []
  const start = dateAtHour(calendarDate, openingHour)
  const end = dateAtHour(calendarDate, closingHour)
  const current = new Date(start)

  while (current < end) {
    const slotStart = new Date(current)
    const slotEnd = new Date(current)
    slotEnd.setMinutes(slotEnd.getMinutes() + slotIntervalMinutes)
    if (slotEnd > end) break
    slots.push({ start: slotStart, end: slotEnd })
    current.setMinutes(current.getMinutes() + slotIntervalMinutes)
  }
  return slots
}

/**
 * @param {Date} aStart
 * @param {Date} aEnd
 * @param {Date} bStart
 * @param {Date} bEnd
 */
export function intervalsOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart
}

/**
 * @param {{ scheduled_at: string | Date, duration_minutes?: number }} reservation
 * @param {{ start: Date, end: Date }} slot
 */
export function reservationOverlapsSlot(reservation, slot) {
  const resStart = new Date(reservation.scheduled_at)
  const resEnd = new Date(resStart)
  resEnd.setMinutes(
    resEnd.getMinutes() + Number(reservation.duration_minutes || DEFAULT_DURATION_MINUTES)
  )
  return intervalsOverlap(resStart, resEnd, slot.start, slot.end)
}

/**
 * @param {Array<{ party_size?: number }>} overlapping
 * @param {number} totalCapacity
 */
export function computeSeatsLeft(overlapping, totalCapacity) {
  const bookedCovers = overlapping.reduce(
    (sum, reservation) => sum + Number(reservation.party_size || 0),
    0
  )
  return Math.max(0, totalCapacity - bookedCovers)
}

/**
 * @param {number} seatsLeft
 * @param {number} partySize
 * @param {number} totalCapacity
 */
export function slotAvailabilityState(seatsLeft, partySize, totalCapacity) {
  const isAvailable = seatsLeft >= partySize
  let label = 'full'
  if (isAvailable) {
    label = seatsLeft >= totalCapacity ? 'available' : 'limited'
  }
  return { isAvailable, label, seatsLeft }
}

/**
 * @param {Array<{ startTime: string, endTime: string, capacityAvailable: number, isAvailable: boolean, seatsLeft: number, status: string }>} slots
 * @param {string | Date} scheduledAt
 */
export function findBookableSlot(slots, scheduledAt, partySize) {
  const target = new Date(scheduledAt).getTime()
  if (Number.isNaN(target)) return null

  const party = Number(partySize) || 1

  const match =
    slots.find((slot) => {
      if (!slot.isAvailable) return false
      const seatsLeft = Number(slot.seatsLeft ?? slot.capacityAvailable ?? 0)
      if (seatsLeft < party) return false
      const start = new Date(slot.startTime).getTime()
      const end = new Date(slot.endTime).getTime()
      if (target >= start && target < end) return true
      // Accept picks aligned to slot start (minor TZ / serialization drift).
      return Math.abs(target - start) < 90_000
    }) ?? null

  if (match) return match

  // Fallback: nearest available slot start within 15 minutes.
  let best = null
  let bestDelta = Infinity
  for (const slot of slots) {
    if (!slot.isAvailable) continue
    const seatsLeft = Number(slot.seatsLeft ?? slot.capacityAvailable ?? 0)
    if (seatsLeft < party) continue
    const start = new Date(slot.startTime).getTime()
    const delta = Math.abs(target - start)
    if (delta <= 15 * 60_000 && delta < bestDelta) {
      best = slot
      bestDelta = delta
    }
  }
  return best
}

/**
 * @param {object} params
 * @param {Array<{ capacity: number, is_active?: boolean }>} params.tables
 * @param {Array<object>} params.reservations
 * @param {string} params.calendarDate
 * @param {number} params.partySize
 * @param {number} params.openingHour
 * @param {number} params.closingHour
 * @param {number} params.slotIntervalMinutes
 * @param {number} params.durationMinutes
 * @param {Date} [params.now]
 */
export function calculateSlotsFromData({
  tables,
  reservations,
  calendarDate,
  partySize,
  openingHour,
  closingHour,
  slotIntervalMinutes = DEFAULT_SLOT_INTERVAL_MINUTES,
  now = new Date(),
}) {
  const activeTables = tables.filter((t) => t.is_active !== false)
  const totalCapacity = activeTables.reduce((sum, t) => sum + Number(t.capacity || 0), 0)
  const tableCount = activeTables.length

  if (!tableCount || totalCapacity < 1) {
    return { slots: [], totalCapacity: 0, tableCount: 0 }
  }

  const slotDefs = buildTimeSlots(calendarDate, openingHour, closingHour, slotIntervalMinutes)

  const consuming = reservations.filter((r) =>
    CAPACITY_CONSUMING_STATUSES.includes(String(r.status || '').toUpperCase())
  )

  const slots = slotDefs.map((slot) => {
    const overlapping = consuming.filter((r) => reservationOverlapsSlot(r, slot))
    const seatsLeft = computeSeatsLeft(overlapping, totalCapacity)
    const { isAvailable, label } = slotAvailabilityState(seatsLeft, partySize, totalCapacity)
    const inPast = slot.start < now

    return {
      startTime: slot.start.toISOString(),
      endTime: slot.end.toISOString(),
      capacityAvailable: seatsLeft,
      seatsLeft,
      isAvailable: isAvailable && !inPast,
      status: inPast ? 'past' : label,
    }
  })

  return { slots, totalCapacity, tableCount }
}

/**
 * @param {import('../lib/db.js').query} queryFn
 * @param {string} restaurantId
 * @param {string} calendarDate
 * @param {string} [excludeReservationId]
 */
export async function fetchReservationsOverlappingDay(
  queryFn,
  restaurantId,
  calendarDate,
  excludeReservationId
) {
  const dayStart = dateAtHour(calendarDate, 0)
  const dayEnd = dateAtHour(calendarDate, 24)

  const params = [
    restaurantId,
    CAPACITY_CONSUMING_STATUSES,
    dayStart.toISOString(),
    dayEnd.toISOString(),
  ]
  let exclusion = ''
  if (excludeReservationId) {
    exclusion = 'AND id <> $5'
    params.push(excludeReservationId)
  }

  const { rows } = await queryFn(
    `
      SELECT id, status, party_size, scheduled_at, duration_minutes, customer_email, customer_phone
      FROM reservation
      WHERE restaurant_id = $1
        AND status = ANY($2::text[])
        AND scheduled_at < $4::timestamptz
        AND (scheduled_at + (COALESCE(duration_minutes, ${DEFAULT_DURATION_MINUTES}) || ' minutes')::interval) > $3::timestamptz
        ${exclusion}
    `,
    params
  )
  return rows
}

/**
 * @param {import('../lib/db.js').query} queryFn
 * @param {string} restaurantId
 */
export async function fetchActiveTables(queryFn, restaurantId) {
  const { rows } = await queryFn(
    `
      SELECT id, name, capacity, is_active
      FROM reservation_table
      WHERE restaurant_id = $1 AND is_active = TRUE
      ORDER BY name ASC
    `,
    [restaurantId]
  )
  return rows
}

/**
 * Full availability for a restaurant on a calendar day.
 */
export async function getRestaurantSlotAvailability(
  queryFn,
  { restaurantId, dateInput, partySize, excludeReservationId, operatingHours }
) {
  const calendarDate = toCalendarDateString(dateInput)
  const tables = await fetchActiveTables(queryFn, restaurantId)
  const totalCapacity = tables.reduce((sum, t) => sum + Number(t.capacity || 0), 0)

  if (!tables.length) {
    return {
      slots: [],
      totalCapacity: 0,
      tableCount: 0,
      bookingWindow: null,
      calendarDate,
      durationMinutes: DEFAULT_DURATION_MINUTES,
      slotIntervalMinutes: DEFAULT_SLOT_INTERVAL_MINUTES,
    }
  }

  const parsedHours = parseOperatingHours(operatingHours)
  const { durationMinutes, slotIntervalMinutes } = readBookingMeta(parsedHours)
  const probeDate = dateAtHour(calendarDate, 12)
  const bookingWindow = resolveBookingWindow(parsedHours, probeDate)

  if (bookingWindow.closed) {
    return {
      slots: [],
      totalCapacity,
      tableCount: tables.length,
      bookingWindow,
      calendarDate,
      durationMinutes,
      slotIntervalMinutes,
    }
  }

  const reservations = await fetchReservationsOverlappingDay(
    queryFn,
    restaurantId,
    calendarDate,
    excludeReservationId
  )

  const { slots, tableCount } = calculateSlotsFromData({
    tables,
    reservations,
    calendarDate,
    partySize,
    openingHour: bookingWindow.openingHour,
    closingHour: bookingWindow.closingHour,
    slotIntervalMinutes,
  })

  return {
    slots,
    totalCapacity,
    tableCount,
    bookingWindow,
    calendarDate,
    durationMinutes,
    slotIntervalMinutes,
  }
}

/**
 * Validate party can book at scheduled time (used inside transactions).
 */
export function assertSlotBookable(availability, scheduledAt, partySize) {
  const slot = findBookableSlot(availability.slots, scheduledAt, partySize)
  if (!slot) {
    const err = new Error('Sorry, this time slot was just booked. Please choose another time.')
    err.name = 'TIME_UNAVAILABLE'
    err.statusCode = 409
    throw err
  }
  return slot
}

/**
 * @param {Date} scheduledAt
 * @param {string} calendarDate
 */
export function isScheduledInPast(scheduledAt, calendarDate) {
  const now = new Date()
  if (new Date(scheduledAt) < now) return true
  return false
}
