import express from 'express'
import { z, ZodError } from 'zod'
import {
  requireAuth,
  requireRole,
  resolveTenantContext,
  requirePermission,
  getRestaurantIdForRequest,
} from '../lib/rbac.js'
import { requireStaffPortalAuth, requirePlatformAppAccess } from '../lib/staff-portal-auth.js'
import { staffMutationGuard } from '../lib/route-permissions.js'
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { getRestaurantIdByEmail } from '../lib/tenant.js'
import { assertPresignedFileUrl } from '../lib/sanitize-upload.js'
import {
  notifyStaffPtoRequest,
  notifyStaffSwapRequest,
  notifyStaffAnnouncement,
  notifyStaffDocumentUploaded,
  notifyStaffShiftEvent,
} from '../services/notification.service.js'
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
} from '../services/staff-portal-self.service.js'
import {
  createStaffPortalAccount,
  sendStaffPortalInviteEmail,
  disableStaffPortalAccess,
  resetStaffPortalAccess,
  getStaffPortalAccessRow,
  mapPortalAccessInfo,
} from '../services/staff-portal-account.service.js'

const router = express.Router()

const staffStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED'])

const staffWageTypeEnum = z.enum(['HOURLY', 'SALARY', 'CONTRACT', 'OTHER'])

const createStaffSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  displayName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  role: z.string().min(1),
  wageType: staffWageTypeEnum.default('HOURLY'),
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

const updateShiftSchema = createShiftSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
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
  status: z.enum(['OPEN', 'APPROVED', 'LOCKED', 'ADJUSTMENT_REQUIRED']).optional(),
})

const ptoTypeEnum = z.enum(['VACATION', 'SICK', 'PERSONAL', 'UNPAID', 'OTHER'])
const ptoStatusEnum = z.enum(['PENDING', 'APPROVED', 'DECLINED', 'CANCELLED'])

const createPtoSchema = z.object({
  staffId: z.string().uuid(),
  type: ptoTypeEnum,
  startDate: z.string(),
  endDate: z.string(),
  hoursRequested: z.number().nonnegative().optional(),
  reason: z.string().optional(),
})

const updatePtoSchema = z.object({
  status: ptoStatusEnum,
  managerNote: z.string().optional(),
})

const availabilitySchema = z.object({
  staffId: z.string().uuid(),
  weekday: z.number().int().min(0).max(6),
  availability: z
    .object({
      blocks: z
        .array(
          z.object({
            start: z.string().regex(/^\d{2}:\d{2}$/),
            end: z.string().regex(/^\d{2}:\d{2}$/),
          })
        )
        .max(6),
    })
    .default({ blocks: [] }),
  notes: z.string().optional(),
})

const swapStatusEnum = z.enum(['REQUESTED', 'APPROVED', 'DECLINED', 'CANCELLED', 'COMPLETED'])

const createSwapSchema = z.object({
  shiftId: z.string().uuid(),
  requestedBy: z.string().uuid(),
  proposedCoverId: z.string().uuid().optional(),
  reason: z.string().optional(),
})

const decideSwapSchema = z.object({
  status: swapStatusEnum,
  managerNote: z.string().optional(),
})

const createAnnouncementSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  requireAck: z.boolean().optional(),
  audience: z
    .object({
      roles: z.array(z.string()).optional(),
      staffIds: z.array(z.string().uuid()).optional(),
    })
    .optional(),
})

const acknowledgeAnnouncementSchema = z.object({
  staffId: z.string().uuid(),
})

const createDocumentSchema = z.object({
  staffId: z.string().uuid(),
  docType: z.string().min(1),
  title: z.string().optional(),
  fileUrl: z.string().url(),
  fileSize: z.number().int().positive().optional(),
  expiresAt: z.string().optional(),
  status: z.enum(['ACTIVE', 'EXPIRED', 'RENEWAL_REQUIRED']).optional(),
  metadata: z.record(z.any()).optional(),
})

const createIncidentSchema = z.object({
  staffId: z.string().uuid().optional(),
  category: z.string().min(1),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  occurredAt: z.string(),
  notes: z.string().optional(),
  followUpAction: z.string().optional(),
  attachments: z.record(z.any()).optional(),
})

