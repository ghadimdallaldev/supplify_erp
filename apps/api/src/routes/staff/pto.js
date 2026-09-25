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
  getPtoDateError,
  getInactiveStaffError,
  findShiftDuringTimeOffError,
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

router.get('/pto', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const restaurantId = await resolveRestaurantId(req)
    const data = await cachedStaffList('pto', restaurantId, req, async () => {
      const { rows } = await query(
        `
          SELECT p.*, m.display_name AS staff_name, m.role AS staff_role
          FROM staff_pto_request p
          JOIN staff_member m ON m.id = p.staff_id
          WHERE p.restaurant_id = $1
          ORDER BY p.created_at DESC
        `,
        [restaurantId]
      )
      return rows.map(mapPtoRow)
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
    logger.error('Failed to fetch PTO requests', { error: error.message })
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'PTO_FETCH_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

router.post('/pto', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const payload = createPtoSchema.parse(req.body)
    const restaurantId = await resolveRestaurantId(req)

    const ownershipCheck = await query(
      `SELECT status FROM staff_member WHERE id = $1 AND restaurant_id = $2`,
      [payload.staffId, restaurantId]
    )
    if (!ownershipCheck.rowCount) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'PTO_CREATE_ERROR',
          message: 'Staff member does not belong to this restaurant',
        },
        requestId: req.requestId,
      })
    }
    const inactiveError = getInactiveStaffError(ownershipCheck.rows[0].status)
    if (inactiveError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'PTO_CREATE_ERROR', message: inactiveError },
        requestId: req.requestId,
      })
    }

    const dateError = getPtoDateError(payload.startDate, payload.endDate)
    if (dateError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'PTO_CREATE_ERROR', message: dateError },
        requestId: req.requestId,
      })
    }

    const { rows: overlapRows } = await query(
      `
        SELECT id FROM staff_pto_request
        WHERE restaurant_id = $1
          AND staff_id = $2
          AND status IN ('PENDING', 'APPROVED')
          AND start_date <= $4::date
          AND end_date >= $3::date
        LIMIT 1
      `,
      [restaurantId, payload.staffId, payload.startDate, payload.endDate]
    )
    if (overlapRows.length) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'PTO_CREATE_ERROR',
          message: 'This person already has time off that overlaps these dates',
        },
        requestId: req.requestId,
      })
    }

    const { rows } = await query(
      `
          INSERT INTO staff_pto_request (
            restaurant_id, staff_id, type, status,
            start_date, end_date, hours_requested, reason, created_by, updated_by
          )
          VALUES ($1, $2, $3, 'PENDING', $4, $5, $6, $7, $8, $8)
          RETURNING *
        `,
      [
        restaurantId,
        payload.staffId,
        payload.type,
        payload.startDate,
        payload.endDate,
        payload.hoursRequested ?? null,
        payload.reason ?? null,
        req.userData?.id ?? null,
      ]
    )

    const row = rows[0]
    const staffInfo = await query(
      `SELECT display_name AS staff_name, role AS staff_role FROM staff_member WHERE id = $1`,
      [row.staff_id]
    )
    if (staffInfo.rowCount) {
      row.staff_name = staffInfo.rows[0].staff_name
      row.staff_role = staffInfo.rows[0].staff_role
    }

    try {
      await notifyStaffPtoRequest(mapPtoRow(row))
    } catch (notifyError) {
      logger.warn('Failed to send PTO notification', { error: notifyError.message, ptoId: row.id })
    }

    res.status(201).json({
      ok: true,
      data: mapPtoRow(row),
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Failed to create PTO request', { error: error.message })
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'PTO_CREATE_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

router.patch('/pto/:id', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const payload = updatePtoSchema.parse(req.body)
    const restaurantId = await resolveRestaurantId(req)

    if (payload.status === 'APPROVED') {
      const { rows: currentRows } = await query(
        `
          SELECT staff_id, start_date, end_date
          FROM staff_pto_request
          WHERE id = $1 AND restaurant_id = $2
        `,
        [req.params.id, restaurantId]
      )
      if (!currentRows.length) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: 'PTO request not found' },
          requestId: req.requestId,
        })
      }
      const conflict = await findShiftDuringTimeOffError(
        restaurantId,
        currentRows[0].staff_id,
        currentRows[0].start_date,
        currentRows[0].end_date
      )
      if (conflict) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: { name: 'PTO_UPDATE_ERROR', message: conflict },
          requestId: req.requestId,
        })
      }
    }

    const { rows } = await query(
      `
          UPDATE staff_pto_request
          SET status = $3,
              manager_note = COALESCE($4, manager_note),
              updated_at = now(),
              updated_by = $5
          WHERE id = $1 AND restaurant_id = $2
          RETURNING *
        `,
      [
        req.params.id,
        restaurantId,
        payload.status,
        payload.managerNote ?? null,
        req.userData?.id ?? null,
      ]
    )

    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'PTO request not found' },
        requestId: req.requestId,
      })
    }

    const row = rows[0]
    const staffInfo = await query(
      `SELECT display_name AS staff_name, role AS staff_role FROM staff_member WHERE id = $1`,
      [row.staff_id]
    )
    if (staffInfo.rowCount) {
      row.staff_name = staffInfo.rows[0].staff_name
      row.staff_role = staffInfo.rows[0].staff_role
    }

    if (payload.status === 'APPROVED' || payload.status === 'DECLINED') {
      try {
        await notifyStaffPtoDecision(row)
      } catch (notifyError) {
        logger.warn('Staff PTO decision notification failed', { error: notifyError.message })
      }
    }

    res.json({
      ok: true,
      data: mapPtoRow(row),
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Failed to update PTO request', { error: error.message })
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'PTO_UPDATE_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

export default router
