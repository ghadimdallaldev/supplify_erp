import express from 'express'
import { z } from 'zod'
import { requireAuth, requireRole, resolveTenantContext, requirePermission } from '../lib/rbac.js'
import { requireRestaurantId } from '../lib/tenant-resolve.js'
import { reservationsMutationGuard } from '../lib/route-permissions.js'
import { query, withTransaction } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import {
  notifyReservationCreated,
  notifyReservationWaitlist,
  notifyGuestReservationConfirmation,
  notifyGuestReservationUpdate,
  notifyReservationStaffEvent,
} from '../services/notification.service.js'
import {
  handleReservationCancelled,
  manuallyPromoteWaitlistEntry,
  assignWaitlistPosition,
} from '../services/waitlistPromotion.js'
import {
  buildUniformOperatingHours,
  parseOperatingHours,
  parseTimeToHour,
  summarizeBookingHours,
} from '../lib/reservation-booking-hours.js'
import {
  CAPACITY_CONSUMING_STATUSES,
  assignTablesForParty,
  getTableAssignmentError,
  readBookingMeta,
  toCalendarDateString,
} from '../lib/reservation-availability.js'
import {
  entersCapacity,
  getReservationStatusChange,
  getReservationTransitionError,
  leavesNoShow,
  resolveHostBookingStatus,
} from '../lib/reservation-status.js'
import { getZonedDayBounds, parseBoardDateParam } from '../lib/reservation-board-date.js'
import { getRestaurantTimezone } from '../lib/tenant-timezone.js'
import {
  assertLegacyBranchOwnedByRestaurant,
  assertLegacyBranchesOwnedByRestaurant,
} from '../lib/branch-scope.js'
import {
  upsertReservationGuest,
  recordGuestVisit,
  reverseGuestNoShow,
  summarizeGuestIntelligence,
  listRestaurantReservationReviews,
  replyToReservationReview,
} from '../services/reservation-guest-reviews.service.js'

const router = express.Router()

/** pg uuid[] may arrive as a JS array or a "{uuid,...}" string depending on driver/settings. */
function normalizeUuidArray(value) {
  if (value == null) return []
  if (Array.isArray(value)) return value.filter(Boolean).map((id) => String(id))
  if (typeof value === 'string') {
    const s = value.trim()
    if (!s || s === '{}') return []
    if (s.startsWith('{')) {
      return s
        .slice(1, -1)
        .split(',')
        .map((part) => part.trim().replace(/^"|"$/g, ''))
        .filter(Boolean)
    }
    return [s]
  }
  return []
}

function mapReservationRow(row) {
  if (!row) return row
  return { ...row, tables: normalizeUuidArray(row.tables) }
}

const boardQuerySchema = z.object({
  date: z.string().optional(),
  branchId: z.string().uuid().optional(),
})

const upsertTablesSchema = z.object({
  tables: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        name: z.string().min(1),
        capacity: z.number().min(1),
        branchId: z.string().uuid().nullable().optional(),
        layout: z.record(z.any()).optional(),
        position: z
          .object({
            x: z.number().optional(),
            y: z.number().optional(),
          })
          .optional(),
        isActive: z.boolean().optional(),
      })
    )
    .min(1),
})

const reservationCreateSchema = z.object({
  customerName: z.string().min(1),
  customerPhone: z.string().optional(),
  customerEmail: z.string().email().optional(),
  partySize: z.number().min(1),
  scheduledAt: z.string(),
  durationMinutes: z.number().min(30).max(240).default(90),
  branchId: z.string().uuid().optional(),
  notes: z.string().optional(),
  occasion: z.string().max(120).optional(),
  allergies: z.string().max(500).optional(),
  bookingSource: z.enum(['staff', 'public', 'walk_in']).optional().default('staff'),
  tableIds: z.array(z.string().uuid()).optional(),
  allowWaitlist: z.boolean().optional().default(true),
})

const reservationStatusSchema = z.object({
  status: z.enum([
    'PENDING',
    'CONFIRMED',
    'SEATED',
    'COMPLETED',
    'CANCELLED',
    'WAITLIST',
    'NO_SHOW',
  ]),
  notes: z.string().optional(),
  cancellationReason: z.string().optional(),
})

const reviewReplySchema = z.object({
  reply: z.string().min(1).max(2000),
})

const blackoutSchema = z.object({
  blackoutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().max(500).optional(),
  branchId: z.string().uuid().nullable().optional(),
})

const analyticsQuerySchema = z.object({
  range: z.enum(['day', 'week', 'month']).default('week'),
  branchId: z.string().uuid().optional(),
})

const guestIntelQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
})

async function fetchTables(restaurantId, branchId) {
  await assertLegacyBranchOwnedByRestaurant(branchId, restaurantId)
  const params = [restaurantId]
  let branchFilter = ''
  if (branchId) {
    params.push(branchId)
    branchFilter = `AND (branch_id = $2 OR branch_id IS NULL)`
  }
  const { rows } = await query(
    `
      SELECT *
      FROM reservation_table
      WHERE restaurant_id = $1
        ${branchFilter}
      ORDER BY created_at
    `,
    params
  )
  return rows
}

