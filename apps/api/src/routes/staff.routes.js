import express from 'express'
import { z } from 'zod'
import { requireAuth, requireRole } from '../lib/rbac.js'
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { getRestaurantIdByEmail } from '../lib/tenant.js'

const router = express.Router()

const wageTypeEnum = z.enum(['HOURLY', 'SALARY', 'CONTRACT', 'OTHER'])
const staffStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED'])

const createStaffSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  displayName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  role: z.string().min(1),
  wageType: wageTypeEnum.default('HOURLY'),
  wageRate: z.number().nonnegative().optional(),
  hireDate: z.string().optional(),
  profileColor: z.string().optional(),
})

const updateStaffSchema = createStaffSchema
  .partial()
  .extend({
    status: staffStatusEnum.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  })

const shiftStatusEnum = z.enum(['DRAFT', 'PUBLISHED', 'COMPLETED', 'CANCELLED'])

const createShiftSchema = z.object({
  staffId: z.string().uuid().optional(),
  role: z.string().min(1),
  shiftDate: z.string().min(1),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  status: shiftStatusEnum.default('PUBLISHED'),
  notes: z.string().optional(),
})

const updateShiftSchema = createShiftSchema.partial().refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update',
})

const checkInSchema = z.object({
  staffId: z.string().uuid(),
  shiftId: z.string().uuid().optional(),
  clockInAt: z.string().optional(),
  method: z.string().optional(),
  note: z.string().optional(),
})

const checkOutSchema = z.object({
  clockOutAt: z.string().optional(),
  method: z.string().optional(),
  breakMinutes: z.number().min(0).optional(),
  note: z.string().optional(),
  status: z.enum(['APPROVED', 'OPEN', 'LOCKED', 'ADJUSTMENT_REQUIRED']).optional(),
})

async function resolveRestaurantId(req) {
  const email = req.userData?.email
  if (!email) {
    throw new Error('Unable to resolve restaurant context')
  }
  return getRestaurantIdByEmail(email)
}

function mapStaffRow(row) {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    status: row.status,
    firstName: row.first_name,
    lastName: row.last_name,
    displayName: row.display_name ?? `${row.first_name} ${row.last_name}`,
    email: row.email,
    phone: row.phone,
    role: row.role,
    wageType: row.wage_type,
    wageRate: row.wage_rate ? Number(row.wage_rate) : null,
    hireDate: row.hire_date,
    profileColor: row.profile_color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapShiftRow(row) {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    staffId: row.staff_id,
    role: row.role,
    shiftDate: row.shift_date,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    notes: row.notes,
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

function mapTimeEntryRow(row) {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    staffId: row.staff_id,
    shiftId: row.shift_id,
    clockInAt: row.clock_in_at,
    clockInMethod: row.clock_in_method,
    clockOutAt: row.clock_out_at,
    clockOutMethod: row.clock_out_method,
    breakMinutes: row.break_minutes,
    breakDetails: row.break_details,
    status: row.status,
    note: row.note,
    staffName: row.staff_name,
    role: row.staff_role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

router.get(
  '/members',
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  async (req, res) => {
    try {
      const restaurantId = await resolveRestaurantId(req)
      const { rows } = await query(
        `
          SELECT *
          FROM staff_member
          WHERE restaurant_id = $1
          ORDER BY display_name NULLS LAST, first_name, last_name
        `,
        [restaurantId],
      )

      res.json({
        ok: true,
        data: rows.map(mapStaffRow),
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Failed to fetch staff members', { error: error.message })
      res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'STAFF_FETCH_ERROR', message: error.message },
        requestId: req.requestId,
      })
    }
  },
)

router.post(
  '/members',
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  async (req, res) => {
    try {
      const payload = createStaffSchema.parse(req.body)
      const restaurantId = await resolveRestaurantId(req)

      const { rows } = await query(
        `
          INSERT INTO staff_member (
            restaurant_id,
            status,
            first_name,
            last_name,
            display_name,
            email,
            phone,
            role,
            wage_type,
            wage_rate,
            hire_date,
            profile_color
          )
          VALUES (
            $1, 'ACTIVE', $2, $3, $4,
            $5, $6, $7, $8, $9, $10, $11
          )
          RETURNING *
        `,
        [
          restaurantId,
          payload.firstName,
          payload.lastName,
          payload.displayName ?? `${payload.firstName} ${payload.lastName}`,
          payload.email ?? null,
          payload.phone ?? null,
          payload.role,
          payload.wageType,
          payload.wageRate ?? null,
          payload.hireDate ?? null,
          payload.profileColor ?? null,
        ],
      )

      res.status(201).json({
        ok: true,
        data: mapStaffRow(rows[0]),
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Failed to create staff member', { error: error.message })
      res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'STAFF_CREATE_ERROR', message: error.message },
        requestId: req.requestId,
      })
    }
  },
)

router.get(
  '/members/:id',
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  async (req, res) => {
    try {
      const restaurantId = await resolveRestaurantId(req)
      const { rows } = await query(
        `
          SELECT *
          FROM staff_member
          WHERE id = $1 AND restaurant_id = $2
        `,
        [req.params.id, restaurantId],
      )

      if (!rows.length) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: 'Staff member not found' },
          requestId: req.requestId,
        })
      }

      res.json({
        ok: true,
        data: mapStaffRow(rows[0]),
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Failed to fetch staff member', { error: error.message })
      res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'STAFF_FETCH_ERROR', message: error.message },
        requestId: req.requestId,
      })
    }
  },
)

