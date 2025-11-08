import express from 'express'
import { z } from 'zod'
import { requireAuth, requireRole } from '../lib/rbac.js'
import { query, withTransaction } from '../lib/db.js'
import { logger } from '../lib/logger.js'

const router = express.Router()

const boardQuerySchema = z.object({
  date: z
    .string()
    .optional()
    .transform((val) => (val ? new Date(val) : new Date())),
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
      }),
    )
    .min(1),
})

const reservationCreateSchema = z.object({
  customerName: z.string().min(1),
  customerPhone: z.string().optional(),
  partySize: z.number().min(1),
  scheduledAt: z.string(),
  durationMinutes: z.number().min(30).max(240).default(90),
  branchId: z.string().uuid().optional(),
  notes: z.string().optional(),
  tableIds: z.array(z.string().uuid()).optional(),
  allowWaitlist: z.boolean().optional().default(true),
})

const reservationStatusSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'SEATED', 'COMPLETED', 'CANCELLED', 'WAITLIST']),
  notes: z.string().optional(),
})

const analyticsQuerySchema = z.object({
  range: z.enum(['day', 'week', 'month']).default('week'),
  branchId: z.string().uuid().optional(),
})

async function resolveRestaurantId(email) {
  const { rows } = await query(
    `
      SELECT id FROM restaurant
      WHERE contact_email = $1
    `,
    [email],
  )

  if (!rows.length) {
    throw new Error('Restaurant not found for user')
  }

  return rows[0].id
}

async function fetchTables(restaurantId, branchId) {
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
    params,
  )
  return rows
}

async function fetchReservations(restaurantId, branchId, dayStart) {
  const start = new Date(dayStart)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setHours(23, 59, 59, 999)

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
    branchId ? [...params, branchId] : params,
  )

  return rows
}