const createPerformanceNoteSchema = z.object({
  staffId: z.string().uuid(),
  noteType: z.enum(['COACHING', 'KUDOS', 'GENERAL']).optional(),
  body: z.string().min(1),
})

const createPayrollExportSchema = z.object({
  periodStart: z.string(),
  periodEnd: z.string(),
  totals: z.record(z.any()).optional(),
  exportUrl: z.string().url().optional(),
})

async function resolveRestaurantId(req) {
  const fromTenant = await getRestaurantIdForRequest(req)
  if (fromTenant) return fromTenant

  const role = req.userData?.role

  if (role === 'ADMIN') {
    if (req.query.restaurantId && typeof req.query.restaurantId === 'string') {
      return req.query.restaurantId
    }
    const { rows } = await query(
      `
        SELECT id
        FROM restaurant
        ORDER BY created_at
        LIMIT 1
      `
    )
    if (rows.length) {
      return rows[0].id
    }
    throw new Error('No restaurants available for admin context')
  }

  const email = req.userData?.email
  if (!email) {
    const { rows } = await query(
      `
        SELECT id
        FROM restaurant
        ORDER BY created_at
        LIMIT 1
      `
    )
    if (rows.length) {
      return rows[0].id
    }
    throw new Error('Unable to resolve restaurant context')
  }

  try {
    return await getRestaurantIdByEmail(email)
  } catch (error) {
    const { rows } = await query(
      `
        SELECT id
        FROM restaurant
        ORDER BY created_at
        LIMIT 1
      `
    )
    if (rows.length) {
      return rows[0].id
    }
    throw error
  }
}

function mapStaffRow(row) {
  const hasAccount = Boolean(row.user_id)
  let portalStatus = 'none'
  if (hasAccount) {
    portalStatus = row.portal_access_enabled ? 'active' : 'disabled'
  } else if (row.portal_invited_at) {
    portalStatus = 'invited'
  }
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
    portalAccess: {
      hasAccount,
      enabled: Boolean(row.portal_access_enabled),
      status: portalStatus,
      invitedAt: row.portal_invited_at,
      lastLoginAt: row.portal_last_login_at,
      disabledAt: row.portal_access_disabled_at,
    },
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
    clockInAt: row.clock_in_at,
    clockOutAt: row.clock_out_at,
    clockInMethod: row.clock_in_method,
    clockOutMethod: row.clock_out_method,
    breakMinutes: row.break_minutes != null ? Number(row.break_minutes) : null,
    note: row.note,
    status: row.status,
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

function mapPtoRow(row) {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    staffId: row.staff_id,
    type: row.type,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    hoursRequested: row.hours_requested ? Number(row.hours_requested) : null,
    reason: row.reason,
    managerNote: row.manager_note,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    staff: row.staff_id
      ? {
          id: row.staff_id,
          name: row.staff_name,
          role: row.staff_role,
        }
      : null,
  }
}

function mapSwapRow(row) {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    shiftId: row.shift_id,
    requestedBy: row.requested_by,
    proposedCoverId: row.proposed_cover_id,
    status: row.status,
    reason: row.reason,
    managerNote: row.manager_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    shift: row.shift_id
      ? {
          id: row.shift_id,
          role: row.shift_role,
          startsAt: row.shift_starts_at,
          endsAt: row.shift_ends_at,
          date: row.shift_date,
        }
      : null,
    requester: row.requested_by
      ? {
          id: row.requested_by,
          name: row.requester_name,
        }
      : null,
    cover: row.cover_id
      ? {
          id: row.cover_id,
          name: row.cover_name,
        }
      : null,
  }
}

function mapAnnouncementRow(row) {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    title: row.title,
    body: row.body,
    audience: row.audience,
    requireAck: row.require_ack,
    publishedAt: row.published_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    acknowledgmentCount: Number(row.ack_count || 0),
    acknowledged: Boolean(row.acknowledged),
  }
}

