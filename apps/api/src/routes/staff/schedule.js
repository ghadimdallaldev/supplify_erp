import express from 'express'
import { z, ZodError } from 'zod'
import {
  requireAuth,
  requireRole,
  resolveTenantContext,
  requirePermission,
  getRestaurantIdForRequest,
} from '../../lib/rbac.js'
import { requireStaffPortalAuth, requirePlatformAppAccess } from '../../lib/staff-portal-auth.js'
import { staffMutationGuard } from '../../lib/route-permissions.js'
import {
  cachedStaffList,
  staffListCacheInvalidationMiddleware,
} from '../../lib/staff-list-cache.js'
import { query, withTransaction } from '../../lib/db.js'
import { logger } from '../../lib/logger.js'
import { getRestaurantIdByEmail } from '../../lib/tenant.js'
import { assertPresignedFileUrl } from '../../lib/sanitize-upload.js'
import {
  notifyStaffPtoRequest,
  notifyStaffSwapRequest,
  notifyStaffAnnouncement,
  notifyStaffDocumentUploaded,
  notifyStaffShiftEvent,
  notifyStaffPtoDecision,
  notifyStaffSwapDecision,
} from '../../services/notification.service.js'
import {
  fetchStaffPortalDashboard,
  fetchStaffPortalTimeEntries,
  staffPortalCheckIn,
  staffPortalCheckOut,
  submitStaffPortalPto,
  submitStaffPortalSwap,
  acknowledgeStaffAnnouncement,
  setStaffAvailability,
  getStaffAvailability,
} from '../../services/staff-portal-self.service.js'
import { fetchLabourSummary } from '../../services/staff-labour-summary.service.js'
import {
  computePayrollPreview,
  previewToPayrollTotals,
} from '../../services/staff-payroll.service.js'
import {
  createStaffPortalAccount,
  sendStaffPortalInviteEmail,
  disableStaffPortalAccess,
  resetStaffPortalAccess,
  getStaffPortalAccessRow,
  mapPortalAccessInfo,
} from '../../services/staff-portal-account.service.js'

import {
  resolveRestaurantId,
  mapStaffRow,
  mapShiftRow,
  mapTimeEntryRow,
  mapPtoRow,
  mapSwapRow,
  mapAnnouncementRow,
  mapDocumentRow,
  mapIncidentRow,
  mapPerformanceNoteRow,
  mapPayrollExportRow,
  staffStatusEnum,
  createStaffSchema,
  updateStaffSchema,
  shiftStatusEnum,
  createShiftSchema,
  updateShiftSchema,
  checkInSchema,
  checkOutSchema,
  ptoTypeEnum,
  createPtoSchema,
  updatePtoSchema,
  availabilitySchema,
  createSwapSchema,
  decideSwapSchema,
  createAnnouncementSchema,
  acknowledgeAnnouncementSchema,
  createDocumentSchema,
  createIncidentSchema,
  createPerformanceNoteSchema,
  createPayrollExportSchema,
  updatePayrollExportSchema,
} from './staff.shared.js'

const router = express.Router()

router.get('/shifts', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const restaurantId = await resolveRestaurantId(req)
    const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date()
    const endDate = req.query.endDate
      ? new Date(req.query.endDate)
      : new Date(startDate.getTime() + 6 * 24 * 60 * 60 * 1000)

    const { rows } = await query(
      `
          SELECT s.*, m.display_name AS staff_name, m.role AS staff_role
          FROM staff_shift s
          LEFT JOIN staff_member m ON m.id = s.staff_id
          WHERE s.restaurant_id = $1
            AND s.shift_date BETWEEN $2 AND $3
          ORDER BY s.starts_at
        `,
      [restaurantId, startDate.toISOString().slice(0, 10), endDate.toISOString().slice(0, 10)]
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
})