async function fetchReservations(restaurantId, branchId, dayYmd) {
  await assertLegacyBranchOwnedByRestaurant(branchId, restaurantId)
  const timeZone = await getRestaurantTimezone(restaurantId)
  const { start, end } = getZonedDayBounds(dayYmd, timeZone)
  const params = [restaurantId, start.toISOString(), end.toISOString()]
  let branchFilter = ''
  if (branchId) {
    params.push(branchId)
    branchFilter = `AND (r.branch_id = $4 OR r.branch_id IS NULL)`
  }

  const { rows } = await query(
    `
      SELECT r.*
      FROM reservation r
      WHERE r.restaurant_id = $1
        AND r.scheduled_at BETWEEN $2 AND $3
        ${branchFilter}
      ORDER BY r.scheduled_at
    `,
    params
  )

  return rows.map(mapReservationRow)
}

router.use(
  requireAuth,
  resolveTenantContext,
  requirePermission('RESERVATIONS_VIEW'),
  reservationsMutationGuard
)

router.get('/board', requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const params = boardQuerySchema.parse(req.query)
    const day = parseBoardDateParam(params.date)
    const restaurantId = await requireRestaurantId(req)
    const tables = await fetchTables(restaurantId, params.branchId)
    const reservations = await fetchReservations(restaurantId, params.branchId, day)

    const waitlistParams = [restaurantId]
    let waitlistBranchFilter = ''
    if (params.branchId) {
      waitlistParams.push(params.branchId)
      waitlistBranchFilter = 'AND (branch_id = $2 OR branch_id IS NULL)'
    }

    const waitlist = await query(
      `
          SELECT *
          FROM reservation_waitlist
          WHERE restaurant_id = $1
            AND status IN ('WAITING','NOTIFIED')
            ${waitlistBranchFilter}
          ORDER BY position ASC NULLS LAST, requested_at ASC
        `,
      waitlistParams
    )

    res.json({
      ok: true,
      data: {
        day,
        tables,
        reservations,
        waitlist: waitlist.rows,
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Reservation board fetch failed', { error: error.message })
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'BOARD_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

const bookingTimeSchema = z
  .string()
  .min(1)
  .transform((val) => {
    const match = String(val)
      .trim()
      .match(/^(\d{1,2}):(\d{2})/)
    if (!match) {
      throw new Error('Invalid time — use HH:mm')
    }
    return `${match[1].padStart(2, '0')}:${match[2]}`
  })

const publicBookingSettingsSchema = z.object({
  openTime: bookingTimeSchema,
  closeTime: bookingTimeSchema,
  durationMinutes: z.coerce.number().min(30).max(240).optional(),
  slotIntervalMinutes: z.coerce.number().min(15).max(60).optional(),
  minPartySize: z.coerce.number().min(1).max(50).optional(),
  maxPartySize: z.coerce.number().min(1).max(100).optional(),
  maxCoversPerSlot: z.coerce.number().min(1).max(500).optional(),
  cancelWindowHours: z.coerce.number().min(0).max(168).optional(),
  depositMode: z.enum(['none', 'fixed', 'percent']).optional(),
  depositAmount: z.coerce.number().min(0).optional(),
  depositPercent: z.coerce.number().min(0).max(100).optional(),
  depositPolicyText: z.string().max(1000).optional(),
})

async function loadPublicBookingSettings(restaurantId) {
  const { rows } = await query(`SELECT operating_hours FROM restaurant WHERE id = $1`, [
    restaurantId,
  ])
  const operatingHours = parseOperatingHours(rows[0]?.operating_hours)
  const summary = summarizeBookingHours(operatingHours)
  const bookingMeta = readBookingMeta(operatingHours)
  const tables = await fetchTables(restaurantId)
  const activeTables = tables.filter((table) => table.is_active)
  const totalCapacity = activeTables.reduce((sum, table) => sum + Number(table.capacity || 0), 0)
  return {
    ...summary,
    durationMinutes: bookingMeta.durationMinutes,
    slotIntervalMinutes: bookingMeta.slotIntervalMinutes,
    minPartySize: bookingMeta.minPartySize,
    maxPartySize: bookingMeta.maxPartySize,
    maxCoversPerSlot: bookingMeta.maxCoversPerSlot,
    cancelWindowHours: bookingMeta.cancelWindowHours,
    depositMode: bookingMeta.depositMode,
    depositAmount: bookingMeta.depositAmount,
    depositPercent: bookingMeta.depositPercent,
    depositPolicyText: bookingMeta.depositPolicyText,
    tableCount: activeTables.length,
    totalCapacity,
  }
}

router.get('/public-booking-settings', requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const restaurantId = await requireRestaurantId(req)
    const data = await loadPublicBookingSettings(restaurantId)
    res.json({
      ok: true,
      data,
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Public booking settings fetch failed', { error: error.message })
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'BOOKING_SETTINGS_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

router.patch('/public-booking-settings', requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const restaurantId = await requireRestaurantId(req)
    const payload = publicBookingSettingsSchema.parse(req.body)
    const openHour = parseTimeToHour(payload.openTime)
    const closeHour = parseTimeToHour(payload.closeTime)
    if (openHour == null || closeHour == null || closeHour <= openHour) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'BOOKING_SETTINGS_ERROR',
          message: 'Close time must be after open time',
        },
        requestId: req.requestId,
      })
    }

    const existing = parseOperatingHours(
      (await query(`SELECT operating_hours FROM restaurant WHERE id = $1`, [restaurantId])).rows[0]
        ?.operating_hours
    )
    const existingMeta = readBookingMeta(existing)
    const minPartySize = payload.minPartySize ?? existingMeta.minPartySize
    const maxPartySize = payload.maxPartySize ?? existingMeta.maxPartySize
    if (Number(minPartySize) > Number(maxPartySize)) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'BOOKING_SETTINGS_ERROR',
          message: 'Minimum party size cannot be greater than the maximum',
        },
        requestId: req.requestId,
      })
    }
    const operatingHours = {
      ...buildUniformOperatingHours(payload.openTime, payload.closeTime),
      _booking: {
        durationMinutes: payload.durationMinutes ?? existingMeta.durationMinutes,
        slotIntervalMinutes: payload.slotIntervalMinutes ?? existingMeta.slotIntervalMinutes,
        minPartySize,
        maxPartySize,
        maxCoversPerSlot:
          payload.maxCoversPerSlot !== undefined
            ? payload.maxCoversPerSlot
            : existingMeta.maxCoversPerSlot,
        cancelWindowHours:
          payload.cancelWindowHours !== undefined
            ? payload.cancelWindowHours
            : existingMeta.cancelWindowHours,
        depositMode: payload.depositMode ?? existingMeta.depositMode,
        depositAmount: payload.depositAmount ?? existingMeta.depositAmount,
        depositPercent: payload.depositPercent ?? existingMeta.depositPercent,
        depositPolicyText: payload.depositPolicyText ?? existingMeta.depositPolicyText,
      },
    }
    await query(
      `UPDATE restaurant SET operating_hours = $2::jsonb, updated_at = now() WHERE id = $1`,
      [restaurantId, JSON.stringify(operatingHours)]
    )

    const data = await loadPublicBookingSettings(restaurantId)
    res.json({
      ok: true,
      data,
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Public booking settings update failed', { error: error.message })
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'BOOKING_SETTINGS_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

router.post('/tables', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const payload = upsertTablesSchema.parse(req.body)
    const restaurantId = await requireRestaurantId(req)
    await assertLegacyBranchesOwnedByRestaurant(
      payload.tables.map((table) => table.branchId),
      restaurantId
    )

    const result = await withTransaction(async (client) => {
      const upserted = []
      for (const table of payload.tables) {
        if (table.id) {
          const { rows } = await client.query(
            `
                UPDATE reservation_table
                SET name = $1,
                    capacity = $2,
                    branch_id = $3,
                    layout = COALESCE($4::jsonb, layout),
                    position = COALESCE($5::jsonb, position),
                    is_active = COALESCE($6, is_active),
                    updated_at = now()
                WHERE id = $7 AND restaurant_id = $8
                RETURNING *
              `,
            [
              table.name,
              table.capacity,
              table.branchId || null,
              table.layout ? JSON.stringify(table.layout) : null,
              table.position ? JSON.stringify(table.position) : null,
              table.isActive ?? null,
              table.id,
              restaurantId,
            ]
          )
          if (rows[0]) upserted.push(rows[0])
        } else {
          const { rows } = await client.query(
            `
                INSERT INTO reservation_table (restaurant_id, branch_id, name, capacity, layout, position, is_active)
                VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, COALESCE($7, TRUE))
                RETURNING *
              `,
            [
              restaurantId,
              table.branchId || null,
              table.name,
              table.capacity,
              JSON.stringify(table.layout || {}),
              JSON.stringify(
                table.position || {
                  x: 0,
                  y: 0,
                }
              ),
              table.isActive ?? true,
            ]
          )
          upserted.push(rows[0])
        }
      }
      return upserted
    })

    res.json({
      ok: true,
      data: { tables: result },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Table upsert failed', { error: error.message, stack: error.stack })
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'TABLE_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

async function calculateAvailability(restaurantId, branchId, scheduledAt, durationMinutes, client) {
  const tables = await fetchTables(restaurantId, branchId)
  const totalSeats = tables
    .filter((t) => t.is_active)
    .reduce((sum, table) => sum + Number(table.capacity || 0), 0)

  const overlapParams = [restaurantId, scheduledAt, durationMinutes]
  let overlapBranchFilter = ''
  if (branchId) {
    overlapParams.push(branchId)
    overlapBranchFilter = 'AND (branch_id = $4 OR branch_id IS NULL)'
  }

  const overlap = await client.query(
    `
      SELECT party_size, duration_minutes
      FROM reservation
      WHERE restaurant_id = $1
        AND status IN ('PENDING','CONFIRMED','SEATED')
        AND tstzrange(scheduled_at, scheduled_at + make_interval(mins => duration_minutes), '[)') &&
            tstzrange($2::timestamptz, $2::timestamptz + make_interval(mins => $3), '[)')
        ${overlapBranchFilter}
    `,
    overlapParams
  )

  const reservedSeats = overlap.rows.reduce((sum, row) => sum + Number(row.party_size || 0), 0)
  const utilization = totalSeats === 0 ? 1 : reservedSeats / totalSeats

  return {
    totalSeats,
    reservedSeats,
    utilization,
    tables,
  }
}

router.post('/', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const payload = reservationCreateSchema.parse(req.body)
    const restaurantId = await requireRestaurantId(req)
    const scheduledAt = new Date(payload.scheduledAt)
    if (Number.isNaN(scheduledAt.getTime())) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'INVALID_DATE', message: 'Invalid scheduled time' },
        requestId: req.requestId,
      })
    }
    if (scheduledAt.getTime() < Date.now() - 2 * 60 * 1000) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'INVALID_DATE', message: 'Cannot book a time in the past' },
        requestId: req.requestId,
      })
    }

    const reservation = await withTransaction(async (client) => {
      const calendarDate = toCalendarDateString(scheduledAt)
      const blackoutParams = [restaurantId, calendarDate]
      let blackoutBranchSql = 'AND branch_id IS NULL'
      if (payload.branchId) {
        blackoutParams.push(payload.branchId)
        blackoutBranchSql = 'AND (branch_id IS NULL OR branch_id = $3)'
      }
      const { rows: blackoutRows } = await client.query(
        `
          SELECT reason
          FROM reservation_blackout
          WHERE restaurant_id = $1
            AND blackout_date = $2::date
            ${blackoutBranchSql}
          LIMIT 1
        `,
        blackoutParams
      )
      if (blackoutRows.length) {
        const reason = blackoutRows[0].reason
        throw new Error(
          reason ? `This date is closed: ${reason}` : 'This date is closed for reservations'
        )
      }

      const { totalSeats, utilization, tables } = await calculateAvailability(
        restaurantId,
        payload.branchId,
        scheduledAt.toISOString(),
        payload.durationMinutes,
        client
      )

      if (!totalSeats) {
        throw new Error('Please configure tables before creating reservations')
      }

      const conflictParams = [restaurantId, scheduledAt.toISOString(), payload.durationMinutes]
      let conflictBranchFilter = ''
      if (payload.branchId) {
        conflictParams.push(payload.branchId)
        conflictBranchFilter = 'AND (branch_id = $4 OR branch_id IS NULL)'
      }

      const { rows: conflictRows } = await client.query(
        `
              SELECT unnest(tables) as table_id
              FROM reservation
              WHERE restaurant_id = $1
                AND status IN ('PENDING','CONFIRMED','SEATED')
                AND tstzrange(scheduled_at, scheduled_at + make_interval(mins => duration_minutes), '[)') &&
                    tstzrange($2::timestamptz, $2::timestamptz + make_interval(mins => $3), '[)')
                ${conflictBranchFilter}
            `,
        conflictParams
      )
      const conflictingTableIds = new Set(conflictRows.map((row) => row.table_id))
      const activeTables = tables
        .filter((table) => table.is_active)
        .sort((a, b) => Number(a.capacity) - Number(b.capacity))
      const tablesById = new Map(activeTables.map((table) => [table.id, table]))

      let assignedTables = [...(payload.tableIds || [])]
      let seatsAccumulated = 0
      if (assignedTables.length) {
        for (const tableId of assignedTables) {
          const table = tablesById.get(tableId)
          if (!table) {
            throw new Error('One or more tables are invalid or inactive')
          }
          if (conflictingTableIds.has(tableId)) {
            throw new Error('One of these tables is already booked for this time')
          }
          seatsAccumulated += Number(table.capacity)
        }
        if (seatsAccumulated < payload.partySize) {
          throw new Error('These tables do not seat this party')
        }
      } else {
        const autoAssigned = assignTablesForParty(
          activeTables,
          payload.partySize,
          conflictingTableIds
        )
        assignedTables = autoAssigned.tableIds
        seatsAccumulated = autoAssigned.seats
      }

      const seated = seatsAccumulated >= payload.partySize && assignedTables.length > 0
      if (!seated) {
        if (!payload.allowWaitlist) {
          throw new Error('Not enough free tables for this party')
        }
        assignedTables = []
      }

      const status = resolveHostBookingStatus({ seated, utilization })
      const autoConfirm = status === 'CONFIRMED'
      const waitlist = status === 'WAITLIST'

      const guest = await upsertReservationGuest(client, {
        restaurantId,
        displayName: payload.customerName,
        phone: payload.customerPhone,
        email: payload.customerEmail,
        allergies: payload.allergies,
        notes: payload.notes,
      })

      const { rows } = await client.query(
        `
            INSERT INTO reservation (
              restaurant_id,
              branch_id,
              tables,
              status,
              customer_name,
              customer_phone,
              customer_email,
              party_size,
              scheduled_at,
              duration_minutes,
              notes,
              occasion,
              allergies,
              booking_source,
              guest_id,
              waitlist,
              auto_confirmed,
              created_by,
              public_token,
              public_token_expires_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, gen_random_uuid(), now() + interval '180 days')
            RETURNING *
          `,
        [
          restaurantId,
          payload.branchId || null,
          assignedTables,
          status,
          payload.customerName,
          payload.customerPhone || null,
          payload.customerEmail || null,
          payload.partySize,
          scheduledAt.toISOString(),
          payload.durationMinutes,
          payload.notes || null,
          payload.occasion || null,
          payload.allergies || null,
          payload.bookingSource || 'staff',
          guest?.id || null,
          waitlist,
          autoConfirm,
          req.userData?.id || null,
        ]
      )

      if (waitlist) {
        const position = await assignWaitlistPosition(client, restaurantId)
        await client.query(
          `
              INSERT INTO reservation_waitlist (
                restaurant_id,
                branch_id,
                customer_name,
                customer_phone,
                party_size,
                preferred_time,
                notes,
                position
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `,
          [
            restaurantId,
            payload.branchId || null,
            payload.customerName,
            payload.customerPhone || null,
            payload.partySize,
            scheduledAt.toISOString(),
            payload.notes || null,
            position,
          ]
        )
      }

      if (status === 'WAITLIST') {
        logger.info('Reservation waitlisted - notification stub', {
          customer: payload.customerName,
          phone: payload.customerPhone,
          restaurantId,
        })
      }

      return rows[0]
    })

    try {
      await notifyReservationCreated(reservation)
      if (reservation.waitlist) {
        await notifyReservationWaitlist(reservation)
      }
      if (reservation.status === 'CONFIRMED' || reservation.status === 'WAITLIST') {
        const { rows: restaurantRows } = await query('SELECT name FROM restaurant WHERE id = $1', [
          restaurantId,
        ])
        await notifyGuestReservationConfirmation(reservation, restaurantRows[0]?.name)
      }
    } catch (notifyError) {
      logger.warn('Reservation notification failed', {
        error: notifyError.message,
        reservationId: reservation.id,
      })
    }

    res.status(201).json({
      ok: true,
      data: { reservation: mapReservationRow(reservation) },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Reservation creation failed', { error: error.message, stack: error.stack })
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'RESERVATION_CREATE_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

const reservationAssignTablesSchema = z.object({
  tableIds: z.array(z.string().uuid()),
})

router.patch('/:id/tables', requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const { id } = req.params
    const payload = reservationAssignTablesSchema.parse(req.body)
    const restaurantId = await requireRestaurantId(req)

    const tables = await fetchTables(restaurantId)
    const { rows: currentRows } = await query(
      `
        SELECT id, party_size, scheduled_at, duration_minutes, status
        FROM reservation
        WHERE id = $1 AND restaurant_id = $2
      `,
      [id, restaurantId]
    )
    if (!currentRows.length) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Reservation not found' },
        requestId: req.requestId,
      })
    }

    const current = currentRows[0]
    let others = []
    if (payload.tableIds.length) {
      const { rows: otherRows } = await query(
        `
          SELECT id, status, scheduled_at, duration_minutes, tables
          FROM reservation
          WHERE restaurant_id = $1
            AND id <> $2
            AND status = ANY($3::text[])
            AND tables && $4::uuid[]
        `,
        [restaurantId, id, CAPACITY_CONSUMING_STATUSES, payload.tableIds]
      )
      others = otherRows
    }

    const assignmentError = getTableAssignmentError({
      partySize: current.party_size,
      tableIds: payload.tableIds,
      tables,
      scheduledAt: current.scheduled_at,
      durationMinutes: current.duration_minutes,
      otherReservations: others,
    })
    if (assignmentError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'INVALID_TABLE', message: assignmentError },
        requestId: req.requestId,
      })
    }

    const { rows } = await query(
      `
        UPDATE reservation
        SET tables = $1::uuid[],
            updated_at = now()
        WHERE id = $2 AND restaurant_id = $3
        RETURNING *
      `,
      [payload.tableIds, id, restaurantId]
    )

    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Reservation not found' },
        requestId: req.requestId,
      })
    }

    res.json({
      ok: true,
      data: { reservation: mapReservationRow(rows[0]) },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Reservation table assignment failed', { error: error.message })
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'RESERVATION_ASSIGN_TABLES_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

async function getRestoreCapacityError(restaurantId, reservation) {
  const tableIds = normalizeUuidArray(reservation.tables)
  const duration = Number(reservation.duration_minutes) || 90
  const params = [restaurantId, reservation.scheduled_at, duration, reservation.id]
  let branchSql = ''
  if (reservation.branch_id) {
    params.push(reservation.branch_id)
    branchSql = 'AND (branch_id = $5 OR branch_id IS NULL)'
  }
  const { rows: others } = await query(
    `
      SELECT id, status, tables, scheduled_at, duration_minutes, party_size
      FROM reservation
      WHERE restaurant_id = $1
        AND id <> $4
        AND status IN ('PENDING','CONFIRMED','SEATED')
        AND tstzrange(scheduled_at, scheduled_at + make_interval(mins => duration_minutes), '[)') &&
            tstzrange($2::timestamptz, $2::timestamptz + make_interval(mins => $3), '[)')
        ${branchSql}
    `,
    params
  )
  const floor = await fetchTables(restaurantId, reservation.branch_id || undefined)
  const othersNormalized = others.map((row) => ({
    ...row,
    tables: normalizeUuidArray(row.tables),
  }))
  if (tableIds.length) {
    const tableError = getTableAssignmentError({
      partySize: reservation.party_size,
      tableIds,
      tables: floor,
      scheduledAt: reservation.scheduled_at,
      durationMinutes: duration,
      otherReservations: othersNormalized,
    })
    if (tableError) return tableError
  }
  const totalSeats = floor
    .filter((table) => table.is_active !== false)
    .reduce((sum, table) => sum + Number(table.capacity || 0), 0)
  const reserved = othersNormalized.reduce((sum, row) => sum + Number(row.party_size || 0), 0)
  if (totalSeats > 0 && reserved + Number(reservation.party_size || 0) > totalSeats) {
    return 'Not enough seats left at this time'
  }
  return null
}

router.patch('/:id', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const { id } = req.params
    const payload = reservationStatusSchema.parse(req.body)
    const restaurantId = await requireRestaurantId(req)

    const { rows: currentRows } = await query(
      `
        SELECT id, status, scheduled_at, duration_minutes, tables, party_size, branch_id, guest_id
        FROM reservation
        WHERE id = $1 AND restaurant_id = $2
      `,
      [id, restaurantId]
    )
    if (!currentRows.length) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Reservation not found' },
        requestId: req.requestId,
      })
    }

    const transitionError = getReservationTransitionError(currentRows[0].status, payload.status)
    if (transitionError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'INVALID_STATUS', message: transitionError },
        requestId: req.requestId,
      })
    }
    const statusChange = getReservationStatusChange(currentRows[0].status, payload.status)
    if (entersCapacity(currentRows[0].status, payload.status)) {
      const capacityError = await getRestoreCapacityError(restaurantId, currentRows[0])
      if (capacityError) {
        return res.status(409).json({
          ok: false,
          data: null,
          error: { name: 'TIME_UNAVAILABLE', message: capacityError },
          requestId: req.requestId,
        })
      }
    }

    const { rows } = await query(
      `
          UPDATE reservation
          SET status = $1,
              notes = COALESCE($2, notes),
              waitlist = CASE WHEN $1 = 'WAITLIST' THEN TRUE ELSE waitlist END,
              cancelled_at = CASE WHEN $1 = 'CANCELLED' THEN COALESCE(cancelled_at, now()) ELSE cancelled_at END,
              cancellation_reason = CASE
                WHEN $1 = 'CANCELLED' THEN COALESCE($5, cancellation_reason)
                ELSE cancellation_reason
              END,
              no_show_marked_at = CASE
                WHEN $1 = 'NO_SHOW' THEN COALESCE(no_show_marked_at, now())
                ELSE no_show_marked_at
              END,
              updated_at = now()
          WHERE id = $3 AND restaurant_id = $4
          RETURNING *
        `,
      [payload.status, payload.notes || null, id, restaurantId, payload.cancellationReason || null]
    )

    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Reservation not found' },
        requestId: req.requestId,
      })
    }

    const reservation = rows[0]

    if (statusChange.recordVisit && reservation.guest_id) {
      try {
        await recordGuestVisit({ query }, reservation.guest_id, { noShow: false })
      } catch (guestError) {
        logger.warn('Guest visit update failed', { error: guestError.message })
      }
    }
    if (statusChange.recordNoShow && reservation.guest_id) {
      try {
        await recordGuestVisit({ query }, reservation.guest_id, { noShow: true })
      } catch (guestError) {
        logger.warn('Guest no-show update failed', { error: guestError.message })
      }
    }
    if (leavesNoShow(currentRows[0].status, payload.status) && reservation.guest_id) {
      try {
        await reverseGuestNoShow({ query }, reservation.guest_id)
      } catch (guestError) {
        logger.warn('Guest no-show reversal failed', { error: guestError.message })
      }
    }

    if (statusChange.promoteWaitlist) {
      try {
        await handleReservationCancelled(reservation, {
          cancellationReason: payload.cancellationReason || payload.notes || null,
        })
      } catch (promotionError) {
        logger.warn('Waitlist auto-promotion failed after cancellation', {
          error: promotionError.message,
          reservationId: reservation.id,
        })
      }
    }

    if (statusChange.notifyGuest) {
      try {
        const { rows: restaurantRows } = await query('SELECT name FROM restaurant WHERE id = $1', [
          restaurantId,
        ])
        await notifyGuestReservationConfirmation(reservation, restaurantRows[0]?.name)
      } catch (notifyError) {
        logger.warn('Guest reservation notification failed', {
          error: notifyError.message,
          reservationId: reservation.id,
        })
      }
    }

    if (statusChange.notifyStaffCancel) {
      void notifyReservationStaffEvent(reservation, 'cancelled').catch((err) =>
        logger.warn('Reservation cancel notification failed', { error: err.message })
      )
      try {
        const { rows: restaurantRows } = await query('SELECT name FROM restaurant WHERE id = $1', [
          restaurantId,
        ])
        await notifyGuestReservationUpdate(reservation, restaurantRows[0]?.name, 'cancelled')
      } catch (notifyError) {
        logger.warn('Guest reservation cancel notification failed', {
          error: notifyError.message,
          reservationId: reservation.id,
        })
      }
    } else if (payload.status === 'WAITLIST') {
      void notifyReservationWaitlist(reservation).catch((err) =>
        logger.warn('Reservation waitlist notification failed', { error: err.message })
      )
    } else {
      void notifyReservationStaffEvent(reservation, 'status_changed').catch((err) =>
        logger.warn('Reservation status notification failed', { error: err.message })
      )
    }

    res.json({
      ok: true,
      data: { reservation: mapReservationRow(reservation) },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'RESERVATION_UPDATE_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

const waitlistQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
})