router.patch(
  '/members/:id',
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  async (req, res) => {
    try {
      const payload = updateStaffSchema.parse(req.body)
      const restaurantId = await resolveRestaurantId(req)

      const fields = []
      const values = []
      let index = 1

      Object.entries(payload).forEach(([key, value]) => {
        if (value === undefined) return
        switch (key) {
          case 'firstName':
            fields.push(`first_name = $${++index}`)
            values.push(value)
            break
          case 'lastName':
            fields.push(`last_name = $${++index}`)
            values.push(value)
            break
          case 'displayName':
            fields.push(`display_name = $${++index}`)
            values.push(value)
            break
          case 'email':
            fields.push(`email = $${++index}`)
            values.push(value)
            break
          case 'phone':
            fields.push(`phone = $${++index}`)
            values.push(value)
            break
          case 'role':
            fields.push(`role = $${++index}`)
            values.push(value)
            break
          case 'wageType':
            fields.push(`wage_type = $${++index}`)
            values.push(value)
            break
          case 'wageRate':
            fields.push(`wage_rate = $${++index}`)
            values.push(value)
            break
          case 'hireDate':
            fields.push(`hire_date = $${++index}`)
            values.push(value)
            break
          case 'profileColor':
            fields.push(`profile_color = $${++index}`)
            values.push(value)
            break
          case 'status':
            fields.push(`status = $${++index}`)
            values.push(value)
            break
          default:
            break
        }
      })

      if (!fields.length) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: { name: 'STAFF_UPDATE_ERROR', message: 'No valid fields to update' },
          requestId: req.requestId,
        })
      }

      const { rows } = await query(
        `
          UPDATE staff_member
          SET ${fields.join(', ')},
              updated_at = now()
          WHERE id = $2 AND restaurant_id = $1
          RETURNING *
        `,
        [restaurantId, req.params.id, ...values],
      )

      if (!rows.length) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: 'Staff member not found' },
          requestId: req.requestId,
        })
      }

      res.json({
        ok: true,
        data: mapStaffRow(rows[0]),
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Failed to update staff member', { error: error.message })
      res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'STAFF_UPDATE_ERROR', message: error.message },
        requestId: req.requestId,
      })
    }
  },
)

router.get(
  '/shifts',
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  async (req, res) => {
    try {
      const restaurantId = await resolveRestaurantId(req)
      const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date()
      const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date(startDate.getTime() + 6 * 24 * 60 * 60 * 1000)

      const { rows } = await query(
        `
          SELECT s.*, m.display_name AS staff_name, m.role AS staff_role
          FROM staff_shift s
          LEFT JOIN staff_member m ON m.id = s.staff_id
          WHERE s.restaurant_id = $1
            AND s.shift_date BETWEEN $2 AND $3
          ORDER BY s.starts_at
        `,
        [restaurantId, startDate.toISOString().slice(0, 10), endDate.toISOString().slice(0, 10)],
      )

      res.json({
        ok: true,
        data: rows.map(mapShiftRow),
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Failed to fetch staff shifts', { error: error.message })
      res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'SHIFT_FETCH_ERROR', message: error.message },
        requestId: req.requestId,
      })
    }
  },
)

