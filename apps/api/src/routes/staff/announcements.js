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

router.get(
  '/announcements',
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  async (req, res) => {
    try {
      const restaurantId = await resolveRestaurantId(req)
      const staffId = req.query.staffId

      const { rows } = await query(
        `
          SELECT a.*,
                 COUNT(ack.id) AS ack_count,
                 BOOL_OR(ack.staff_id = $2) AS acknowledged
          FROM staff_announcement a
          LEFT JOIN staff_announcement_ack ack ON ack.announcement_id = a.id
          WHERE a.restaurant_id = $1
          GROUP BY a.id
          ORDER BY a.published_at DESC
        `,
        [restaurantId, staffId ?? null]
      )

      res.json({
        ok: true,
        data: rows.map(mapAnnouncementRow),
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      if (error.code === '42P01') {
        return res.json({ ok: true, data: [], error: null, requestId: req.requestId })
      }
      logger.error('Failed to fetch announcements', { error: error.message })
      res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'ANNOUNCEMENT_FETCH_ERROR', message: error.message },
        requestId: req.requestId,
      })
    }
  }
)

router.post(
  '/announcements',
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  async (req, res) => {
    try {
      const payload = createAnnouncementSchema.parse(req.body)
      const restaurantId = await resolveRestaurantId(req)

      const { rows } = await query(
        `
          INSERT INTO staff_announcement (
            restaurant_id, title, body, audience, require_ack, published_at, created_by
          )
          VALUES ($1, $2, $3, $4, $5, now(), $6)
          RETURNING *
        `,
        [
          restaurantId,
          payload.title,
          payload.body,
          payload.audience ?? null,
          payload.requireAck ?? false,
          req.userData?.id ?? null,
        ]
      )

      res.status(201).json({
        ok: true,
        data: mapAnnouncementRow({ ...rows[0], ack_count: 0, acknowledged: false }),
        error: null,
        requestId: req.requestId,
      })

      notifyStaffAnnouncement(restaurantId, {
        title: payload.title,
        message: payload.body,
        announcementId: rows[0].id,
      }).catch(() => {})
    } catch (error) {
      logger.error('Failed to create announcement', { error: error.message })
      res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'ANNOUNCEMENT_CREATE_ERROR', message: error.message },
        requestId: req.requestId,
      })
    }
  }
)

router.post(
  '/announcements/:id/ack',
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  async (req, res) => {
    try {
      const payload = acknowledgeAnnouncementSchema.parse(req.body)
      const restaurantId = await resolveRestaurantId(req)

      const announcementCheck = await query(
        `SELECT 1 FROM staff_announcement WHERE id = $1 AND restaurant_id = $2`,
        [req.params.id, restaurantId]
      )
      if (!announcementCheck.rowCount) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: 'Announcement not found' },
          requestId: req.requestId,
        })
      }

      await query(
        `
          INSERT INTO staff_announcement_ack (announcement_id, staff_id)
          VALUES ($1, $2)
          ON CONFLICT (announcement_id, staff_id) DO NOTHING
        `,
        [req.params.id, payload.staffId]
      )

      res.status(204).json({ ok: true, data: null, error: null, requestId: req.requestId })
    } catch (error) {
      logger.error('Failed to acknowledge announcement', { error: error.message })
      res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'ANNOUNCEMENT_ACK_ERROR', message: error.message },
        requestId: req.requestId,
      })
    }
  }
)

export default router
