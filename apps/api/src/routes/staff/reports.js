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

router.get('/incidents', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const restaurantId = await resolveRestaurantId(req)
    const { rows } = await query(
      `
          SELECT i.*, m.display_name AS staff_name
          FROM staff_incident i
          LEFT JOIN staff_member m ON m.id = i.staff_id
          WHERE i.restaurant_id = $1
          ORDER BY i.occurred_at DESC
        `,
      [restaurantId]
    )

    res.json({
      ok: true,
      data: rows.map(mapIncidentRow),
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    if (error.code === '42P01') {
      return res.json({ ok: true, data: [], error: null, requestId: req.requestId })
    }
    logger.error('Failed to fetch incidents', { error: error.message })
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'INCIDENT_FETCH_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

router.post('/incidents', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const payload = createIncidentSchema.parse(req.body)
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
            name: 'INCIDENT_CREATE_ERROR',
            message: 'Staff member does not belong to this restaurant',
          },
          requestId: req.requestId,
        })
      }
    }

    const { rows } = await query(
      `
          INSERT INTO staff_incident (
            restaurant_id, staff_id, category, severity, occurred_at,
            notes, follow_up_action, attachments, reported_by
          )
          VALUES ($1, $2, $3, COALESCE($4, 'LOW'), $5, $6, $7, $8, $9)
          RETURNING *
        `,
      [
        restaurantId,
        payload.staffId ?? null,
        payload.category,
        payload.severity ?? null,
        payload.occurredAt,
        payload.notes ?? null,
        payload.followUpAction ?? null,
        payload.attachments ?? null,
        req.userData?.id ?? null,
      ]
    )

    const incidentRow = rows[0]
    if (incidentRow.staff_id) {
      const staffInfo = await query(
        `SELECT display_name AS staff_name FROM staff_member WHERE id = $1`,
        [incidentRow.staff_id]
      )
      if (staffInfo.rowCount) {
        incidentRow.staff_name = staffInfo.rows[0].staff_name
      }
    }

    res.status(201).json({
      ok: true,
      data: mapIncidentRow(incidentRow),
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Failed to create incident', { error: error.message })
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'INCIDENT_CREATE_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

router.get(
  '/performance-notes',
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  async (req, res) => {
    try {
      const restaurantId = await resolveRestaurantId(req)
      const { rows } = await query(
        `
          SELECT pn.*, m.display_name AS staff_name
          FROM staff_performance_note pn
          JOIN staff_member m ON m.id = pn.staff_id
          WHERE pn.restaurant_id = $1
          ORDER BY pn.created_at DESC
        `,
        [restaurantId]
      )

      res.json({
        ok: true,
        data: rows.map(mapPerformanceNoteRow),
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      if (error.code === '42P01') {
        return res.json({ ok: true, data: [], error: null, requestId: req.requestId })
      }
      logger.error('Failed to fetch performance notes', { error: error.message })
      res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'PERFORMANCE_NOTE_FETCH_ERROR', message: error.message },
        requestId: req.requestId,
      })
    }
  }
)

router.post(
  '/performance-notes',
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  async (req, res) => {
    try {
      const payload = createPerformanceNoteSchema.parse(req.body)
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
            name: 'PERFORMANCE_NOTE_CREATE_ERROR',
            message: 'Staff member does not belong to this restaurant',
          },
          requestId: req.requestId,
        })
      }

      const { rows } = await query(
        `
          INSERT INTO staff_performance_note (restaurant_id, staff_id, note_type, body, created_by)
          VALUES ($1, $2, COALESCE($3, 'GENERAL'), $4, $5)
          RETURNING *
        `,
        [
          restaurantId,
          payload.staffId,
          payload.noteType ?? null,
          payload.body,
          req.userData?.id ?? null,
        ]
      )

      const noteRow = rows[0]
      const staffInfo = await query(
        `SELECT display_name AS staff_name FROM staff_member WHERE id = $1`,
        [noteRow.staff_id]
      )
      if (staffInfo.rowCount) {
        noteRow.staff_name = staffInfo.rows[0].staff_name
      }

      res.status(201).json({
        ok: true,
        data: mapPerformanceNoteRow(noteRow),
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Failed to create performance note', { error: error.message })
      res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'PERFORMANCE_NOTE_CREATE_ERROR', message: error.message },
        requestId: req.requestId,
      })
    }
  }
)

