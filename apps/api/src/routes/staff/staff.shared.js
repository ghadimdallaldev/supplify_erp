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
import { getZonedParts } from '../../lib/delivery-rollover-time.js'
import { getZonedDayBounds } from '../../lib/reservation-board-date.js'
import { getRestaurantTimezone } from '../../lib/tenant-timezone.js'
import { logger } from '../../lib/logger.js'
import { ValidationError } from '../../middlewares/errorHandler.js'
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

/**
 * @param {string | Date} clockInAt
 * @param {string | Date} clockOutAt
 * @param {number | null | undefined} breakMinutes
 * @param {Date} [now]
 * @returns {string | null}
 */
function getTimeEntryCloseError(clockInAt, clockOutAt, breakMinutes, now = new Date()) {
  const start = new Date(clockInAt)
  const end = new Date(clockOutAt)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 'Clock-in and clock-out must be valid times'
  }
  if (end.getTime() <= start.getTime()) {
    return 'Clock-out must be after clock-in'
  }
  if (end.getTime() > now.getTime() + 2 * 60 * 1000) {
    return 'Clock-out cannot be in the future'
  }
  if (breakMinutes != null && Number(breakMinutes) > (end.getTime() - start.getTime()) / 60000) {
    return 'Break cannot be longer than the shift'
  }
  return null
}

/** @param {string | Date} startsAt @param {string | Date} endsAt @returns {string | null} */
/** @param {string} startDate @param {string} endDate @returns {string | null} */
function getInactiveStaffError(status) {
  if (status === 'ACTIVE') return null
  return 'This person is no longer on the active team'
}

function timeOffOverlapsShift(ptoStart, ptoEnd, shiftStart, shiftEnd) {
  const a0 = String(ptoStart).slice(0, 10)
  const a1 = String(ptoEnd).slice(0, 10)
  const b0 = String(shiftStart).slice(0, 10)
  const b1 = String(shiftEnd).slice(0, 10)
  return a0 <= b1 && a1 >= b0
}

function shiftLocalDates(startsAt, endsAt, timeZone) {
  const start = getZonedParts(new Date(startsAt), timeZone).calendarDate
  const end = getZonedParts(new Date(new Date(endsAt).getTime() - 1), timeZone).calendarDate
  return { start, end: end < start ? start : end }
}

async function findApprovedTimeOffError(restaurantId, staffId, startsAt, endsAt) {
  if (!staffId || !startsAt || !endsAt) return null
  const timeZone = await getRestaurantTimezone(restaurantId)
  const { start, end } = shiftLocalDates(startsAt, endsAt, timeZone)
  const { rows } = await query(
    `
      SELECT id
      FROM staff_pto_request
      WHERE restaurant_id = $1
        AND staff_id = $2
        AND status = 'APPROVED'
        AND start_date <= $4::date
        AND end_date >= $3::date
      LIMIT 1
    `,
    [restaurantId, staffId, start, end]
  )
  if (rows.length) return 'This person is on approved time off for that day'
  return null
}

async function findShiftDuringTimeOffError(restaurantId, staffId, startDate, endDate) {
  if (!staffId || !startDate || !endDate) return null
  const timeZone = await getRestaurantTimezone(restaurantId)
  const windowStart = getZonedDayBounds(String(startDate).slice(0, 10), timeZone).start
  const windowEnd = getZonedDayBounds(String(endDate).slice(0, 10), timeZone).end
  const { rows } = await query(
    `
      SELECT id
      FROM staff_shift
      WHERE restaurant_id = $1
        AND staff_id = $2
        AND status <> 'CANCELLED'
        AND starts_at <= $4
        AND ends_at > $3
      LIMIT 1
    `,
    [restaurantId, staffId, windowStart.toISOString(), windowEnd.toISOString()]
  )
  if (rows.length) return 'This person already has a shift during this time off'
  const { rows: punches } = await query(
    `
      SELECT id
      FROM staff_time_entry
      WHERE restaurant_id = $1
        AND staff_id = $2
        AND clock_in_at <= $4
        AND (clock_out_at IS NULL OR clock_out_at > $3)
      LIMIT 1
    `,
    [restaurantId, staffId, windowStart.toISOString(), windowEnd.toISOString()]
  )
  if (punches.length) return 'This person already has hours worked during this time off'
  return null
}

function openTimeEntryConflictError(error) {
  if (error?.code !== '23505') return null
  const err = new Error('You already have an open time entry. Clock out first.')
  err.name = 'TIME_ENTRY_OPEN_EXISTS'
  err.status = 409
  return err
}

function getSwapCreateError({
  shiftStatus,
  shiftStaffId,
  requestedBy,
  proposedCoverId,
  coverStatus,
}) {
  if (String(shiftStatus || '').toUpperCase() === 'CANCELLED') return 'This shift is cancelled'
  if (shiftStaffId && requestedBy && String(shiftStaffId) !== String(requestedBy)) {
    return 'Only the person on this shift can request a swap'
  }
  if (proposedCoverId && requestedBy && String(proposedCoverId) === String(requestedBy)) {
    return 'You cannot propose yourself as cover'
  }
  if (proposedCoverId && coverStatus != null) {
    const inactive = getInactiveStaffError(coverStatus)
    if (inactive) return inactive
  }
  return null
}

function getSwapDecisionError(swap, nextStatus) {
  if (!swap) return 'Shift swap not found'
  if (String(swap.status || '').toUpperCase() !== 'REQUESTED') {
    return 'This swap has already been decided'
  }
  if (String(nextStatus || '').toUpperCase() === 'APPROVED' && !swap.proposed_cover_id) {
    return 'Choose who will cover this shift'
  }
  return null
}

function getPtoDateError(startDate, endDate) {
  const start = String(startDate || '').slice(0, 10)
  const end = String(endDate || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return 'Time off needs a start date and an end date'
  }
  if (end < start) return 'Time off cannot end before it starts'
  return null
}

function getShiftWindowError(startsAt, endsAt) {
  const start = new Date(startsAt)
  const end = new Date(endsAt)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 'Shift start and end must be valid times'
  }
  if (end.getTime() <= start.getTime()) {
    return 'Shift end must be after the start'
  }
  return null
}

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
  usePreview: z.boolean().optional(),
})

const updatePayrollExportSchema = z.object({
  status: z.enum(['DRAFT', 'APPROVED', 'EXPORTED']),
})

async function resolveRestaurantId(req) {
  const fromTenant = await getRestaurantIdForRequest(req)
  if (fromTenant) return fromTenant
  throw new ValidationError('Restaurant not found')
}

function mapStaffRow(row) {
  const hasAccount = Boolean(row.user_id)
  const magicLinkEnabled = Boolean(row.portal_access_enabled && !row.user_id)
  let portalStatus = 'none'
  if (hasAccount) {
    portalStatus = row.portal_access_enabled ? 'active' : 'disabled'
  } else if (magicLinkEnabled) {
    portalStatus = 'active'
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
    wageRate: row.wage_rate != null && row.wage_rate !== '' ? Number(row.wage_rate) : null,
    hireDate: row.hire_date,
    profileColor: row.profile_color,
    portalAccess: {
      hasAccount,
      enabled: Boolean(row.portal_access_enabled),
      magicLinkEnabled,
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
export {
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
  getShiftWindowError,
  getTimeEntryCloseError,
  getPtoDateError,
  getInactiveStaffError,
  timeOffOverlapsShift,
  findApprovedTimeOffError,
  findShiftDuringTimeOffError,
  openTimeEntryConflictError,
  getSwapCreateError,
  getSwapDecisionError,
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
}
