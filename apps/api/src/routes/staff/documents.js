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

router.get('/documents', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const restaurantId = await resolveRestaurantId(req)
    const { rows } = await query(
      `
          SELECT d.*, m.display_name AS staff_name
          FROM staff_document d
          JOIN staff_member m ON m.id = d.staff_id
          WHERE d.restaurant_id = $1
          ORDER BY d.uploaded_at DESC
          LIMIT 100
        `,
      [restaurantId]
    )

    res.json({
      ok: true,
      data: rows.map(mapDocumentRow),
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    if (error.code === '42P01') {
      return res.json({ ok: true, data: [], error: null, requestId: req.requestId })
    }
    logger.error('Failed to fetch staff documents', { error: error.message })
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'DOCUMENT_FETCH_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

router.post('/documents', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const payload = createDocumentSchema.parse(req.body)
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
          name: 'DOCUMENT_CREATE_ERROR',
          message: 'Staff member does not belong to this restaurant',
        },
        requestId: req.requestId,
      })
    }

    try {
      assertPresignedFileUrl(payload.fileUrl, req.userData.id)
    } catch (err) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: err?.message || 'Invalid file URL',
        },
        requestId: req.requestId,
      })
    }

    const fileSizeBytes = payload.fileSize != null ? Math.max(0, Number(payload.fileSize) || 0) : 0
    if (fileSizeBytes > 0 && req.userData.role !== 'ADMIN') {
      const { ensureStorageForUpload } = await import('../../lib/subscription.js')
      const metered = await ensureStorageForUpload(restaurantId, 'RESTAURANT', fileSizeBytes)
      if (!metered.allowed) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: {
            name: 'LIMIT_EXCEEDED',
            message: `Storage limit reached (${metered.current}/${metered.limit} MB). Upgrade for more storage.`,
            details: {
              limitKey: 'storage_mb',
              limitValue: metered.limit ?? 0,
              currentUsage: metered.current ?? 0,
            },
          },
          requestId: req.requestId,
        })
      }
    }

    const { rows } = await query(
      `
          INSERT INTO staff_document (
            restaurant_id, staff_id, doc_type, title, file_url, file_size, uploaded_by, expires_at, status, metadata
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, 'ACTIVE'), $10)
          RETURNING *
        `,
      [
        restaurantId,
        payload.staffId,
        payload.docType,
        payload.title ?? null,
        payload.fileUrl,
        payload.fileSize ?? null,
        req.userData?.id ?? null,
        payload.expiresAt ?? null,
        payload.status ?? null,
        payload.metadata ?? null,
      ]
    )

    const docRow = rows[0]
    const staffInfo = await query(
      `SELECT display_name AS staff_name FROM staff_member WHERE id = $1`,
      [docRow.staff_id]
    )
    if (staffInfo.rowCount) {
      docRow.staff_name = staffInfo.rows[0].staff_name
    }

    res.status(201).json({
      ok: true,
      data: mapDocumentRow(docRow),
      error: null,
      requestId: req.requestId,
    })

    notifyStaffDocumentUploaded(restaurantId, {
      title: payload.title || 'New document',
      message: `A new document "${payload.title || payload.docType}" was uploaded for ${docRow.staff_name || 'a team member'}.`,
      documentId: docRow.id,
    }).catch(() => {})
  } catch (error) {
    logger.error('Failed to create staff document', { error: error.message })
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'DOCUMENT_CREATE_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

export default router