router.get('/waitlist', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const params = waitlistQuerySchema.parse(req.query)
    const restaurantId = await requireRestaurantId(req)
    await assertLegacyBranchOwnedByRestaurant(params.branchId, restaurantId)
    const waitlistParams = [restaurantId]
    let waitlistBranchFilter = ''
    if (params.branchId) {
      waitlistParams.push(params.branchId)
      waitlistBranchFilter = 'AND (branch_id = $2 OR branch_id IS NULL)'
    }

    const { rows } = await query(
      `
        SELECT *
        FROM reservation_waitlist
        WHERE restaurant_id = $1
          AND status IN ('WAITING', 'NOTIFIED')
          ${waitlistBranchFilter}
        ORDER BY position ASC NULLS LAST, requested_at ASC
      `,
      waitlistParams
    )

    res.json({
      ok: true,
      data: { waitlist: rows },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Waitlist fetch failed', { error: error.message })
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'WAITLIST_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

router.post(
  '/waitlist/:id/manually-promote',
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  async (req, res) => {
    try {
      const { id } = req.params
      const restaurantId = await requireRestaurantId(req)
      const offered = await manuallyPromoteWaitlistEntry(id, restaurantId)

      res.json({
        ok: true,
        data: { waitlist: offered },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Manual waitlist promotion failed', { error: error.message })
      res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'WAITLIST_PROMOTE_ERROR', message: error.message },
        requestId: req.requestId,
      })
    }
  }
)

router.get(
  '/guest-intelligence',
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  async (req, res) => {
    try {
      const { branchId } = guestIntelQuerySchema.parse(req.query)
      const restaurantId = await requireRestaurantId(req)
      await assertLegacyBranchOwnedByRestaurant(branchId, restaurantId)

      const params = [restaurantId]
      let branchFilter = ''
      if (branchId) {
        params.push(branchId)
        branchFilter = 'AND (branch_id = $2 OR branch_id IS NULL)'
      }

      const { rows: guests } = await query(
        `
          SELECT
            customer_name,
            customer_phone,
            customer_email,
            COUNT(*) FILTER (WHERE status = 'COMPLETED') AS visit_count,
            MAX(scheduled_at) FILTER (WHERE status = 'COMPLETED') AS last_visit,
            SUM(party_size) FILTER (WHERE status = 'COMPLETED') AS total_covers,
            COUNT(*) FILTER (
              WHERE status IN ('PENDING', 'CONFIRMED') AND scheduled_at >= now()
            ) AS upcoming_count,
            COUNT(*) FILTER (WHERE status = 'NO_SHOW') AS no_show_count
          FROM reservation
          WHERE restaurant_id = $1
            ${branchFilter}
          GROUP BY customer_name, customer_phone, customer_email
          HAVING COUNT(*) FILTER (WHERE status = 'COMPLETED') > 0
            OR COUNT(*) FILTER (
              WHERE status IN ('PENDING', 'CONFIRMED') AND scheduled_at >= now()
            ) > 0
            OR COUNT(*) FILTER (WHERE status = 'NO_SHOW') > 0
          ORDER BY visit_count DESC, last_visit DESC NULLS LAST
          LIMIT 25
        `,
        params
      )

      res.json({
        ok: true,
        data: summarizeGuestIntelligence(guests),
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Guest intelligence error', { error: error.message })
      res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'GUEST_INTELLIGENCE_ERROR', message: error.message },
        requestId: req.requestId,
      })
    }
  }
)

router.get('/analytics', requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const params = analyticsQuerySchema.parse(req.query)
    const restaurantId = await requireRestaurantId(req)
    await assertLegacyBranchOwnedByRestaurant(params.branchId, restaurantId)

    const rangeMultiplier = {
      day: 1,
      week: 7,
      month: 30,
    }

    const daysBack = rangeMultiplier[params.range] || 7
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    start.setDate(start.getDate() - (params.range === 'day' ? 0 : daysBack))

    const bucketExpr =
      params.range === 'day'
        ? "date_trunc('hour', scheduled_at)"
        : "date_trunc('day', scheduled_at)"

    const { rows } = await query(
      `
          SELECT
            ${bucketExpr} AS hour_slot,
            COUNT(*) FILTER (WHERE status = 'CONFIRMED') AS confirmed,
            COUNT(*) FILTER (WHERE status = 'CANCELLED') AS cancelled,
            COUNT(*) FILTER (WHERE status = 'NO_SHOW') AS no_shows,
            COUNT(*) FILTER (WHERE waitlist) AS waitlisted,
            SUM(party_size) AS total_covers
          FROM reservation
          WHERE restaurant_id = $1
            AND scheduled_at >= $2
            ${params.branchId ? 'AND (branch_id = $3 OR branch_id IS NULL)' : ''}
          GROUP BY hour_slot
          ORDER BY hour_slot
        `,
      params.branchId
        ? [restaurantId, start.toISOString(), params.branchId]
        : [restaurantId, start.toISOString()]
    )

    const waitlistStatsParams = [restaurantId]
    let waitlistStatsBranchFilter = ''
    if (params.branchId) {
      waitlistStatsParams.push(params.branchId)
      waitlistStatsBranchFilter = 'AND (branch_id = $2 OR branch_id IS NULL)'
    }

    const { rows: waitlistRows } = await query(
      `
          SELECT status, COUNT(*) AS total
          FROM reservation_waitlist
          WHERE restaurant_id = $1
            ${waitlistStatsBranchFilter}
          GROUP BY status
        `,
      waitlistStatsParams
    )

    res.json({
      ok: true,
      data: {
        periodStart: start,
        slots: rows,
        waitlist: waitlistRows,
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Reservation analytics error', { error: error.message })
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'ANALYTICS_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

router.get('/reviews', requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const restaurantId = await requireRestaurantId(req)
    const limit = Math.min(Number(req.query.limit) || 50, 100)
    const offset = Math.max(Number(req.query.offset) || 0, 0)
    const reviews = await listRestaurantReservationReviews(restaurantId, { limit, offset })
    res.json({
      ok: true,
      data: { reviews },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Reservation reviews list failed', { error: error.message })
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'RESERVATION_REVIEWS_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

router.post('/reviews/:id/reply', requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const restaurantId = await requireRestaurantId(req)
    const payload = reviewReplySchema.parse(req.body)
    const review = await replyToReservationReview({
      reviewId: req.params.id,
      restaurantId,
      userId: req.userData?.id || null,
      reply: payload.reply,
    })
    res.json({
      ok: true,
      data: { review },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    const status = error.statusCode || 400
    res.status(status).json({
      ok: false,
      data: null,
      error: { name: error.name || 'REVIEW_REPLY_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

router.get('/blackouts', requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const restaurantId = await requireRestaurantId(req)
    const { rows } = await query(
      `
      SELECT id, restaurant_id, branch_id, blackout_date, reason, created_at
      FROM reservation_blackout
      WHERE restaurant_id = $1
        AND blackout_date >= CURRENT_DATE - INTERVAL '7 days'
      ORDER BY blackout_date ASC
      `,
      [restaurantId]
    )
    res.json({ ok: true, data: { blackouts: rows }, error: null, requestId: req.requestId })
  } catch (error) {
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'BLACKOUT_LIST_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

router.post('/blackouts', requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const restaurantId = await requireRestaurantId(req)
    const payload = blackoutSchema.parse(req.body)
    await assertLegacyBranchOwnedByRestaurant(payload.branchId, restaurantId)
    const { rows } = await query(
      `
      INSERT INTO reservation_blackout (restaurant_id, branch_id, blackout_date, reason)
      VALUES ($1, $2, $3::date, $4)
      RETURNING *
      `,
      [restaurantId, payload.branchId || null, payload.blackoutDate, payload.reason || null]
    )
    res.status(201).json({
      ok: true,
      data: { blackout: rows[0] },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'BLACKOUT_CREATE_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

router.delete('/blackouts/:id', requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const restaurantId = await requireRestaurantId(req)
    const { rows } = await query(
      `DELETE FROM reservation_blackout WHERE id = $1 AND restaurant_id = $2 RETURNING id`,
      [req.params.id, restaurantId]
    )
    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Blackout not found' },
        requestId: req.requestId,
      })
    }
    res.json({ ok: true, data: { id: rows[0].id }, error: null, requestId: req.requestId })
  } catch (error) {
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'BLACKOUT_DELETE_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

export { router as reservationsRoutes }
