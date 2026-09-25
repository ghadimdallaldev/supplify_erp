/**
 * Shared reservation capacity / slot availability logic (public + staff).
 */
import { parseOperatingHours, resolveBookingWindow } from './reservation-booking-hours.js'
import { zonedDateAtHour } from './reservation-board-date.js'
import { getDefaultTenantTimezone } from './tenant-timezone.js'

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
  const depositMode = ['none', 'fixed', 'percent'].includes(meta.depositMode)
    ? meta.depositMode
    : 'none'
  return {
    durationMinutes: Number(meta.durationMinutes) || DEFAULT_DURATION_MINUTES,
    slotIntervalMinutes: Number(meta.slotIntervalMinutes) || DEFAULT_SLOT_INTERVAL_MINUTES,
    minPartySize: Number(meta.minPartySize) || 1,
    maxPartySize: Number(meta.maxPartySize) || 20,
    maxCoversPerSlot: Number(meta.maxCoversPerSlot) || null,
    cancelWindowHours:
      meta.cancelWindowHours === 0 || meta.cancelWindowHours ? Number(meta.cancelWindowHours) : 2,
    depositMode,
    depositAmount: Number(meta.depositAmount) || 0,
    depositPercent: Number(meta.depositPercent) || 0,
    depositPolicyText: typeof meta.depositPolicyText === 'string' ? meta.depositPolicyText : '',
  }
}

/** A deposit is real only when the configured amount or percent is above zero. */
export function depositIsRequired(meta) {
  if (!meta || meta.depositMode === 'none') return false
  if (meta.depositMode === 'fixed') return Number(meta.depositAmount) > 0
  if (meta.depositMode === 'percent') return Number(meta.depositPercent) > 0
  return false
}

