import express from 'express'
import { z } from 'zod'
import { query, withTransaction } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import {
  notifyReservationCreated,
  notifyReservationWaitlist,
  notifyGuestReservationConfirmation,
  notifyReservationStaffEvent,
} from '../services/notification.service.js'
import { config } from '../config/env.js'
import { sendStaffPortalMagicLink } from '../services/staff-portal-mail.service.js'
import { isEmailConfigured } from '../services/mailer.service.js'
import {
  ensureStaffSession,
  fetchStaffPortalDashboard,
  fetchStaffPortalTimeEntries,
  staffPortalCheckIn,
  staffPortalCheckOut,
  submitStaffPortalPto,
  submitStaffPortalSwap,
  acknowledgeStaffAnnouncement,
  setStaffAvailability,
  getStaffAvailability,
} from '../services/staff-portal-self.service.js'
import {
  acceptWaitlistOffer,
  declineWaitlistOffer,
  assignWaitlistPosition,
  handleReservationCancelled,
} from '../services/waitlistPromotion.js'
import {
  getRestaurantSlotAvailability,
  assertSlotBookable,
  toCalendarDateString,
  CAPACITY_CONSUMING_STATUSES,
  DEFAULT_DURATION_MINUTES,
} from '../lib/reservation-availability.js'
import {
  getPublicSupplierProfile,
  listPublicSupplierProducts,
  listAuthenticatedRestaurantProducts,
  resolvePublicSupplierByIdOrSlug,
} from '../services/public-supplier-catalog.service.js'
import { requireAuth, getRestaurantIdForRequest } from '../lib/rbac.js'

const router = express.Router()

const availabilitySchema = z.object({
  restaurantId: z.string().uuid(),
  partySize: z.coerce.number().min(1).max(50),
  date: z.string(),
  /** When rescheduling, exclude this booking from capacity so its slots stay selectable. */
  manageToken: z.string().uuid().optional(),
  excludeReservationId: z.string().uuid().optional(),
})

const createPublicReservationSchema = z.object({
  restaurantId: z.string().uuid(),
  partySize: z.number().min(1),
  scheduledAt: z.string(),
  durationMinutes: z.number().min(30).max(240).default(90),
  customerName: z.string().min(1),
  customerEmail: z.string().email(),
  customerPhone: z.string().min(1),
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

let staffQueryTokenDeprecationLogged = false

/**
 * Resolve staff portal session token for public self-service routes.
 * Prefer `Authorization: Bearer <token>`, then JSON/body `token`.
 * Query string `?token=` is a deprecated fallback (logged once per process).
 */
function resolveStaffPortalToken(req) {
  const authHeader = req.headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    const bearerToken = authHeader.slice(7).trim()
    if (bearerToken) return bearerToken
  }
  if (req.body?.token) return req.body.token
  if (req.query?.token) {
    if (!staffQueryTokenDeprecationLogged) {
      staffQueryTokenDeprecationLogged = true
      logger.warn(
        'Staff portal token in query string is deprecated; use Authorization: Bearer header or request body token'
      )
    }
    return req.query.token
  }
  return null
}

const publicWaitlistSchema = z.object({
  restaurantId: z.string().uuid(),
  partySize: z.number().min(1).max(50),
  desiredAt: z.string().optional(),
  customerName: z.string().min(1),
  customerPhone: z.string().optional(),
  notes: z.string().optional(),
})

async function loadSlotAvailability(restaurantId, dateInput, partySize, excludeReservationId) {
  const { rows } = await query(`SELECT operating_hours FROM restaurant WHERE id = $1`, [
    restaurantId,
  ])
  return getRestaurantSlotAvailability(query, {
    restaurantId,
    dateInput,
    partySize,
    excludeReservationId,
    operatingHours: rows[0]?.operating_hours,
  })
}

async function fetchReservationByToken(token) {
  const { rows } = await query(
    `
      SELECT *
      FROM reservation
      WHERE public_token = $1
        AND (public_token_expires_at IS NULL OR public_token_expires_at > now())
    `,
    [token]
  )
  return rows[0] ?? null
}

async function assertNoDuplicateGuestBooking(client, restaurantId, scheduledAt, email, phone) {
  const { rows } = await client.query(
    `
      SELECT id FROM reservation
      WHERE restaurant_id = $1
        AND status = ANY($2::text[])
        AND scheduled_at = $3::timestamptz
        AND (
          (customer_email IS NOT NULL AND customer_email = $4)
          OR (customer_phone IS NOT NULL AND customer_phone = $5)
        )
      LIMIT 1
    `,
    [
      restaurantId,
      CAPACITY_CONSUMING_STATUSES,
      new Date(scheduledAt).toISOString(),
      email || null,
      phone || null,
    ]
  )
  if (rows.length) {
    const err = new Error('You already have a reservation at this time.')
    err.name = 'DUPLICATE_RESERVATION'
    err.statusCode = 409
    throw err
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
        ? `SELECT id, slug, name, phone, created_at FROM restaurant WHERE id = $1`
        : `SELECT id, slug, name, phone, created_at FROM restaurant WHERE slug = $1`,
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

const publicSupplierProductsSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  q: z.string().optional(),
  category: z.string().optional(),
})

router.get('/suppliers/:idOrSlug', async (req, res) => {
  try {
    const data = await getPublicSupplierProfile(req.params.idOrSlug)
    res.json({ ok: true, data, error: null, requestId: req.requestId })
  } catch (error) {
    if (error.name === 'NotFoundError') {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'SUPPLIER_NOT_FOUND', message: 'Supplier catalog not found' },
        requestId: req.requestId,
      })
    }
    logger.error('Public supplier fetch failed', { error: error.message })
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'PUBLIC_SUPPLIER_ERROR', message: 'Unable to load supplier catalog' },
      requestId: req.requestId,
    })
  }
})

