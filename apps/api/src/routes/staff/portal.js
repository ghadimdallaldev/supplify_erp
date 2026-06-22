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
  resolveStaffPortalCopyLink,
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

const selfRouter = express.Router()
selfRouter.use(requireAuth, requireStaffPortalAuth)

selfRouter.get('/dashboard', async (req, res) => {
  try {
    const { staffId, restaurantId } = req.staffPortal
    const dashboard = await fetchStaffPortalDashboard(staffId, restaurantId)
    res.json({
      ok: true,
      data: dashboard,
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Staff self dashboard failed', { error: error.message })
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'STAFF_SELF_DASHBOARD_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

selfRouter.get('/time-entries', async (req, res) => {
  try {
    const { staffId, restaurantId } = req.staffPortal
    const data = await fetchStaffPortalTimeEntries(staffId, restaurantId)
    res.json({ ok: true, data, error: null, requestId: req.requestId })
  } catch (error) {
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'STAFF_SELF_TIME_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

selfRouter.post('/check-in', async (req, res) => {
  try {
    const { staffId, restaurantId } = req.staffPortal
    const note = z.object({ note: z.string().optional() }).parse(req.body).note
    const data = await staffPortalCheckIn(staffId, restaurantId, note)
    res.status(201).json({ ok: true, data, error: null, requestId: req.requestId })
  } catch (error) {
    const status = error.status || 400
    res.status(status).json({
      ok: false,
      data: null,
      error: { name: error.name || 'CHECK_IN_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

selfRouter.post('/time-entries/:id/check-out', async (req, res) => {
  try {
    const { staffId, restaurantId } = req.staffPortal
    const data = await staffPortalCheckOut(staffId, restaurantId, req.params.id)
    res.json({ ok: true, data, error: null, requestId: req.requestId })
  } catch (error) {
    const status = error.status || 400
    res.status(status).json({
      ok: false,
      data: null,
      error: { name: error.name || 'CHECK_OUT_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

selfRouter.post('/pto', async (req, res) => {
  try {
    const { staffId, restaurantId } = req.staffPortal
    const payload = z
      .object({
        type: ptoTypeEnum,
        startDate: z.string(),
        endDate: z.string(),
        hoursRequested: z.number().nonnegative().optional(),
        reason: z.string().optional(),
      })
      .parse(req.body)
    const data = await submitStaffPortalPto(staffId, restaurantId, payload)
    res.status(201).json({ ok: true, data, error: null, requestId: req.requestId })
  } catch (error) {
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'STAFF_SELF_PTO_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

selfRouter.post('/swaps', async (req, res) => {
  try {
    const { staffId, restaurantId } = req.staffPortal
    const payload = z
      .object({
        shiftId: z.string().uuid(),
        proposedCoverId: z.string().uuid().optional(),
        reason: z.string().optional(),
      })
      .parse(req.body)
    const data = await submitStaffPortalSwap(staffId, restaurantId, payload)
    res.status(201).json({ ok: true, data, error: null, requestId: req.requestId })
  } catch (error) {
    const status = error.status || 400
    res.status(status).json({
      ok: false,
      data: null,
      error: { name: error.name || 'STAFF_SELF_SWAP_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

selfRouter.post('/announcements/:id/ack', async (req, res) => {
  try {
    const { staffId, restaurantId } = req.staffPortal
    const data = await acknowledgeStaffAnnouncement(staffId, restaurantId, req.params.id)
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

selfRouter.get('/availability', async (req, res) => {
  try {
    const { staffId, restaurantId } = req.staffPortal
    const data = await getStaffAvailability(staffId, restaurantId)
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

selfRouter.post('/availability', async (req, res) => {
  try {
    const { staffId, restaurantId } = req.staffPortal
    const payload = availabilitySchema.omit({ staffId: true }).parse({
      ...req.body,
      staffId,
    })
    const data = await setStaffAvailability(staffId, restaurantId, payload)
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

router.use('/self', selfRouter)

const portalAdminRouter = express.Router({ mergeParams: true })
portalAdminRouter.use(
  requireAuth,
  requirePlatformAppAccess,
  resolveTenantContext,
  requirePermission('STAFF_EDIT'),
  staffMutationGuard,
  requireRole(['RESTAURANT', 'ADMIN'])
)

portalAdminRouter.get('/', async (req, res) => {
  try {
    const restaurantId = await resolveRestaurantId(req)
    const row = await getStaffPortalAccessRow(req.params.id, restaurantId)
    if (!row) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'STAFF_NOT_FOUND', message: 'Staff member not found' },
        requestId: req.requestId,
      })
    }
    res.json({
      ok: true,
      data: mapPortalAccessInfo(row),
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'PORTAL_ACCESS_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

portalAdminRouter.post('/create-account', async (req, res) => {
  try {
    const restaurantId = await resolveRestaurantId(req)
    const data = await createStaffPortalAccount(req.params.id, restaurantId, {
      invitedByUserId: req.userData?.id,
    })
    res.status(201).json({ ok: true, data, error: null, requestId: req.requestId })
  } catch (error) {
    const status = error.status || 400
    res.status(status).json({
      ok: false,
      data: null,
      error: { name: error.name || 'PORTAL_CREATE_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

portalAdminRouter.post('/send-invite', async (req, res) => {
  try {
    const restaurantId = await resolveRestaurantId(req)
    const data = await sendStaffPortalInviteEmail(req.params.id, restaurantId)
    res.json({ ok: true, data, error: null, requestId: req.requestId })
  } catch (error) {
    const status = error.status || 400
    res.status(status).json({
      ok: false,
      data: null,
      error: { name: error.name || 'PORTAL_INVITE_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

portalAdminRouter.get('/login-link', async (req, res) => {
  try {
    const restaurantId = await resolveRestaurantId(req)
    const data = await resolveStaffPortalCopyLink(req.params.id, restaurantId)
    res.json({ ok: true, data, error: null, requestId: req.requestId })
  } catch (error) {
    const status = error.status || 400
    res.status(status).json({
      ok: false,
      data: null,
      error: { name: error.name || 'PORTAL_LINK_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

portalAdminRouter.post('/reset-access', async (req, res) => {
  try {
    const restaurantId = await resolveRestaurantId(req)
    const data = await resetStaffPortalAccess(req.params.id, restaurantId)
    res.json({ ok: true, data, error: null, requestId: req.requestId })
  } catch (error) {
    const status = error.status || 400
    res.status(status).json({
      ok: false,
      data: null,
      error: { name: error.name || 'PORTAL_RESET_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

portalAdminRouter.post('/disable', async (req, res) => {
  try {
    const restaurantId = await resolveRestaurantId(req)
    const data = await disableStaffPortalAccess(req.params.id, restaurantId)
    res.json({ ok: true, data, error: null, requestId: req.requestId })
  } catch (error) {
    const status = error.status || 400
    res.status(status).json({
      ok: false,
      data: null,
      error: { name: error.name || 'PORTAL_DISABLE_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

router.use('/members/:id/portal', portalAdminRouter)

export default router