function mapDocumentRow(row) {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    staffId: row.staff_id,
    docType: row.doc_type,
    title: row.title,
    fileUrl: row.file_url,
    fileSize: row.file_size ? Number(row.file_size) : null,
    uploadedAt: row.uploaded_at,
    expiresAt: row.expires_at,
    status: row.status,
    metadata: row.metadata,
    staff: row.staff_id
      ? {
          id: row.staff_id,
          name: row.staff_name,
        }
      : null,
  }
}

function mapIncidentRow(row) {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    staffId: row.staff_id,
    category: row.category,
    severity: row.severity,
    occurredAt: row.occurred_at,
    notes: row.notes,
    followUpAction: row.follow_up_action,
    attachments: row.attachments,
    staff: row.staff_id
      ? {
          id: row.staff_id,
          name: row.staff_name,
        }
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapPerformanceNoteRow(row) {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    staffId: row.staff_id,
    noteType: row.note_type,
    body: row.body,
    createdBy: row.created_by,
    staff: row.staff_id
      ? {
          id: row.staff_id,
          name: row.staff_name,
        }
      : null,
    createdAt: row.created_at,
  }
}

function mapPayrollExportRow(row) {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    status: row.status,
    totals: row.totals,
    exportUrl: row.export_url,
    exportedAt: row.exported_at,
    exportedBy: row.exported_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

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
    const row = await getStaffPortalAccessRow(req.params.id, restaurantId)
    if (!row) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'STAFF_NOT_FOUND', message: 'Staff member not found' },
        requestId: req.requestId,
      })
    }
    const info = mapPortalAccessInfo(row)
    res.json({ ok: true, data: info, error: null, requestId: req.requestId })
  } catch (error) {
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'PORTAL_LINK_ERROR', message: error.message },
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

router.use(
  requireAuth,
  requirePlatformAppAccess,
  resolveTenantContext,
  requirePermission('STAFF_VIEW'),
  staffMutationGuard
)

router.get('/members', requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const restaurantId = await resolveRestaurantId(req)
    const { rows } = await query(
      `
          SELECT *
          FROM staff_member
          WHERE restaurant_id = $1
          ORDER BY display_name NULLS LAST, first_name, last_name
        `,
      [restaurantId]
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

router.get('/pto', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const restaurantId = await resolveRestaurantId(req)
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

    res.json({
      ok: true,
      data: rows.map(mapPtoRow),
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
      `SELECT 1 FROM staff_member WHERE id = $1 AND restaurant_id = $2`,
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

    res.json({
      ok: true,
      data: rows.map(mapSwapRow),
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

      const { rows } = await query(
        `
          UPDATE staff_shift_swap
          SET status = $3,
              manager_note = COALESCE($4, manager_note),
              updated_at = now()
          WHERE id = $1 AND restaurant_id = $2
          RETURNING *
        `,
        [req.params.id, restaurantId, payload.status, payload.managerNote ?? null]
      )

      if (!rows.length) {
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
        [rows[0].id]
      )

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
      const { ensureStorageForUpload } = await import('../lib/subscription.js')
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

router.get('/payroll', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const restaurantId = await resolveRestaurantId(req)
    const { rows } = await query(
      `
          SELECT *
          FROM staff_payroll_export
          WHERE restaurant_id = $1
          ORDER BY period_end DESC
        `,
      [restaurantId]
    )

    res.json({
      ok: true,
      data: rows.map(mapPayrollExportRow),
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

router.post('/payroll', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const payload = createPayrollExportSchema.parse(req.body)
    const restaurantId = await resolveRestaurantId(req)

    const { rows } = await query(
      `
          INSERT INTO staff_payroll_export (
            restaurant_id, period_start, period_end, status, totals, export_url, exported_at, exported_by
          )
          VALUES ($1, $2, $3, 'APPROVED', $4, $5, CASE WHEN $5 IS NOT NULL THEN now() ELSE NULL END, $6)
          RETURNING *
        `,
      [
        restaurantId,
        payload.periodStart,
        payload.periodEnd,
        payload.totals ?? null,
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

export { router as staffRoutes }