router.get('/suppliers/:idOrSlug/products', async (req, res) => {
  try {
    const params = publicSupplierProductsSchema.parse(req.query)
    const supplier = await resolvePublicSupplierByIdOrSlug(req.params.idOrSlug)
    const data = await listPublicSupplierProducts(supplier.id, params)
    res.json({ ok: true, data, error: null, requestId: req.requestId })
  } catch (error) {
    if (error.name === 'NotFoundError') {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'SUPPLIER_NOT_FOUND', message: 'Supplier catalog not found' },
        requestId: req.requestId,
      })
    }
    logger.error('Public supplier products fetch failed', { error: error.message })
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'PUBLIC_SUPPLIER_PRODUCTS_ERROR', message: 'Unable to load products' },
      requestId: req.requestId,
    })
  }
})

router.get('/suppliers/:idOrSlug/products/priced', requireAuth, async (req, res) => {
  try {
    const restaurantId = await getRestaurantIdForRequest(req)
    if (!restaurantId) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Restaurant login required for pricing' },
        requestId: req.requestId,
      })
    }
    const params = publicSupplierProductsSchema.parse(req.query)
    const supplier = await resolvePublicSupplierByIdOrSlug(req.params.idOrSlug)
    const data = await listAuthenticatedRestaurantProducts(supplier.id, restaurantId, params)
    res.json({ ok: true, data, error: null, requestId: req.requestId })
  } catch (error) {
    if (error.name === 'NotFoundError') {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'SUPPLIER_NOT_FOUND', message: 'Supplier catalog not found' },
        requestId: req.requestId,
      })
    }
    if (error.name === 'ForbiddenError') {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: error.message },
        requestId: req.requestId,
      })
    }
    logger.error('Public supplier priced products fetch failed', { error: error.message })
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'PUBLIC_SUPPLIER_PRICED_ERROR', message: 'Unable to load priced products' },
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

    let calendarDate
    try {
      calendarDate = toCalendarDateString(params.date)
    } catch {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'INVALID_DATE', message: 'Invalid reservation date' },
        requestId: req.requestId,
      })
    }

    let excludeReservationId = params.excludeReservationId
    if (params.manageToken) {
      const existing = await fetchReservationByToken(params.manageToken)
      if (existing?.id) excludeReservationId = existing.id
    }

    const availability = await loadSlotAvailability(
      params.restaurantId,
      calendarDate,
      params.partySize,
      excludeReservationId
    )

    res.json({
      ok: true,
      data: {
        slots: availability.slots,
        totalCapacity: availability.totalCapacity,
        tableCount: availability.tableCount,
        bookingWindow: availability.bookingWindow,
        durationMinutes: availability.durationMinutes,
        slotIntervalMinutes: availability.slotIntervalMinutes,
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

    if (scheduledAt < new Date()) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'INVALID_DATE', message: 'Cannot book a time in the past' },
        requestId: req.requestId,
      })
    }

    const calendarDate = toCalendarDateString(scheduledAt)
    const durationMinutes = payload.durationMinutes || DEFAULT_DURATION_MINUTES

    const reservation = await withTransaction(async (client) => {
      await client.query(`SELECT id FROM restaurant WHERE id = $1 FOR UPDATE`, [
        payload.restaurantId,
      ])

      const { rows: restaurantRows } = await client.query(
        `SELECT id, name, operating_hours FROM restaurant WHERE id = $1`,
        [payload.restaurantId]
      )
      if (!restaurantRows.length) {
        const err = new Error('Restaurant not found')
        err.name = 'RESTAURANT_NOT_FOUND'
        err.statusCode = 404
        throw err
      }

      await assertNoDuplicateGuestBooking(
        client,
        payload.restaurantId,
        scheduledAt,
        payload.customerEmail,
        payload.customerPhone
      )

      const availability = await getRestaurantSlotAvailability(
        (text, params) => client.query(text, params),
        {
          restaurantId: payload.restaurantId,
          dateInput: calendarDate,
          partySize: payload.partySize,
          operatingHours: restaurantRows[0].operating_hours,
        }
      )

      if (!availability.tableCount || availability.totalCapacity < payload.partySize) {
        const err = new Error(
          availability.tableCount
            ? 'Party size exceeds restaurant capacity. Join the waitlist or choose fewer guests.'
            : 'This restaurant is not accepting online bookings yet.'
        )
        err.name = 'CAPACITY_EXCEEDED'
        err.statusCode = 409
        throw err
      }

      assertSlotBookable(availability, scheduledAt, payload.partySize)

      const { rows } = await client.query(
        `
        INSERT INTO reservation (
          restaurant_id,
          tables,
          status,
          customer_name,
          customer_phone,
          customer_email,
          party_size,
          scheduled_at,
          duration_minutes,
          notes,
          waitlist,
          auto_confirmed,
          public_token,
          public_token_expires_at
        )
        VALUES ($1, $2, 'CONFIRMED', $3, $4, $5, $6, $7, $8, $9, false, true, gen_random_uuid(), now() + interval '180 days')
        RETURNING *
      `,
        [
          payload.restaurantId,
          [],
          payload.customerName,
          payload.customerPhone ?? null,
          payload.customerEmail ?? null,
          payload.partySize,
          scheduledAt.toISOString(),
          durationMinutes,
          payload.notes ?? null,
        ]
      )

      return rows[0]
    })

    try {
      await notifyReservationCreated(reservation)
      const { rows: restaurantRows } = await query('SELECT name FROM restaurant WHERE id = $1', [
        payload.restaurantId,
      ])
      await notifyGuestReservationConfirmation(reservation, restaurantRows[0]?.name)
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
    const status = error.statusCode || 400
    res.status(status).json({
      ok: false,
      data: null,
      error: { name: error.name || 'PUBLIC_RESERVATION_ERROR', message: error.message },
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

    const waitlistRow = await withTransaction(async (client) => {
      const position = await assignWaitlistPosition(client, payload.restaurantId)
      const { rows } = await client.query(
        `
        INSERT INTO reservation_waitlist (
          restaurant_id,
          customer_name,
          customer_phone,
          party_size,
          preferred_time,
          notes,
          status,
          position
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'WAITING', $7)
        RETURNING id, restaurant_id, customer_name, party_size, status, position
      `,
        [
          payload.restaurantId,
          payload.customerName,
          payload.customerPhone ?? null,
          payload.partySize,
          preferredTime ? preferredTime.toISOString() : null,
          payload.notes ?? null,
          position,
        ]
      )
      return rows[0]
    })
    const rows = [waitlistRow]

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

router.post('/reservations/waitlist/:token/accept', async (req, res) => {
  try {
    const { token } = req.params
    if (!token) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'TOKEN_REQUIRED', message: 'Offer token is required' },
        requestId: req.requestId,
      })
    }

    const { reservation, waitlist, manageToken, manageUrl } = await acceptWaitlistOffer(token)

    try {
      await notifyReservationCreated(reservation)
      const { rows: restaurantRows } = await query('SELECT name FROM restaurant WHERE id = $1', [
        reservation.restaurant_id,
      ])
      await notifyGuestReservationConfirmation(reservation, restaurantRows[0]?.name)
    } catch (notificationError) {
      logger.warn('Waitlist accept notification failed', { error: notificationError.message })
    }

    res.json({
      ok: true,
      data: {
        reservation: {
          id: reservation.id,
          status: reservation.status,
          scheduledAt: reservation.scheduled_at,
          partySize: reservation.party_size,
          publicToken: reservation.public_token,
        },
        waitlist: { id: waitlist.id, status: waitlist.status, offerStatus: waitlist.offer_status },
        manageToken,
        manageUrl,
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Waitlist offer accept failed', { error: error.message })
    const status =
      error.statusCode === 409
        ? 409
        : error.message.includes('not found') || error.message.includes('expired')
          ? 410
          : 400
    res.status(status).json({
      ok: false,
      data: null,
      error: { name: 'WAITLIST_ACCEPT_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

router.post('/reservations/waitlist/:token/decline', async (req, res) => {
  try {
    const { token } = req.params
    if (!token) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'TOKEN_REQUIRED', message: 'Offer token is required' },
        requestId: req.requestId,
      })
    }

    const waitlist = await declineWaitlistOffer(token)

    res.json({
      ok: true,
      data: {
        message: 'Offer declined. The next guest on the waitlist may be contacted.',
        waitlist: { id: waitlist.id, status: waitlist.status, offerStatus: waitlist.offer_status },
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Waitlist offer decline failed', { error: error.message })
    const status =
      error.message.includes('not found') || error.message.includes('expired') ? 410 : 400
    res.status(status).json({
      ok: false,
      data: null,
      error: { name: 'WAITLIST_DECLINE_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

router.post('/staff/request-link', async (req, res) => {
  try {
    const payload = staffLinkRequestSchema.parse(req.body)
    const { rows } = await query(
      `
        SELECT id, display_name, restaurant_id, portal_access_enabled
        FROM staff_member
        WHERE LOWER(TRIM(email)) = LOWER(TRIM($1))
          AND status = 'ACTIVE'
          AND portal_access_enabled = true
      `,
      [payload.email]
    )

    const genericMessage =
      'If an account exists for this email, a sign-in link has been sent. Check your inbox.'

    if (!rows.length) {
      return res.json({
        ok: true,
        data: { message: genericMessage },
        error: null,
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

    const sessionToken = session.rows[0].session_token
    const sessionExpiresAt = session.rows[0].expires_at

    try {
      await sendStaffPortalMagicLink({
        to: payload.email,
        displayName: staff.display_name,
        sessionToken,
        expiresAt: sessionExpiresAt,
      })
    } catch (mailError) {
      logger.error('Staff portal magic link email failed', {
        staffId: staff.id,
        error: mailError.message,
      })
    }

    const responseData = { message: genericMessage }
    // Dev-only: expose token when SMTP is not configured (local testing without mail server)
    if (config.NODE_ENV === 'development' && !isEmailConfigured()) {
      responseData.sessionToken = sessionToken
      responseData.expiresAt = sessionExpiresAt
    }

    res.json({
      ok: true,
      data: responseData,
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
    const token = resolveStaffPortalToken(req)
    const params = staffDashboardSchema.parse({ token })
    const session = await ensureStaffSession(params.token)
    if (!session) {
      return res.status(401).json({
        ok: false,
        data: null,
        error: { name: 'INVALID_SESSION', message: 'Session expired or invalid' },
        requestId: req.requestId,
      })
    }

    const dashboard = await fetchStaffPortalDashboard(session.staff_id, session.restaurant_id)

    res.json({
      ok: true,
      data: {
        ...dashboard,
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
    const token = resolveStaffPortalToken(req)
    const params = staffDashboardSchema.parse({ token })
    const session = await ensureStaffSession(params.token)
    if (!session) {
      return res.status(401).json({
        ok: false,
        data: null,
        error: { name: 'INVALID_SESSION', message: 'Session expired or invalid' },
        requestId: req.requestId,
      })
    }
    const entries = await fetchStaffPortalTimeEntries(session.staff_id, session.restaurant_id)
    res.json({
      ok: true,
      data: entries,
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
    const data = await staffPortalCheckIn(session.staff_id, session.restaurant_id, payload.note)
    res.status(201).json({
      ok: true,
      data,
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Staff portal check-in failed', { error: error.message })
    const status = error.status || 400
    res.status(status).json({
      ok: false,
      data: null,
      error: { name: error.name || 'TIME_ENTRY_CREATE_ERROR', message: error.message },
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
    const data = await staffPortalCheckOut(session.staff_id, session.restaurant_id, req.params.id)
    res.json({
      ok: true,
      data,
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Staff portal check-out failed', { error: error.message })
    const status = error.status || 400
    res.status(status).json({
      ok: false,
      data: null,
      error: { name: error.name || 'TIME_ENTRY_UPDATE_ERROR', message: error.message },
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

    const data = await submitStaffPortalPto(session.staff_id, session.restaurant_id, payload)

    res.status(201).json({
      ok: true,
      data,
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

    const data = await submitStaffPortalSwap(session.staff_id, session.restaurant_id, payload)

    res.status(201).json({
      ok: true,
      data,
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

router.post('/staff/announcements/:id/ack', async (req, res) => {
  try {
    const token = resolveStaffPortalToken(req)
    const session = await ensureStaffSession(token)
    if (!session) {
      return res.status(401).json({
        ok: false,
        data: null,
        error: { name: 'INVALID_SESSION', message: 'Session expired or invalid' },
        requestId: req.requestId,
      })
    }
    const data = await acknowledgeStaffAnnouncement(
      session.staff_id,
      session.restaurant_id,
      req.params.id
    )
    res.json({ ok: true, data, error: null, requestId: req.requestId })
  } catch (error) {
    const status = error.status || 400
    res.status(status).json({
      ok: false,
      data: null,
      error: { name: error.name || 'STAFF_ACK_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

router.get('/staff/availability', async (req, res) => {
  try {
    const token = resolveStaffPortalToken(req)
    const params = staffDashboardSchema.parse({ token })
    const session = await ensureStaffSession(params.token)
    if (!session) {
      return res.status(401).json({
        ok: false,
        data: null,
        error: { name: 'INVALID_SESSION', message: 'Session expired or invalid' },
        requestId: req.requestId,
      })
    }
    const data = await getStaffAvailability(session.staff_id, session.restaurant_id)
    res.json({ ok: true, data, error: null, requestId: req.requestId })
  } catch (error) {
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'STAFF_AVAILABILITY_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

router.post('/staff/availability', async (req, res) => {
  try {
    const token = req.body?.token
    const session = await ensureStaffSession(token)
    if (!session) {
      return res.status(401).json({
        ok: false,
        data: null,
        error: { name: 'INVALID_SESSION', message: 'Session expired or invalid' },
        requestId: req.requestId,
      })
    }
    const payload = z
      .object({
        weekday: z.number().int().min(0).max(6),
        availability: z.object({
          blocks: z.array(
            z.object({
              start: z.string(),
              end: z.string(),
            })
          ),
        }),
        notes: z.string().optional(),
      })
      .parse(req.body)
    const data = await setStaffAvailability(session.staff_id, session.restaurant_id, payload)
    res.status(201).json({ ok: true, data, error: null, requestId: req.requestId })
  } catch (error) {
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'STAFF_AVAILABILITY_ERROR', message: error.message },
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
    const { rows: restaurantRows } = await query(
      `SELECT name, slug FROM restaurant WHERE id = $1`,
      [reservation.restaurant_id]
    )
    const restaurant = restaurantRows[0]
    res.json({
      ok: true,
      data: {
        reservation: {
          ...reservation,
          restaurantName: restaurant?.name,
          restaurantSlug: restaurant?.slug,
          manageToken: reservation.public_token,
        },
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
        SET status = 'CANCELLED',
            updated_at = now(),
            cancelled_at = now(),
            cancellation_reason = 'Guest cancelled'
        WHERE id = $1
        RETURNING *
      `,
      [reservation.id]
    )

    const cancelled = rows[0]

    try {
      await handleReservationCancelled(cancelled, { cancellationReason: 'Guest cancelled' })
    } catch (promotionError) {
      logger.warn('Waitlist auto-promotion failed after guest cancellation', {
        error: promotionError.message,
        reservationId: cancelled.id,
      })
    }

    void notifyReservationStaffEvent(cancelled, 'cancelled').catch((err) =>
      logger.warn('Reservation cancel notification failed', { error: err.message })
    )

    res.json({
      ok: true,
      data: {
        reservation: cancelled,
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

    const calendarDate = toCalendarDateString(newDate)
    const availability = await loadSlotAvailability(
      reservation.restaurant_id,
      calendarDate,
      reservation.party_size,
      reservation.id
    )
    let bookedSlot
    try {
      bookedSlot = assertSlotBookable(availability, newDate, reservation.party_size)
    } catch (slotError) {
      return res.status(slotError.statusCode || 409).json({
        ok: false,
        data: null,
        error: {
          name: slotError.name || 'TIME_UNAVAILABLE',
          message: slotError.message,
        },
        requestId: req.requestId,
      })
    }

    const canonicalStart = new Date(bookedSlot.startTime)
    const durationMinutes = reservation.duration_minutes ?? 90

    const { rows } = await query(
      `
        UPDATE reservation
        SET scheduled_at = $2,
            duration_minutes = $3,
            updated_at = now(),
            public_token_expires_at = COALESCE(public_token_expires_at, now() + interval '180 days')
        WHERE id = $1
        RETURNING *
      `,
      [reservation.id, canonicalStart.toISOString(), durationMinutes]
    )

    void notifyReservationStaffEvent(rows[0], 'rescheduled').catch((err) =>
      logger.warn('Reservation reschedule notification failed', { error: err.message })
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
