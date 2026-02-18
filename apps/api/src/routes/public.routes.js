import express from 'express'
import { z } from 'zod'
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import {
  notifyReservationCreated,
  notifyReservationWaitlist,
  notifyStaffPtoRequest,
  notifyStaffSwapRequest,
} from '../services/notification.service.js'
import { notifyOrderStatusChange } from '../services/notification.service.js'

const router = express.Router()

const ACTIVE_RESERVATION_STATUSES = ['PENDING', 'CONFIRMED', 'SEATED']
const SLOT_INTERVAL_MINUTES = 30
const DEFAULT_OPENING_HOUR = 17
const DEFAULT_CLOSING_HOUR = 22

const availabilitySchema = z.object({
  restaurantId: z.string().uuid(),
  partySize: z.coerce.number().min(1).max(50),
  date: z.string(),
})

const createPublicReservationSchema = z.object({
  restaurantId: z.string().uuid(),
  partySize: z.number().min(1),
  scheduledAt: z.string(),
  durationMinutes: z.number().min(30).max(240).default(90),
  customerName: z.string().min(1),
  customerEmail: z.string().email().optional(),
  customerPhone: z.string().optional(),
  notes: z.string().optional(),
})

const staffLinkRequestSchema = z.object({
  email: z.string().email(),
})

const staffSessionSchema = z.object({
  token: z.string().uuid(),
})

const staffDashboardSchema = z.object({
  token: z.string().uuid(),
})

const staffSelfPtoSchema = z.object({
  token: z.string().uuid(),
  type: z.enum(['VACATION', 'SICK', 'PERSONAL', 'UNPAID', 'OTHER']).default('VACATION'),
  startDate: z.string(),
  endDate: z.string(),
  hoursRequested: z.number().nonnegative().optional(),
  reason: z.string().optional(),
})

const staffSelfSwapSchema = z.object({
  token: z.string().uuid(),
  shiftId: z.string().uuid(),
  proposedCoverId: z.string().uuid().optional(),
  reason: z.string().optional(),
})

const publicWaitlistSchema = z.object({
  restaurantId: z.string().uuid(),
  partySize: z.number().min(1).max(50),
  desiredAt: z.string().optional(),
  customerName: z.string().min(1),
  customerPhone: z.string().optional(),
  notes: z.string().optional(),
})

async function fetchActiveTables(restaurantId) {
  const { rows } = await query(
    `
      SELECT id, name, capacity, is_active
      FROM reservation_table
      WHERE restaurant_id = $1
    `,
    [restaurantId]
  )
  return rows.filter((table) => table.is_active)
}

async function fetchReservationByToken(token) {
  const { rows } = await query(
    `
      SELECT *
      FROM reservation
      WHERE public_token = $1
        AND public_token_expires_at > now()
    `,
    [token]
  )
  return rows[0] ?? null
}

async function fetchReservationsForWindow(restaurantId, dayStart, dayEnd, excludeReservationId) {
  const params = [
    restaurantId,
    ACTIVE_RESERVATION_STATUSES,
    dayStart.toISOString(),
    dayEnd.toISOString(),
  ]
  let exclusionClause = ''
  if (excludeReservationId) {
    exclusionClause = 'AND id <> $5'
    params.push(excludeReservationId)
  }
  const { rows } = await query(
    `
      SELECT *
      FROM reservation
      WHERE restaurant_id = $1
        AND status = ANY($2::text[])
        AND scheduled_at BETWEEN $3 AND $4
        ${exclusionClause}
    `,
    params
  )
  return rows
}

function buildTimeSlots(
  date,
  openingHour = DEFAULT_OPENING_HOUR,
  closingHour = DEFAULT_CLOSING_HOUR
) {
  const slots = []
  const start = new Date(date)
  start.setHours(openingHour, 0, 0, 0)

  const end = new Date(date)
  end.setHours(closingHour, 0, 0, 0)

  const current = new Date(start)
  while (current < end) {
    const slotStart = new Date(current)
    const slotEnd = new Date(current)
    slotEnd.setMinutes(slotEnd.getMinutes() + SLOT_INTERVAL_MINUTES)
    slots.push({ start: slotStart, end: slotEnd })
    current.setMinutes(current.getMinutes() + SLOT_INTERVAL_MINUTES)
  }
  return slots
}