router.post('/shifts', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const payload = createShiftSchema.parse(req.body)
    const restaurantId = await resolveRestaurantId(req)

    if (payload.staffId) {
      const ownershipCheck = await query(
        `SELECT 1 FROM staff_member WHERE id = $1 AND restaurant_id = $2`,
        [payload.staffId, restaurantId]
      )
      if (!ownershipCheck.rowCount) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'SHIFT_CREATE_ERROR',
            message: 'Staff member does not belong to this restaurant',
          },
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
      ]
    )

    const shiftRow = rows[0]
    if (shiftRow.staff_id) {
      const { rows: staffRows } = await query(
        `SELECT display_name AS staff_name, role AS staff_role FROM staff_member WHERE id = $1`,
        [shiftRow.staff_id]
      )
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

    if (shiftRow.staff_id && (shiftRow.status === 'PUBLISHED' || !payload.status)) {
      notifyStaffShiftEvent(shiftRow.staff_id, restaurantId, {
        title: 'Shift assigned',
        message: `You have a new shift on ${shiftRow.shift_date} (${shiftRow.starts_at} – ${shiftRow.ends_at}).`,
        shiftId: shiftRow.id,
      }).catch(() => {})
    }
  } catch (error) {
    logger.error('Failed to create staff shift', { error: error.message })
    if (error instanceof ZodError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'SHIFT_CREATE_ERROR',
          message: 'Please provide role, date, start time, and end time when creating a shift.',
          details: error.errors,
        },
        requestId: req.requestId,
      })
    }
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'SHIFT_CREATE_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

