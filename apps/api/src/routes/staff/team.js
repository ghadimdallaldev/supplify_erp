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

router.get('/members', requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const restaurantId = await resolveRestaurantId(req)
    const data = await cachedStaffList('members', restaurantId, req, async () => {
      const { rows } = await query(
        `
          SELECT *
          FROM staff_member
          WHERE restaurant_id = $1
          ORDER BY display_name NULLS LAST, first_name, last_name
        `,
        [restaurantId]
      )
      return rows.map(mapStaffRow)
    })

    res.json({
      ok: true,
      data,
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
})

router.post('/members', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
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
      ]
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
})

router.get('/members/:id', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const restaurantId = await resolveRestaurantId(req)
    const { rows } = await query(
      `
          SELECT *
          FROM staff_member
          WHERE id = $1 AND restaurant_id = $2
        `,
      [req.params.id, restaurantId]
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
})

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
        [restaurantId, req.params.id, ...values]
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
  }
)

export default router