async function calculateSlotAvailability(restaurantId, date, partySize, excludeReservationId) {
  const tables = await fetchActiveTables(restaurantId)
  const totalCapacity = tables.reduce((sum, table) => sum + Number(table.capacity || 0), 0)
  if (!tables.length || totalCapacity < partySize) {
    return []
  }

  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)

  const reservations = await fetchReservationsForWindow(
    restaurantId,
    dayStart,
    dayEnd,
    excludeReservationId
  )
  const slots = buildTimeSlots(date)

  return slots.map((slot) => {
    const overlapping = reservations.filter((reservation) => {
      const resStart = new Date(reservation.scheduled_at)
      const resEnd = new Date(resStart)
      resEnd.setMinutes(resEnd.getMinutes() + Number(reservation.duration_minutes || 90))
      return resStart < slot.end && resEnd > slot.start
    })

    const seatsUsed = overlapping.reduce(
      (sum, reservation) => sum + Number(reservation.party_size || 0),
      0
    )
    const capacityAvailable = totalCapacity - seatsUsed

    return {
      startTime: slot.start.toISOString(),
      endTime: slot.end.toISOString(),
      capacityAvailable,
      isAvailable: capacityAvailable >= partySize,
    }
  })
}

async function ensureStaffSession(token) {
  const { rows } = await query(
    `
      SELECT sps.*, sm.display_name, sm.restaurant_id
      FROM staff_portal_session sps
      JOIN staff_member sm ON sm.id = sps.staff_id
      WHERE sps.session_token = $1
        AND sps.expires_at > now()
    `,
    [token]
  )
  if (!rows.length) {
    return null
  }
  return rows[0]
}

function mapTimeEntryRow(row) {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    staffId: row.staff_id,
    clockInAt: row.clock_in_at,
    clockOutAt: row.clock_out_at,
    clockInMethod: row.clock_in_method,
    clockOutMethod: row.clock_out_method,
    breakMinutes: row.break_minutes != null ? Number(row.break_minutes) : null,
    note: row.note,
    status: row.status,
    staff: row.staff_id
      ? {
          id: row.staff_id,
          name: row.staff_name,
          role: row.staff_role,
        }
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function isUuid(str) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return typeof str === 'string' && uuidRegex.test(str)
}

router.get('/restaurants/:idOrSlug', async (req, res) => {
  try {
    const { idOrSlug } = req.params
    const byId = isUuid(idOrSlug)

    const { rows } = await query(
      byId
        ? `SELECT id, slug, name, contact_email, phone, created_at FROM restaurant WHERE id = $1`
        : `SELECT id, slug, name, contact_email, phone, created_at FROM restaurant WHERE slug = $1`,
      [idOrSlug]
    )

    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'RESTAURANT_NOT_FOUND', message: 'Restaurant not found' },
        requestId: req.requestId,
      })
    }

    res.json({
      ok: true,
      data: rows[0],
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Public restaurant fetch failed', { error: error.message })
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'PUBLIC_RESTAURANT_ERROR', message: 'Unable to load restaurant' },
      requestId: req.requestId,
    })
  }
})

router.get('/restaurants', async (req, res) => {
  try {
    const { rows } = await query(
      `
        SELECT id, slug, name, contact_email, created_at
        FROM restaurant
        ORDER BY name ASC
      `
    )
    res.json({
      ok: true,
      data: rows,
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Public restaurants fetch failed', { error: error.message })
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'PUBLIC_RESTAURANTS_ERROR', message: 'Unable to load restaurants' },
      requestId: req.requestId,
    })
  }
})