router.patch('/shifts/:id', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const payload = updateShiftSchema.parse(req.body)
    const restaurantId = await resolveRestaurantId(req)

    const fields = []
    const values = []
    let index = 2

    if (payload.staffId !== undefined) {
      if (payload.staffId) {
        const ownershipCheck = await query(
          `SELECT 1 FROM staff_member WHERE id = $1 AND restaurant_id = $2`,
          [payload.staffId, restaurantId]
        )
        if (!ownershipCheck.rowCount) {
          return res.status(400).json({
            ok: false,
            data: null,
            error: {
              name: 'SHIFT_UPDATE_ERROR',
              message: 'Staff member does not belong to this restaurant',
            },
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
      [req.params.id, restaurantId, ...values]
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
      const { rows: staffRows } = await query(
        `SELECT display_name AS staff_name, role AS staff_role FROM staff_member WHERE id = $1`,
        [shiftRow.staff_id]
      )
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
})

router.delete(
  '/shifts/:id',
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  async (req, res) => {
    try {
      const restaurantId = await resolveRestaurantId(req)
      const { rowCount } = await query(
        `DELETE FROM staff_shift WHERE id = $1 AND restaurant_id = $2`,
        [req.params.id, restaurantId]
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
  }
)

router.get('/time-entries', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const restaurantId = await resolveRestaurantId(req)
    const startDate = req.query.startDate
      ? new Date(req.query.startDate)
      : new Date(new Date().setDate(new Date().getDate() - 7))
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
      [restaurantId, startDate.toISOString(), endDate.toISOString()]
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
})

router.post(
  '/time-entries/check-in',
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  async (req, res) => {
    try {
      const payload = checkInSchema.parse(req.body)
      const restaurantId = await resolveRestaurantId(req)

      const ownershipCheck = await query(
        `SELECT 1 FROM staff_member WHERE id = $1 AND restaurant_id = $2`,
        [payload.staffId, restaurantId]
      )
      if (!ownershipCheck.rowCount) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'TIME_ENTRY_CREATE_ERROR',
            message: 'Staff member does not belong to this restaurant',
          },
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
        [restaurantId, payload.staffId]
      )

      if (openEntry.rowCount) {
        return res.status(409).json({
          ok: false,
          data: null,
          error: {
            name: 'TIME_ENTRY_OPEN_EXISTS',
            message: 'Staff member already has an open time entry',
          },
          requestId: req.requestId,
        })
      }

      const clockInAt = payload.clockInAt
        ? new Date(payload.clockInAt).toISOString()
        : new Date().toISOString()

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
        ]
      )

      const entry = rows[0]
      const staffInfo = await query(
        `SELECT display_name AS staff_name, role AS staff_role FROM staff_member WHERE id = $1`,
        [entry.staff_id]
      )
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
  }
)

router.post(
  '/time-entries/:id/check-out',
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  async (req, res) => {
    try {
      const payload = checkOutSchema.parse(req.body)
      const restaurantId = await resolveRestaurantId(req)

      const clockOutAt = payload.clockOutAt
        ? new Date(payload.clockOutAt).toISOString()
        : new Date().toISOString()

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
        ]
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
      const staffInfo = await query(
        `SELECT display_name AS staff_name, role AS staff_role FROM staff_member WHERE id = $1`,
        [entry.staff_id]
      )
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
  }
)

router.get('/availability', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const restaurantId = await resolveRestaurantId(req)
    const { rows } = await query(
      `
          SELECT a.*, m.display_name AS staff_name
          FROM staff_availability a
          JOIN staff_member m ON m.id = a.staff_id
          WHERE a.restaurant_id = $1
          ORDER BY m.display_name, weekday
        `,
      [restaurantId]
    )

    res.json({
      ok: true,
      data: rows.map((row) => ({
        id: row.id,
        restaurantId: row.restaurant_id,
        staffId: row.staff_id,
        weekday: row.weekday,
        availability: row.availability,
        notes: row.notes,
        staffName: row.staff_name,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Failed to fetch staff availability', { error: error.message })
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'AVAILABILITY_FETCH_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

router.post(
  '/availability',
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  async (req, res) => {
    try {
      const payload = availabilitySchema.parse(req.body)
      const restaurantId = await resolveRestaurantId(req)

      const ownershipCheck = await query(
        `SELECT 1 FROM staff_member WHERE id = $1 AND restaurant_id = $2`,
        [payload.staffId, restaurantId]
      )
      if (!ownershipCheck.rowCount) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'AVAILABILITY_SET_ERROR',
            message: 'Staff member does not belong to this restaurant',
          },
          requestId: req.requestId,
        })
      }

      const { rows } = await query(
        `
          INSERT INTO staff_availability (restaurant_id, staff_id, weekday, availability, notes)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (staff_id, weekday)
          DO UPDATE SET availability = EXCLUDED.availability,
                        notes = EXCLUDED.notes,
                        updated_at = now()
          RETURNING *
        `,
        [
          restaurantId,
          payload.staffId,
          payload.weekday,
          JSON.stringify(payload.availability),
          payload.notes ?? null,
        ]
      )

      const row = rows[0]
      res.status(201).json({
        ok: true,
        data: {
          id: row.id,
          restaurantId: row.restaurant_id,
          staffId: row.staff_id,
          weekday: row.weekday,
          availability: row.availability,
          notes: row.notes,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Failed to set availability', { error: error.message })
      res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'AVAILABILITY_SET_ERROR', message: error.message },
        requestId: req.requestId,
      })
    }
  }
)

router.get('/swaps', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const restaurantId = await resolveRestaurantId(req)
    const data = await cachedStaffList('swaps', restaurantId, req, async () => {
      const { rows } = await query(
        `
          SELECT s.*,
                 sh.role AS shift_role,
                 sh.starts_at AS shift_starts_at,
                 sh.ends_at AS shift_ends_at,
                 sh.shift_date,
                 requester.display_name AS requester_name,
                 cover.display_name AS cover_name,
                 cover.id AS cover_id
          FROM staff_shift_swap s
          JOIN staff_shift sh ON sh.id = s.shift_id
          JOIN staff_member requester ON requester.id = s.requested_by
          LEFT JOIN staff_member cover ON cover.id = s.proposed_cover_id
          WHERE s.restaurant_id = $1
          ORDER BY s.created_at DESC
        `,
        [restaurantId]
      )
      return rows.map(mapSwapRow)
    })

    res.json({
      ok: true,
      data,
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    if (error.code === '42P01') {
      return res.json({ ok: true, data: [], error: null, requestId: req.requestId })
    }
    logger.error('Failed to fetch shift swaps', { error: error.message })
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'SHIFT_SWAP_FETCH_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

router.post('/swaps', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const payload = createSwapSchema.parse(req.body)
    const restaurantId = await resolveRestaurantId(req)

    const shiftCheck = await query(
      `SELECT 1 FROM staff_shift WHERE id = $1 AND restaurant_id = $2`,
      [payload.shiftId, restaurantId]
    )
    if (!shiftCheck.rowCount) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'SHIFT_SWAP_CREATE_ERROR',
          message: 'Shift does not belong to this restaurant',
        },
        requestId: req.requestId,
      })
    }

    const requesterCheck = await query(
      `SELECT 1 FROM staff_member WHERE id = $1 AND restaurant_id = $2`,
      [payload.requestedBy, restaurantId]
    )
    if (!requesterCheck.rowCount) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'SHIFT_SWAP_CREATE_ERROR',
          message: 'Requester does not belong to this restaurant',
        },
        requestId: req.requestId,
      })
    }

    if (payload.proposedCoverId) {
      const coverCheck = await query(
        `SELECT 1 FROM staff_member WHERE id = $1 AND restaurant_id = $2`,
        [payload.proposedCoverId, restaurantId]
      )
      if (!coverCheck.rowCount) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'SHIFT_SWAP_CREATE_ERROR',
            message: 'Proposed cover does not belong to this restaurant',
          },
          requestId: req.requestId,
        })
      }
    }

    const { rows } = await query(
      `
          INSERT INTO staff_shift_swap (
            restaurant_id, shift_id, requested_by, proposed_cover_id, reason, status
          )
          VALUES ($1, $2, $3, $4, $5, 'REQUESTED')
          RETURNING *
        `,
      [
        restaurantId,
        payload.shiftId,
        payload.requestedBy,
        payload.proposedCoverId ?? null,
        payload.reason ?? null,
      ]
    )

    const swapRow = rows[0]
    const joined = await query(
      `
          SELECT s.*,
                 sh.role AS shift_role,
                 sh.starts_at AS shift_starts_at,
                 sh.ends_at AS shift_ends_at,
                 sh.shift_date,
                 requester.display_name AS requester_name,
                 cover.display_name AS cover_name,
                 cover.id AS cover_id
          FROM staff_shift_swap s
          JOIN staff_shift sh ON sh.id = s.shift_id
          JOIN staff_member requester ON requester.id = s.requested_by
          LEFT JOIN staff_member cover ON cover.id = s.proposed_cover_id
          WHERE s.id = $1
        `,
      [swapRow.id]
    )

    const mappedSwap = mapSwapRow(joined.rows[0])

    try {
      await notifyStaffSwapRequest(mappedSwap)
    } catch (notifyError) {
      logger.warn('Failed to send shift swap notification', {
        error: notifyError.message,
        swapId: mappedSwap.id,
      })
    }

    res.status(201).json({
      ok: true,
      data: mappedSwap,
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Failed to create shift swap', { error: error.message })
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'SHIFT_SWAP_CREATE_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

router.post(
  '/swaps/:id/decision',
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  async (req, res) => {
    try {
      const payload = decideSwapSchema.parse(req.body)
      const restaurantId = await resolveRestaurantId(req)

      const swapResult = await withTransaction(async (client) => {
        const { rows } = await client.query(
          `
          UPDATE staff_shift_swap
          SET status = $3,
              manager_note = COALESCE($4, manager_note),
              updated_at = now()
          WHERE id = $1 AND restaurant_id = $2
          RETURNING *
        `,
          [
            req.params.id,
            restaurantId,
            payload.status === 'APPROVED' ? 'COMPLETED' : payload.status,
            payload.managerNote ?? null,
          ]
        )

        if (!rows.length) {
          return null
        }

        const swapRow = rows[0]

        if (payload.status === 'APPROVED' && swapRow.proposed_cover_id) {
          await client.query(
            `
              UPDATE staff_shift
              SET staff_id = $3, updated_at = now()
              WHERE id = $1 AND restaurant_id = $2
            `,
            [swapRow.shift_id, restaurantId, swapRow.proposed_cover_id]
          )
        }

        return swapRow
      })

      if (!swapResult) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: 'Shift swap not found' },
          requestId: req.requestId,
        })
      }

      const joined = await query(
        `
          SELECT s.*,
                 sh.role AS shift_role,
                 sh.starts_at AS shift_starts_at,
                 sh.ends_at AS shift_ends_at,
                 sh.shift_date,
                 requester.display_name AS requester_name,
                 cover.display_name AS cover_name,
                 cover.id AS cover_id
          FROM staff_shift_swap s
          JOIN staff_shift sh ON sh.id = s.shift_id
          JOIN staff_member requester ON requester.id = s.requested_by
          LEFT JOIN staff_member cover ON cover.id = s.proposed_cover_id
          WHERE s.id = $1
        `,
        [swapResult.id]
      )

      if (payload.status === 'APPROVED' || payload.status === 'DECLINED') {
        try {
          await notifyStaffSwapDecision(joined.rows[0], payload.status)
        } catch (notifyError) {
          logger.warn('Staff swap decision notification failed', { error: notifyError.message })
        }
      }

      res.json({
        ok: true,
        data: mapSwapRow(joined.rows[0]),
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Failed to decide shift swap', { error: error.message })
      res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'SHIFT_SWAP_UPDATE_ERROR', message: error.message },
        requestId: req.requestId,
      })
    }
  }
)

export default router
