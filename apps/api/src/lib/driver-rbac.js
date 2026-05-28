/**
 * Driver role: link app_user ↔ drivers row and scope delivery APIs to assigned work only.
 */
import { query } from './db.js'
import { ForbiddenError, ValidationError } from '../middlewares/errorHandler.js'
import { PERMISSION_KEYS as P } from './permission-keys.js'
import { hasPermission } from './permissions.js'

export const DRIVER_ALLOWED_STATUS_UPDATES = Object.freeze([
  'out_for_delivery',
  'delivered',
  'failed',
  'rescheduled',
])

export function isDriverOnlyPermissions(permissions) {
  if (!Array.isArray(permissions) || !permissions.length) return false
  const allowed = new Set([P.DRIVER_DELIVERIES_VIEW, P.DRIVER_DELIVERIES_MANAGE])
  return permissions.every((p) => allowed.has(p))
}

export async function getLinkedDriverId(userId, supplierId) {
  if (!userId || !supplierId) return null
  const { rows } = await query(
    `SELECT id FROM drivers
     WHERE user_id = $1 AND supplier_id = $2 AND is_active = TRUE
     LIMIT 1`,
    [userId, supplierId]
  )
  return rows[0]?.id ?? null
}

export async function requireLinkedDriver(userId, supplierId) {
  const driverId = await getLinkedDriverId(userId, supplierId)
  if (!driverId) {
    throw new ValidationError(
      'Driver account is not linked to a driver profile. Ask an admin to link your user in Drivers settings.'
    )
  }
  return driverId
}

export async function assertDriverAssignmentAccess({
  userId,
  supplierId,
  orderId,
  assignmentId,
  permissions,
}) {
  if (!isDriverOnlyPermissions(permissions)) return null
  const driverId = await requireLinkedDriver(userId, supplierId)
  const { rows } = await query(
    `
    SELECT da.id, da.driver_id, da.order_id
    FROM driver_assignments da
    WHERE da.supplier_id = $1
      AND da.driver_id = $2
      AND ($3::uuid IS NULL OR da.order_id = $3)
      AND ($4::uuid IS NULL OR da.id = $4)
      AND da.status NOT IN ('reassigned')
    ORDER BY da.created_at DESC
    LIMIT 1
    `,
    [supplierId, driverId, orderId ?? null, assignmentId ?? null]
  )
  if (!rows.length) {
    throw new ForbiddenError('You can only access deliveries assigned to you')
  }
  return { driverId, assignment: rows[0] }
}

export function assertDriverStatusUpdate(status, permissions) {
  if (!isDriverOnlyPermissions(permissions)) return
  if (!DRIVER_ALLOWED_STATUS_UPDATES.includes(status)) {
    throw new ForbiddenError(
      `Drivers can only set delivery status to: ${DRIVER_ALLOWED_STATUS_UPDATES.join(', ')}`
    )
  }
}

export function userCanManageFulfillmentBoard(permissions) {
  return hasPermission(permissions, P.FULFILLMENT_VIEW) && !isDriverOnlyPermissions(permissions)
}