router.get(
  '/board',
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  async (req, res) => {
    try {
      const params = boardQuerySchema.parse(req.query)
      const restaurantId = await resolveRestaurantId(req.userData.email)
      const tables = await fetchTables(restaurantId, params.branchId)
      const reservations = await fetchReservations(restaurantId, params.branchId, params.date)

      const waitlist = await query(
        `
          SELECT *
          FROM reservation_waitlist
          WHERE restaurant_id = $1
            AND status IN ('WAITING','NOTIFIED')
          ORDER BY requested_at
        `,
        [restaurantId],
      )

      res.json({
        ok: true,
        data: {
          day: params.date,
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
  },
)

router.post(
  '/tables',
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  async (req, res) => {
    try {
      const payload = upsertTablesSchema.parse(req.body)
      const restaurantId = await resolveRestaurantId(req.userData.email)

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
              ],
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
                  },
                ),
                table.isActive ?? true,
              ],
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
  },
)

async function calculateAvailability(restaurantId, branchId, scheduledAt, durationMinutes, client) {
  const tables = await fetchTables(restaurantId, branchId)
  const totalSeats = tables.filter((t) => t.is_active).reduce((sum, table) => sum + Number(table.capacity || 0), 0)

  const overlap = await client.query(
    `
      SELECT party_size, duration_minutes
      FROM reservation
      WHERE restaurant_id = $1
        AND status IN ('PENDING','CONFIRMED','SEATED')
        AND tstzrange(scheduled_at, scheduled_at + make_interval(mins => duration_minutes), '[]') &&
            tstzrange($2::timestamptz, $2::timestamptz + make_interval(mins => $3), '[]')
    `,
    [restaurantId, scheduledAt, durationMinutes],
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

router.post(
  '/',
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  async (req, res) => {
    try {
      const payload = reservationCreateSchema.parse(req.body)
      const restaurantId = await resolveRestaurantId(req.userData.email)
      const scheduledAt = new Date(payload.scheduledAt)

      const reservation = await withTransaction(async (client) => {
        const { totalSeats, utilization, tables } = await calculateAvailability(
          restaurantId,
          payload.branchId,
          scheduledAt.toISOString(),
          payload.durationMinutes,
          client,
        )

        if (!totalSeats) {
          throw new Error('Please configure tables before creating reservations')
        }

        let assignedTables = payload.tableIds || []
        if (!assignedTables.length) {
          const availableTables = tables
            .filter((table) => table.is_active)
            .sort((a, b) => Number(a.capacity) - Number(b.capacity))

          const { rows: conflictRows } = await client.query(
            `
              SELECT unnest(tables) as table_id
              FROM reservation
              WHERE restaurant_id = $1
                AND status IN ('PENDING','CONFIRMED','SEATED')
                AND tstzrange(scheduled_at, scheduled_at + make_interval(mins => duration_minutes), '[]') &&
                    tstzrange($2::timestamptz, $2::timestamptz + make_interval(mins => $3), '[]')
            `,
            [restaurantId, scheduledAt.toISOString(), payload.durationMinutes],
          )
          const conflictingTableIds = new Set(conflictRows.map((row) => row.table_id))
          let seatsAccumulated = 0
          for (const table of availableTables) {
            if (conflictingTableIds.has(table.id)) continue
            assignedTables.push(table.id)
            seatsAccumulated += Number(table.capacity)
            if (seatsAccumulated >= payload.partySize) break
          }
        }

        const autoConfirm = utilization < 0.9
        const status = autoConfirm ? 'CONFIRMED' : payload.allowWaitlist ? 'WAITLIST' : 'PENDING'
        const waitlist = status === 'WAITLIST'

        const { rows } = await client.query(
          `
            INSERT INTO reservation (
              restaurant_id,
              branch_id,
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
              created_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *
          `,
          [
            restaurantId,
            payload.branchId || null,
            assignedTables,
            status,
            payload.customerName,
            payload.customerPhone || null,
            payload.partySize,
            scheduledAt.toISOString(),
            payload.durationMinutes,
            payload.notes || null,
            waitlist,
            autoConfirm,
            req.userData.id || null,
          ],
        )

        if (waitlist) {
          await client.query(
            `
              INSERT INTO reservation_waitlist (
                restaurant_id,
                branch_id,
                customer_name,
                customer_phone,
                party_size,
                preferred_time,
                notes
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7)
            `,
            [
              restaurantId,
              payload.branchId || null,
              payload.customerName,
              payload.customerPhone || null,
              payload.partySize,
              scheduledAt.toISOString(),
              payload.notes || null,
            ],
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

      res.status(201).json({
        ok: true,
        data: { reservation },
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
  },
)

router.patch(
  '/:id',
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  async (req, res) => {
    try {
      const { id } = req.params
      const payload = reservationStatusSchema.parse(req.body)
      const restaurantId = await resolveRestaurantId(req.userData.email)

      const { rows } = await query(
        `
          UPDATE reservation
          SET status = $1,
              notes = COALESCE($2, notes),
              waitlist = CASE WHEN $1 = 'WAITLIST' THEN TRUE ELSE waitlist END,
              updated_at = now()
          WHERE id = $3 AND restaurant_id = $4
          RETURNING *
        `,
        [payload.status, payload.notes || null, id, restaurantId],
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
        data: { reservation: rows[0] },
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
  },
)

router.get(
  '/analytics',
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  async (req, res) => {
    try {
      const params = analyticsQuerySchema.parse(req.query)
      const restaurantId = await resolveRestaurantId(req.userData.email)

      const rangeMultiplier = {
        day: 1,
        week: 7,
        month: 30,
      }

      const daysBack = rangeMultiplier[params.range] || 7
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      start.setDate(start.getDate() - daysBack)

      const { rows } = await query(
        `
          SELECT
            date_trunc('hour', scheduled_at) AS hour_slot,
            COUNT(*) FILTER (WHERE status = 'CONFIRMED') AS confirmed,
            COUNT(*) FILTER (WHERE status = 'CANCELLED') AS cancelled,
            COUNT(*) FILTER (WHERE waitlist) AS waitlisted,
            SUM(party_size) AS total_covers
          FROM reservation
          WHERE restaurant_id = $1
            AND scheduled_at >= $2
            ${params.branchId ? 'AND (branch_id = $3 OR branch_id IS NULL)' : ''}
          GROUP BY hour_slot
          ORDER BY hour_slot
        `,
        params.branchId ? [restaurantId, start.toISOString(), params.branchId] : [restaurantId, start.toISOString()],
      )

      const { rows: waitlistRows } = await query(
        `
          SELECT status, COUNT(*) AS total
          FROM reservation_waitlist
          WHERE restaurant_id = $1
          GROUP BY status
        `,
        [restaurantId],
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
  },
)

export { router as reservationsRoutes }