router.get(
  '/labour-summary',
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  async (req, res) => {
    try {
      const restaurantId = await resolveRestaurantId(req)
      const date =
        typeof req.query.date === 'string' && req.query.date
          ? req.query.date
          : new Date().toISOString().slice(0, 10)
      const data = await fetchLabourSummary(restaurantId, date)
      res.json({
        ok: true,
        data,
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Failed to fetch labour summary', { error: error.message })
      res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'LABOUR_SUMMARY_ERROR', message: error.message },
        requestId: req.requestId,
      })
    }
  }
)

router.get('/payroll', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const restaurantId = await resolveRestaurantId(req)
    const data = await cachedStaffList('payroll', restaurantId, req, async () => {
      const { rows } = await query(
        `
          SELECT *
          FROM staff_payroll_export
          WHERE restaurant_id = $1
          ORDER BY period_end DESC
        `,
        [restaurantId]
      )
      return rows.map(mapPayrollExportRow)
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
    logger.error('Failed to fetch payroll exports', { error: error.message })
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'PAYROLL_FETCH_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

router.get(
  '/payroll/preview',
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  async (req, res) => {
    try {
      const restaurantId = await resolveRestaurantId(req)
      const periodStart = req.query.periodStart
      const periodEnd = req.query.periodEnd
      if (!periodStart || !periodEnd) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'PAYROLL_PREVIEW_ERROR',
            message: 'periodStart and periodEnd are required',
          },
          requestId: req.requestId,
        })
      }
      const data = await computePayrollPreview(restaurantId, periodStart, periodEnd)
      res.json({
        ok: true,
        data,
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Failed to compute payroll preview', { error: error.message })
      res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'PAYROLL_PREVIEW_ERROR', message: error.message },
        requestId: req.requestId,
      })
    }
  }
)

router.post('/payroll', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const payload = createPayrollExportSchema.parse(req.body)
    const restaurantId = await resolveRestaurantId(req)

    let totals = payload.totals ?? null
    if (payload.usePreview) {
      const preview = await computePayrollPreview(
        restaurantId,
        payload.periodStart,
        payload.periodEnd
      )
      totals = previewToPayrollTotals(preview)
    }

    const { rows } = await query(
      `
          INSERT INTO staff_payroll_export (
            restaurant_id, period_start, period_end, status, totals, export_url, exported_at, exported_by
          )
          VALUES ($1, $2, $3, 'DRAFT', $4, $5, CASE WHEN $5 IS NOT NULL THEN now() ELSE NULL END, $6)
          RETURNING *
        `,
      [
        restaurantId,
        payload.periodStart,
        payload.periodEnd,
        totals,
        payload.exportUrl ?? null,
        req.userData?.id ?? null,
      ]
    )

    res.status(201).json({
      ok: true,
      data: mapPayrollExportRow(rows[0]),
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Failed to create payroll export', { error: error.message })
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'PAYROLL_CREATE_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

router.patch(
  '/payroll/:id',
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  async (req, res) => {
    try {
      const payload = updatePayrollExportSchema.parse(req.body)
      const restaurantId = await resolveRestaurantId(req)

      const { rows } = await query(
        `
        UPDATE staff_payroll_export
        SET status = $3,
            exported_at = CASE WHEN $3 = 'EXPORTED' AND exported_at IS NULL THEN now() ELSE exported_at END,
            updated_at = now()
        WHERE id = $1 AND restaurant_id = $2
        RETURNING *
      `,
        [req.params.id, restaurantId, payload.status]
      )

      if (!rows.length) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: 'Payroll export not found' },
          requestId: req.requestId,
        })
      }

      res.json({
        ok: true,
        data: mapPayrollExportRow(rows[0]),
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Failed to update payroll export', { error: error.message })
      res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'PAYROLL_UPDATE_ERROR', message: error.message },
        requestId: req.requestId,
      })
    }
  }
)

export default router