export function publicDepositFields(meta) {
  return {
    depositMode: meta.depositMode,
    depositAmount: meta.depositAmount,
    depositPercent: meta.depositPercent,
    depositPolicyText: meta.depositPolicyText,
    depositRequired: depositIsRequired(meta),
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
export function dateAtHour(calendarDate, hourDecimal, timeZone) {
  if (timeZone) return zonedDateAtHour(calendarDate, hourDecimal, timeZone)
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
export function buildTimeSlots(
  calendarDate,
  openingHour,
  closingHour,
  slotIntervalMinutes,
  timeZone
) {
  const slots = []
  const start = dateAtHour(calendarDate, openingHour, timeZone)
  const end = dateAtHour(calendarDate, closingHour, timeZone)
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
/**
 * Host table assignment: the chosen tables must seat the party and must not
 * already be held by another live reservation at the same time.
 * @param {object} params
 * @returns {string | null}
 */
/**
 * Prefer one free table that fits the party. Otherwise combine the smallest free tables.
 * @param {Array<{ id: string, capacity?: number, is_active?: boolean }>} tables
 * @param {number} partySize
 * @param {Set<string> | string[]} [conflictingTableIds]
 */
export function assignTablesForParty(tables, partySize, conflictingTableIds = new Set()) {
  const blocked =
    conflictingTableIds instanceof Set ? conflictingTableIds : new Set(conflictingTableIds || [])
  const free = (tables || [])
    .filter((table) => table.is_active !== false && !blocked.has(table.id))
    .sort((a, b) => Number(a.capacity) - Number(b.capacity))
  const party = Number(partySize) || 1
  const single = free.find((table) => Number(table.capacity) >= party)
  if (single) {
    return { tableIds: [single.id], seats: Number(single.capacity) }
  }
  const tableIds = []
  let seats = 0
  for (const table of free) {
    tableIds.push(table.id)
    seats += Number(table.capacity || 0)
    if (seats >= party) break
  }
  return { tableIds, seats }
}

export function getTableAssignmentError({
  partySize,
  tableIds,
  tables,
  scheduledAt,
  durationMinutes,
  otherReservations,
}) {
  if (!tableIds?.length) return null

  const byId = new Map((tables || []).map((table) => [table.id, table]))
  let capacity = 0
  for (const id of tableIds) {
    const table = byId.get(id)
    if (!table || table.is_active === false) {
      return 'One or more tables are invalid or inactive'
    }
    capacity += Number(table.capacity || 0)
  }
  if (capacity < Number(partySize || 0)) {
    return 'These tables do not seat this party'
  }

  const start = new Date(scheduledAt)
  if (Number.isNaN(start.getTime())) return 'Reservation time is invalid'
  const slot = {
    start,
    end: new Date(start.getTime() + Number(durationMinutes || DEFAULT_DURATION_MINUTES) * 60000),
  }
  const wanted = new Set(tableIds)
  for (const other of otherReservations || []) {
    if (!CAPACITY_CONSUMING_STATUSES.includes(String(other.status || '').toUpperCase())) continue
    const otherTables = Array.isArray(other.tables) ? other.tables : []
    if (!otherTables.some((id) => wanted.has(id))) continue
    if (reservationOverlapsSlot(other, slot)) {
      return 'One of these tables is already booked for this time'
    }
  }
  return null
}

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
  maxCoversPerSlot = null,
  timeZone = null,
  now = new Date(),
}) {
  const activeTables = tables.filter((t) => t.is_active !== false)
  const tableCapacity = activeTables.reduce((sum, t) => sum + Number(t.capacity || 0), 0)
  const totalCapacity =
    maxCoversPerSlot && Number(maxCoversPerSlot) > 0
      ? Math.min(tableCapacity, Number(maxCoversPerSlot))
      : tableCapacity
  const tableCount = activeTables.length

  if (!tableCount || totalCapacity < 1) {
    return { slots: [], totalCapacity: 0, tableCount: 0 }
  }

  const slotDefs = buildTimeSlots(
    calendarDate,
    openingHour,
    closingHour,
    slotIntervalMinutes,
    timeZone
  )

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
  excludeReservationId,
  timeZone
) {
  const dayStart = dateAtHour(calendarDate, 0, timeZone)
  const dayEnd = dateAtHour(calendarDate, 24, timeZone)

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
/**
 * Reserve one fitting table, or a combination, so an online booking holds the same floor as the host.
 * Throws when every fitting table is already taken.
 */
export async function holdTablesForParty(
  queryFn,
  { restaurantId, scheduledAt, durationMinutes, partySize, branchId, excludeReservationId }
) {
  const params = [
    restaurantId,
    new Date(scheduledAt).toISOString(),
    durationMinutes || DEFAULT_DURATION_MINUTES,
  ]
  let branchSql = ''
  if (branchId) {
    params.push(branchId)
    branchSql = `AND (branch_id = $${params.length} OR branch_id IS NULL)`
  }
  let excludeSql = ''
  if (excludeReservationId) {
    params.push(excludeReservationId)
    excludeSql = `AND id <> $${params.length}`
  }
  const { rows: conflictRows } = await queryFn(
    `
      SELECT unnest(tables) AS table_id
      FROM reservation
      WHERE restaurant_id = $1
        AND status IN ('PENDING','CONFIRMED','SEATED')
        AND tstzrange(scheduled_at, scheduled_at + make_interval(mins => duration_minutes), '[)') &&
            tstzrange($2::timestamptz, $2::timestamptz + make_interval(mins => $3), '[)')
        ${branchSql}
        ${excludeSql}
    `,
    params
  )
  const blocked = new Set(conflictRows.map((row) => row.table_id).filter(Boolean))
  const tableParams = [restaurantId]
  let tableBranchSql = ''
  if (branchId) {
    tableParams.push(branchId)
    tableBranchSql = 'AND (branch_id = $2 OR branch_id IS NULL)'
  }
  const { rows: tables } = await queryFn(
    `
      SELECT id, capacity, is_active
      FROM reservation_table
      WHERE restaurant_id = $1 AND is_active = TRUE
        ${tableBranchSql}
    `,
    tableParams
  )
  const assigned = assignTablesForParty(tables, partySize, blocked)
  if (!assigned.tableIds.length || assigned.seats < Number(partySize || 0)) {
    const err = new Error('Not enough free tables for this party')
    err.name = 'TIME_UNAVAILABLE'
    err.statusCode = 409
    throw err
  }
  return assigned.tableIds
}

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
    const emptyMeta = readBookingMeta(operatingHours)
    return {
      slots: [],
      totalCapacity: 0,
      tableCount: 0,
      bookingWindow: null,
      calendarDate,
      durationMinutes: emptyMeta.durationMinutes,
      slotIntervalMinutes: emptyMeta.slotIntervalMinutes,
      ...publicDepositFields(emptyMeta),
      cancelWindowHours: emptyMeta.cancelWindowHours,
    }
  }

  const { rows: tzRows } = await queryFn(`SELECT timezone FROM restaurant WHERE id = $1`, [
    restaurantId,
  ])
  const timeZone = tzRows[0]?.timezone || getDefaultTenantTimezone()

  const parsedHours = parseOperatingHours(operatingHours)
  const bookingMeta = readBookingMeta(parsedHours)
  const { durationMinutes, slotIntervalMinutes, minPartySize, maxPartySize, maxCoversPerSlot } =
    bookingMeta
  const probeDate = dateAtHour(calendarDate, 12, timeZone)
  const bookingWindow = resolveBookingWindow(parsedHours, probeDate)

  const { rows: blackoutRows } = await queryFn(
    `
      SELECT id, reason
      FROM reservation_blackout
      WHERE restaurant_id = $1
        AND blackout_date = $2::date
        AND branch_id IS NULL
      LIMIT 1
    `,
    [restaurantId, calendarDate]
  )
  if (blackoutRows.length) {
    return {
      slots: [],
      totalCapacity,
      tableCount: tables.length,
      bookingWindow: { ...bookingWindow, closed: true, source: 'blackout' },
      calendarDate,
      durationMinutes,
      slotIntervalMinutes,
      minPartySize,
      maxPartySize,
      blackout: true,
      blackoutReason: blackoutRows[0].reason || null,
      ...publicDepositFields(bookingMeta),
      cancelWindowHours: bookingMeta.cancelWindowHours,
    }
  }

  if (bookingWindow.closed) {
    return {
      slots: [],
      totalCapacity,
      tableCount: tables.length,
      bookingWindow,
      calendarDate,
      durationMinutes,
      slotIntervalMinutes,
      minPartySize,
      maxPartySize,
      ...publicDepositFields(bookingMeta),
      cancelWindowHours: bookingMeta.cancelWindowHours,
    }
  }

  if (partySize < minPartySize || partySize > maxPartySize) {
    return {
      slots: [],
      totalCapacity,
      tableCount: tables.length,
      bookingWindow,
      calendarDate,
      durationMinutes,
      slotIntervalMinutes,
      minPartySize,
      maxPartySize,
      partySizeRejected: true,
      ...publicDepositFields(bookingMeta),
      cancelWindowHours: bookingMeta.cancelWindowHours,
    }
  }

  const reservations = await fetchReservationsOverlappingDay(
    queryFn,
    restaurantId,
    calendarDate,
    excludeReservationId,
    timeZone
  )

  const { slots, tableCount } = calculateSlotsFromData({
    tables,
    reservations,
    calendarDate,
    partySize,
    openingHour: bookingWindow.openingHour,
    closingHour: bookingWindow.closingHour,
    slotIntervalMinutes,
    maxCoversPerSlot,
    timeZone,
  })

  return {
    slots,
    totalCapacity,
    tableCount,
    bookingWindow,
    calendarDate,
    durationMinutes,
    slotIntervalMinutes,
    minPartySize,
    maxPartySize,
    ...publicDepositFields(bookingMeta),
    cancelWindowHours: bookingMeta.cancelWindowHours,
  }
}

/**
 * Validate party can book at scheduled time (used inside transactions).
 */
export async function assertNoDuplicateGuestBooking(
  client,
  restaurantId,
  scheduledAt,
  email,
  phone,
  durationMinutes,
  excludeReservationId
) {
  const params = [
    restaurantId,
    CAPACITY_CONSUMING_STATUSES,
    new Date(scheduledAt).toISOString(),
    email || null,
    phone || null,
    durationMinutes || DEFAULT_DURATION_MINUTES,
  ]
  let excludeSql = ''
  if (excludeReservationId) {
    params.push(excludeReservationId)
    excludeSql = 'AND id <> $7'
  }
  const { rows } = await client.query(
    `
      SELECT id FROM reservation
      WHERE restaurant_id = $1
        AND status = ANY($2::text[])
        ${excludeSql}
        AND tstzrange(scheduled_at, scheduled_at + make_interval(mins => duration_minutes), '[)') &&
            tstzrange($3::timestamptz, $3::timestamptz + make_interval(mins => $6), '[)')
        AND (
          ($4::text IS NOT NULL AND customer_email IS NOT NULL AND lower(customer_email) = lower($4))
          OR ($5::text IS NOT NULL AND customer_phone IS NOT NULL AND customer_phone = $5)
        )
      LIMIT 1
    `,
    params
  )
  if (rows.length) {
    const err = new Error('You already have a reservation that overlaps this time.')
    err.name = 'DUPLICATE_RESERVATION'
    err.statusCode = 409
    throw err
  }
}

export function assertSlotBookable(availability, scheduledAt, partySize) {
  if (availability?.bookingWindow?.closed) {
    const err = new Error('The restaurant is closed at that time.')
    err.name = 'TIME_UNAVAILABLE'
    err.statusCode = 409
    throw err
  }
  if (availability?.partySizeRejected) {
    const min = availability.minPartySize ?? 1
    const max = availability.maxPartySize ?? 20
    const err = new Error(`Parties must be between ${min} and ${max} guests.`)
    err.name = 'PARTY_SIZE_NOT_ALLOWED'
    err.statusCode = 400
    throw err
  }
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