router.post(
  '/shifts',
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  async (req, res) => {
    try {
      const payload = createShiftSchema.parse(req.body)
      const restaurantId = await resolveRestaurantId(req)

      if (payload.staffId) {
        const ownershipCheck = await query(
          `SELECT 1 FROM staff_member WHERE id = $1 AND restaurant_id = $2`,
          [payload.staffId, restaurantId],
        )
        if (!ownershipCheck.rowCount) {
          return res.status(400).json({
            ok: false,
            data: null,
            error: { name: 'SHIFT_CREATE_ERROR', message: 'Staff member does not belong to this restaurant' },
            requestId: req.requestId,
          })
        }
      }

      const { rows } = await query(
        `
          INSERT INTO staff_shift (
            restaurant_id, staff_id, role,
            shift_date, starts_at, ends_at, status, notes
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *
        `,
        [
          restaurantId,
          payload.staffId ?? null,
          payload.role,
          payload.shiftDate,
          payload.startsAt,
          payload.endsAt,
          payload.status ?? 'PUBLISHED',
          payload.notes ?? null,
        ],
      )

      const shiftRow = rows[0]
      if (shiftRow.staff_id) {
        const { rows: staffRows } = await query(`SELECT display_name AS staff_name, role AS staff_role FROM staff_member WHERE id = $1`, [
          shiftRow.staff_id,
        ])
        if (staffRows.length) {
          shiftRow.staff_name = staffRows[0].staff_name
          shiftRow.staff_role = staffRows[0].staff_role
        }
      }

      res.status(201).json({
        ok: true,
        data: mapShiftRow(shiftRow),
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Failed to create staff shift', { error: error.message })
      res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'SHIFT_CREATE_ERROR', message: error.message },
        requestId: req.requestId,
      })
    }
  },
)

router.patch(
  '/shifts/:id',
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  async (req, res) => {
    try {
      const payload = updateShiftSchema.parse(req.body)
      const restaurantId = await resolveRestaurantId(req)

      const fields = []
      const values = []
      let index = 2

      if (payload.staffId !== undefined) {
        if (payload.staffId) {
          const ownershipCheck = await query(`SELECT 1 FROM staff_member WHERE id = $1 AND restaurant_id = $2`, [
            payload.staffId,
            restaurantId,
          ])
          if (!ownershipCheck.rowCount) {
            return res.status(400).json({
              ok: false,
              data: null,
              error: { name: 'SHIFT_UPDATE_ERROR', message: 'Staff member does not belong to this restaurant' },
              requestId: req.requestId,
            })
          }
        }
        fields.push(`staff_id = $${++index}`)
        values.push(payload.staffId)
      }
      if (payload.role !== undefined) {
        fields.push(`role = $${++index}`)
        values.push(payload.role)
      }
      if (payload.shiftDate !== undefined) {
        fields.push(`shift_date = $${++index}`)
        values.push(payload.shiftDate)
      }
      if (payload.startsAt !== undefined) {
        fields.push(`starts_at = $${++index}`)
        values.push(payload.startsAt)
      }
      if (payload.endsAt !== undefined) {
        fields.push(`ends_at = $${++index}`)
        values.push(payload.endsAt)
      }
      if (payload.status !== undefined) {
        fields.push(`status = $${++index}`)
        values.push(payload.status)
      }
      if (payload.notes !== undefined) {
        fields.push(`notes = $${++index}`)
        values.push(payload.notes)
      }

      if (!fields.length) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: { name: 'SHIFT_UPDATE_ERROR', message: 'No valid fields to update' },
          requestId: req.requestId,
        })
      }

      const { rows } = await query(
        `
          UPDATE staff_shift
          SET ${fields.join(', ')},
              updated_at = now()
          WHERE id = $1 AND restaurant_id = $2
          RETURNING *
        `,
        [req.params.id, restaurantId, ...values],
      )

      if (!rows.length) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: 'Shift not found' },
          requestId: req.requestId,
        })
      }

      const shiftRow = rows[0]
      if (shiftRow.staff_id) {
        const { rows: staffRows } = await query(`SELECT display_name AS staff_name, role AS staff_role FROM staff_member WHERE id = $1`, [
          shiftRow.staff_id,
        ])
        if (staffRows.length) {
          shiftRow.staff_name = staffRows[0].staff_name
          shiftRow.staff_role = staffRows[0].staff_role
        }
      }

      res.json({
        ok: true,
        data: mapShiftRow(shiftRow),
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Failed to update staff shift', { error: error.message })
      res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'SHIFT_UPDATE_ERROR', message: error.message },
        requestId: req.requestId,
      })
    }
  },
)

router.delete(
  '/shifts/:id',
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  async (req, res) => {
    try {
      const restaurantId = await resolveRestaurantId(req)
      const { rowCount } = await query(
        `DELETE FROM staff_shift WHERE id = $1 AND restaurant_id = $2`,
        [req.params.id, restaurantId],
      )

      if (!rowCount) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: 'Shift not found' },
          requestId: req.requestId,
        })
      }

      res.status(204).json({ ok: true, data: null, error: null, requestId: req.requestId })
    } catch (error) {
      logger.error('Failed to delete staff shift', { error: error.message })
      res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'SHIFT_DELETE_ERROR', message: error.message },
        requestId: req.requestId,
      })
    }
  },
)