router.get('/reservations/availability', async (req, res) => {
  try {
    const params = availabilitySchema.parse({
      restaurantId: req.query.restaurantId,
      partySize: req.query.partySize,
      date: req.query.date,
    })

    const date = new Date(params.date)
    if (Number.isNaN(date.getTime())) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'INVALID_DATE', message: 'Invalid reservation date' },
        requestId: req.requestId,
      })
    }

    const slots = await calculateSlotAvailability(params.restaurantId, date, params.partySize)

    res.json({
      ok: true,
      data: {
        slots,
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Public availability fetch failed', { error: error.message })
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'PUBLIC_AVAILABILITY_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

router.post('/reservations', async (req, res) => {
  try {
    const payload = createPublicReservationSchema.parse(req.body)
    const scheduledAt = new Date(payload.scheduledAt)
    if (Number.isNaN(scheduledAt.getTime())) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'INVALID_DATE', message: 'Invalid scheduled time' },
        requestId: req.requestId,
      })
    }

    const slots = await calculateSlotAvailability(
      payload.restaurantId,
      scheduledAt,
      payload.partySize
    )
    const matchingSlot = slots.find(
      (slot) => slot.isAvailable && slot.startTime === scheduledAt.toISOString()
    )
    if (!matchingSlot) {
      return res.status(409).json({
        ok: false,
        data: null,
        error: { name: 'TIME_UNAVAILABLE', message: 'Selected time is no longer available' },
        requestId: req.requestId,
      })
    }

    const { rows } = await query(
      `
        INSERT INTO reservation (
          restaurant_id,
          tables,
          status,
          customer_name,
          customer_phone,
          party_size,
          scheduled_at,
          duration_minutes,
          notes,
          waitlist,
          auto_confirmed,
          public_token,
          public_token_expires_at
        )
        VALUES ($1, $2, 'CONFIRMED', $3, $4, $5, $6, $7, $8, false, true, gen_random_uuid(), now() + interval '180 days')
        RETURNING *
      `,
      [
        payload.restaurantId,
        [], // tables assigned during host flow
        payload.customerName,
        payload.customerPhone ?? null,
        payload.partySize,
        scheduledAt.toISOString(),
        payload.durationMinutes,
        payload.notes ?? null,
      ]
    )

    const reservation = rows[0]

    try {
      await notifyReservationCreated(reservation)
    } catch (notificationError) {
      logger.warn('Public reservation notification failed', { error: notificationError.message })
    }

    res.status(201).json({
      ok: true,
      data: {
        reservation: {
          id: reservation.id,
          restaurantId: reservation.restaurant_id,
          scheduledAt: reservation.scheduled_at,
          partySize: reservation.party_size,
          status: reservation.status,
          manageToken: reservation.public_token,
          manageUrl: `${process.env.PUBLIC_RESERVATION_BASE_URL || ''}/reserve/manage/${reservation.public_token}`,
        },
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Public reservation creation failed', { error: error.message })
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'PUBLIC_RESERVATION_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

router.post('/reservations/waitlist', async (req, res) => {
  try {
    const payload = publicWaitlistSchema.parse(req.body)

    const preferredTime = payload.desiredAt ? new Date(payload.desiredAt) : null
    if (payload.desiredAt && preferredTime && Number.isNaN(preferredTime.getTime())) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'INVALID_DATE', message: 'Invalid preferred time' },
        requestId: req.requestId,
      })
    }

    const { rows } = await query(
      `
        INSERT INTO reservation_waitlist (
          restaurant_id,
          customer_name,
          customer_phone,
          party_size,
          preferred_time,
          notes,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'WAITING')
        RETURNING id, restaurant_id, customer_name, party_size, status
      `,
      [
        payload.restaurantId,
        payload.customerName,
        payload.customerPhone ?? null,
        payload.partySize,
        preferredTime ? preferredTime.toISOString() : null,
        payload.notes ?? null,
      ]
    )

    const waitlist = rows[0]

    try {
      await notifyReservationWaitlist({
        id: waitlist.id,
        restaurant_id: waitlist.restaurant_id,
        customer_name: waitlist.customer_name,
        party_size: waitlist.party_size,
        scheduled_at: null,
        status: waitlist.status,
      })
    } catch (notificationError) {
      logger.warn('Public waitlist notification failed', { error: notificationError.message })
    }

    res.status(201).json({
      ok: true,
      data: {
        message:
          "You've been added to the waitlist. We'll contact you when a table becomes available.",
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Public waitlist creation failed', { error: error.message })
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'PUBLIC_WAITLIST_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

router.post('/staff/request-link', async (req, res) => {
  try {
    const payload = staffLinkRequestSchema.parse(req.body)
    const { rows } = await query(
      `
        SELECT id, display_name, restaurant_id
        FROM staff_member
        WHERE email = $1
      `,
      [payload.email]
    )

    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'STAFF_NOT_FOUND', message: 'No staff member found for this email' },
        requestId: req.requestId,
      })
    }

    const staff = rows[0]
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000)
    const session = await query(
      `
        INSERT INTO staff_portal_session (staff_id, expires_at)
        VALUES ($1, $2)
        RETURNING session_token, expires_at
      `,
      [staff.id, expiresAt.toISOString()]
    )

    res.json({
      ok: true,
      data: {
        sessionToken: session.rows[0].session_token,
        expiresAt: session.rows[0].expires_at,
        // In production, this would be emailed. For now we return token directly.
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Staff portal link request failed', { error: error.message })
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'STAFF_LINK_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

router.post('/staff/session', async (req, res) => {
  try {
    const payload = staffSessionSchema.parse(req.body)
    const session = await ensureStaffSession(payload.token)
    if (!session) {
      return res.status(401).json({
        ok: false,
        data: null,
        error: { name: 'INVALID_SESSION', message: 'Session expired or invalid' },
        requestId: req.requestId,
      })
    }

    res.json({
      ok: true,
      data: {
        sessionToken: session.session_token,
        expiresAt: session.expires_at,
        staffId: session.staff_id,
        restaurantId: session.restaurant_id,
        staffName: session.display_name,
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Staff portal session lookup failed', { error: error.message })
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'STAFF_SESSION_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

router.get('/staff/dashboard', async (req, res) => {
  try {
    const params = staffDashboardSchema.parse({ token: req.query.token })
    const session = await ensureStaffSession(params.token)
    if (!session) {
      return res.status(401).json({
        ok: false,
        data: null,
        error: { name: 'INVALID_SESSION', message: 'Session expired or invalid' },
        requestId: req.requestId,
      })
    }

    const staffId = session.staff_id
    const restaurantId = session.restaurant_id

    const [
      staffInfoResult,
      shiftsResult,
      ptoResult,
      swapsResult,
      announcementsResult,
      documentsResult,
    ] = await Promise.all([
      query(
        `
          SELECT id, display_name, role, email, phone
          FROM staff_member
          WHERE id = $1
        `,
        [staffId]
      ),
      query(
        `
          SELECT id, role, shift_date, starts_at, ends_at, status
          FROM staff_shift
          WHERE restaurant_id = $1
            AND (staff_id = $2 OR staff_id IS NULL)
            AND shift_date >= CURRENT_DATE
          ORDER BY shift_date, starts_at
          LIMIT 10
        `,
        [restaurantId, staffId]
      ),
      query(
        `
          SELECT id, type, status, start_date, end_date, hours_requested, created_at
          FROM staff_pto_request
          WHERE staff_id = $1
          ORDER BY created_at DESC
          LIMIT 10
        `,
        [staffId]
      ),
      query(
        `
          SELECT id, status, reason, created_at
          FROM staff_shift_swap
          WHERE requested_by = $1
          ORDER BY created_at DESC
          LIMIT 10
        `,
        [staffId]
      ),
      query(
        `
          SELECT a.id, a.title, a.body, a.require_ack, a.published_at,
                 EXISTS (
                   SELECT 1 FROM staff_announcement_ack ack
                   WHERE ack.announcement_id = a.id AND ack.staff_id = $1
                 ) AS acknowledged
          FROM staff_announcement a
          WHERE a.restaurant_id = $2
          ORDER BY a.published_at DESC
          LIMIT 5
        `,
        [staffId, restaurantId]
      ),
      query(
        `
          SELECT id, doc_type, title, file_url, status, uploaded_at, expires_at
          FROM staff_document
          WHERE restaurant_id = $1 AND (staff_id = $2 OR staff_id IS NULL)
          ORDER BY uploaded_at DESC
          LIMIT 10
        `,
        [restaurantId, staffId]
      ),
    ])

    res.json({
      ok: true,
      data: {
        staff: staffInfoResult.rows[0],
        upcomingShifts: shiftsResult.rows,
        ptoRequests: ptoResult.rows,
        swapRequests: swapsResult.rows,
        announcements: announcementsResult.rows,
        documents: documentsResult.rows,
        session: {
          token: session.session_token,
          expiresAt: session.expires_at,
        },
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Staff dashboard fetch failed', { error: error.message })
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'STAFF_DASHBOARD_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

router.get('/staff/time-entries', async (req, res) => {
  try {
    const params = staffDashboardSchema.parse({ token: req.query.token })
    const session = await ensureStaffSession(params.token)
    if (!session) {
      return res.status(401).json({
        ok: false,
        data: null,
        error: { name: 'INVALID_SESSION', message: 'Session expired or invalid' },
        requestId: req.requestId,
      })
    }
    const start = new Date()
    start.setDate(start.getDate() - 30)
    const startStr = start.toISOString()
    const { rows } = await query(
      `
        SELECT te.*, sm.display_name AS staff_name, sm.role AS staff_role
        FROM staff_time_entry te
        JOIN staff_member sm ON sm.id = te.staff_id
        WHERE te.restaurant_id = $1 AND te.staff_id = $2 AND te.clock_in_at >= $3
        ORDER BY te.clock_in_at DESC
        LIMIT 50
      `,
      [session.restaurant_id, session.staff_id, startStr]
    )
    res.json({
      ok: true,
      data: rows.map(mapTimeEntryRow),
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Staff time-entries fetch failed', { error: error.message })
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'STAFF_TIME_ENTRIES_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

router.post('/staff/check-in', async (req, res) => {
  try {
    const payload = z
      .object({ token: z.string().uuid(), note: z.string().optional() })
      .parse(req.body)
    const session = await ensureStaffSession(payload.token)
    if (!session) {
      return res.status(401).json({
        ok: false,
        data: null,
        error: { name: 'INVALID_SESSION', message: 'Session expired or invalid' },
        requestId: req.requestId,
      })
    }
    const { rows: openRows } = await query(
      `
        SELECT id FROM staff_time_entry
        WHERE restaurant_id = $1 AND staff_id = $2 AND clock_out_at IS NULL
        LIMIT 1
      `,
      [session.restaurant_id, session.staff_id]
    )
    if (openRows.length) {
      return res.status(409).json({
        ok: false,
        data: null,
        error: {
          name: 'TIME_ENTRY_OPEN_EXISTS',
          message: 'You already have an open time entry. Clock out first.',
        },
        requestId: req.requestId,
      })
    }
    const clockInAt = new Date().toISOString()
    const { rows } = await query(
      `
        INSERT INTO staff_time_entry (
          restaurant_id, staff_id, clock_in_at, clock_in_method, note, created_by, updated_by
        )
        VALUES ($1, $2, $3, 'portal', $4, NULL, NULL)
        RETURNING *
      `,
      [session.restaurant_id, session.staff_id, clockInAt, payload.note ?? null]
    )
    const entry = rows[0]
    const { rows: staffRows } = await query(
      `SELECT display_name AS staff_name, role AS staff_role FROM staff_member WHERE id = $1`,
      [entry.staff_id]
    )
    if (staffRows.length) {
      entry.staff_name = staffRows[0].staff_name
      entry.staff_role = staffRows[0].staff_role
    }
    res.status(201).json({
      ok: true,
      data: mapTimeEntryRow(entry),
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Staff portal check-in failed', { error: error.message })
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'TIME_ENTRY_CREATE_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

router.post('/staff/time-entries/:id/check-out', async (req, res) => {
  try {
    const payload = z.object({ token: z.string().uuid() }).parse(req.body)
    const session = await ensureStaffSession(payload.token)
    if (!session) {
      return res.status(401).json({
        ok: false,
        data: null,
        error: { name: 'INVALID_SESSION', message: 'Session expired or invalid' },
        requestId: req.requestId,
      })
    }
    const entryId = req.params.id
    const clockOutAt = new Date().toISOString()
    const { rows } = await query(
      `
        UPDATE staff_time_entry
        SET clock_out_at = $3, clock_out_method = 'portal', updated_at = now()
        WHERE id = $1 AND restaurant_id = $2 AND staff_id = $4 AND clock_out_at IS NULL
        RETURNING *
      `,
      [entryId, session.restaurant_id, clockOutAt, session.staff_id]
    )
    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Time entry not found or already closed' },
        requestId: req.requestId,
      })
    }
    const entry = rows[0]
    const { rows: staffRows } = await query(
      `SELECT display_name AS staff_name, role AS staff_role FROM staff_member WHERE id = $1`,
      [entry.staff_id]
    )
    if (staffRows.length) {
      entry.staff_name = staffRows[0].staff_name
      entry.staff_role = staffRows[0].staff_role
    }
    res.json({
      ok: true,
      data: mapTimeEntryRow(entry),
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Staff portal check-out failed', { error: error.message })
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'TIME_ENTRY_UPDATE_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

router.post('/staff/pto', async (req, res) => {
  try {
    const payload = staffSelfPtoSchema.parse(req.body)
    const session = await ensureStaffSession(payload.token)
    if (!session) {
      return res.status(401).json({
        ok: false,
        data: null,
        error: { name: 'INVALID_SESSION', message: 'Session expired or invalid' },
        requestId: req.requestId,
      })
    }

    const { rows } = await query(
      `
        INSERT INTO staff_pto_request (
          restaurant_id,
          staff_id,
          type,
          status,
          start_date,
          end_date,
          hours_requested,
          reason,
          created_by
        )
        VALUES ($1, $2, $3, 'PENDING', $4, $5, $6, $7, NULL)
        RETURNING *
      `,
      [
        session.restaurant_id,
        session.staff_id,
        payload.type,
        payload.startDate,
        payload.endDate,
        payload.hoursRequested ?? null,
        payload.reason ?? null,
      ]
    )

    try {
      await notifyStaffPtoRequest(rows[0])
    } catch (notifyError) {
      logger.warn('Staff self-service PTO notification failed', { error: notifyError.message })
    }

    res.status(201).json({
      ok: true,
      data: rows[0],
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Staff self-service PTO failed', { error: error.message })
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'STAFF_PTO_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

router.post('/staff/swaps', async (req, res) => {
  try {
    const payload = staffSelfSwapSchema.parse(req.body)
    const session = await ensureStaffSession(payload.token)
    if (!session) {
      return res.status(401).json({
        ok: false,
        data: null,
        error: { name: 'INVALID_SESSION', message: 'Session expired or invalid' },
        requestId: req.requestId,
      })
    }

    const { rows } = await query(
      `
        INSERT INTO staff_shift_swap (
          restaurant_id,
          shift_id,
          requested_by,
          proposed_cover_id,
          reason,
          status
        )
        VALUES ($1, $2, $3, $4, $5, 'REQUESTED')
        RETURNING *
      `,
      [
        session.restaurant_id,
        payload.shiftId,
        session.staff_id,
        payload.proposedCoverId ?? null,
        payload.reason ?? null,
      ]
    )

    try {
      await notifyStaffSwapRequest(rows[0])
    } catch (notifyError) {
      logger.warn('Staff swap notification failed', { error: notifyError.message })
    }

    res.status(201).json({
      ok: true,
      data: rows[0],
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Staff self-service swap failed', { error: error.message })
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'STAFF_SWAP_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

router.get('/reservations/manage', async (req, res) => {
  try {
    const token = req.query.token
    if (!token) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'RESERVATION_TOKEN_REQUIRED', message: 'Reservation token is required' },
        requestId: req.requestId,
      })
    }
    const reservation = await fetchReservationByToken(token)
    if (!reservation) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'RESERVATION_NOT_FOUND', message: 'Reservation not found or expired' },
        requestId: req.requestId,
      })
    }
    res.json({
      ok: true,
      data: {
        reservation,
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Public reservation manage fetch failed', { error: error.message })
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'RESERVATION_MANAGE_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

router.post('/reservations/manage/cancel', async (req, res) => {
  try {
    const token = req.body.token
    if (!token) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'RESERVATION_TOKEN_REQUIRED', message: 'Reservation token is required' },
        requestId: req.requestId,
      })
    }
    const reservation = await fetchReservationByToken(token)
    if (!reservation) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'RESERVATION_NOT_FOUND', message: 'Reservation not found or expired' },
        requestId: req.requestId,
      })
    }
    if (reservation.status === 'CANCELLED') {
      return res.status(409).json({
        ok: false,
        data: null,
        error: { name: 'RESERVATION_ALREADY_CANCELLED', message: 'Reservation already cancelled' },
        requestId: req.requestId,
      })
    }

    const { rows } = await query(
      `
        UPDATE reservation
        SET status = 'CANCELLED', updated_at = now()
        WHERE id = $1
        RETURNING *
      `,
      [reservation.id]
    )

    res.json({
      ok: true,
      data: {
        reservation: rows[0],
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Public reservation cancel failed', { error: error.message })
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'RESERVATION_CANCEL_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

router.post('/reservations/manage/reschedule', async (req, res) => {
  try {
    const { token, scheduledAt } = req.body ?? {}
    if (!token || !scheduledAt) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'RESERVATION_RESCHEDULE_ERROR',
          message: 'Reservation token and new time are required',
        },
        requestId: req.requestId,
      })
    }
    const reservation = await fetchReservationByToken(token)
    if (!reservation) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'RESERVATION_NOT_FOUND', message: 'Reservation not found or expired' },
        requestId: req.requestId,
      })
    }

    const newDate = new Date(scheduledAt)
    if (Number.isNaN(newDate.getTime())) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'INVALID_DATE', message: 'Invalid scheduled time' },
        requestId: req.requestId,
      })
    }

    const slots = await calculateSlotAvailability(
      reservation.restaurant_id,
      newDate,
      reservation.party_size,
      reservation.id
    )
    const matchingSlot = slots.find(
      (slot) => slot.isAvailable && slot.startTime === newDate.toISOString()
    )
    if (!matchingSlot) {
      return res.status(409).json({
        ok: false,
        data: null,
        error: { name: 'TIME_UNAVAILABLE', message: 'Selected time is no longer available' },
        requestId: req.requestId,
      })
    }

    const { rows } = await query(
      `
        UPDATE reservation
        SET scheduled_at = $2,
            duration_minutes = $3,
            updated_at = now()
        WHERE id = $1
        RETURNING *
      `,
      [reservation.id, newDate.toISOString(), reservation.duration_minutes ?? 90]
    )

    res.json({
      ok: true,
      data: {
        reservation: rows[0],
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Public reservation reschedule failed', { error: error.message })
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'RESERVATION_RESCHEDULE_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

export { router as publicRoutes }