router.get(
  '/time-entries',
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  async (req, res) => {
    try {
      const restaurantId = await resolveRestaurantId(req)
      const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date(new Date().setDate(new Date().getDate() - 7))
      const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date()

      const { rows } = await query(
        `
          SELECT te.*, sm.display_name AS staff_name, sm.role AS staff_role
          FROM staff_time_entry te
          JOIN staff_member sm ON sm.id = te.staff_id
          WHERE te.restaurant_id = $1
            AND te.clock_in_at BETWEEN $2 AND $3
          ORDER BY te.clock_in_at DESC
        `,
        [restaurantId, startDate.toISOString(), endDate.toISOString()],
      )

      res.json({
        ok: true,
        data: rows.map(mapTimeEntryRow),
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Failed to fetch time entries', { error: error.message })
      res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'TIME_ENTRY_FETCH_ERROR', message: error.message },
        requestId: req.requestId,
      })
    }
  },
)

router.post(
  '/time-entries/check-in',
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  async (req, res) => {
    try {
      const payload = checkInSchema.parse(req.body)
      const restaurantId = await resolveRestaurantId(req)

      const ownershipCheck = await query(`SELECT 1 FROM staff_member WHERE id = $1 AND restaurant_id = $2`, [
        payload.staffId,
        restaurantId,
      ])
      if (!ownershipCheck.rowCount) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: { name: 'TIME_ENTRY_CREATE_ERROR', message: 'Staff member does not belong to this restaurant' },
          requestId: req.requestId,
        })
      }

      const openEntry = await query(
        `
          SELECT id
          FROM staff_time_entry
          WHERE restaurant_id = $1
            AND staff_id = $2
            AND clock_out_at IS NULL
          LIMIT 1
        `,
        [restaurantId, payload.staffId],
      )

      if (openEntry.rowCount) {
        return res.status(409).json({
          ok: false,
          data: null,
          error: { name: 'TIME_ENTRY_OPEN_EXISTS', message: 'Staff member already has an open time entry' },
          requestId: req.requestId,
        })
      }

      const clockInAt = payload.clockInAt ? new Date(payload.clockInAt).toISOString() : new Date().toISOString()

      const { rows } = await query(
        `
          INSERT INTO staff_time_entry (
            restaurant_id,
            staff_id,
            shift_id,
            clock_in_at,
            clock_in_method,
            note,
            created_by,
            updated_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
          RETURNING *
        `,
        [
          restaurantId,
          payload.staffId,
          payload.shiftId ?? null,
          clockInAt,
          payload.method ?? 'web',
          payload.note ?? null,
          req.userData?.id ?? null,
        ],
      )

      const entry = rows[0]
      const staffInfo = await query(`SELECT display_name AS staff_name, role AS staff_role FROM staff_member WHERE id = $1`, [
        entry.staff_id,
      ])
      if (staffInfo.rowCount) {
        entry.staff_name = staffInfo.rows[0].staff_name
        entry.staff_role = staffInfo.rows[0].staff_role
      }

      res.status(201).json({
        ok: true,
        data: mapTimeEntryRow(entry),
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Failed to create time entry (check-in)', { error: error.message })
      res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'TIME_ENTRY_CREATE_ERROR', message: error.message },
        requestId: req.requestId,
      })
    }
  },
)

router.post(
  '/time-entries/:id/check-out',
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  async (req, res) => {
    try {
      const payload = checkOutSchema.parse(req.body)
      const restaurantId = await resolveRestaurantId(req)

      const clockOutAt = payload.clockOutAt ? new Date(payload.clockOutAt).toISOString() : new Date().toISOString()

      const { rows } = await query(
        `
          UPDATE staff_time_entry
          SET clock_out_at = $3,
              clock_out_method = $4,
              break_minutes = COALESCE($5, break_minutes),
              note = COALESCE($6, note),
              status = COALESCE($7, status),
              updated_at = now(),
              updated_by = $2
          WHERE id = $1
            AND restaurant_id = $8
          RETURNING *
        `,
        [
          req.params.id,
          req.userData?.id ?? null,
          clockOutAt,
          payload.method ?? 'web',
          payload.breakMinutes ?? null,
          payload.note ?? null,
          payload.status ?? 'APPROVED',
          restaurantId,
        ],
      )

      if (!rows.length) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: 'Time entry not found' },
          requestId: req.requestId,
        })
      }

      const entry = rows[0]
      const staffInfo = await query(`SELECT display_name AS staff_name, role AS staff_role FROM staff_member WHERE id = $1`, [
        entry.staff_id,
      ])
      if (staffInfo.rowCount) {
        entry.staff_name = staffInfo.rows[0].staff_name
        entry.staff_role = staffInfo.rows[0].staff_role
      }

      res.json({
        ok: true,
        data: mapTimeEntryRow(entry),
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Failed to close time entry (check-out)', { error: error.message })
      res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'TIME_ENTRY_UPDATE_ERROR', message: error.message },
        requestId: req.requestId,
      })
    }
  },
)

export { router as staffRoutes }

