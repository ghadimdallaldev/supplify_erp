import { ValidationError } from '../middlewares/errorHandler.js'

/**
 * Legal customer_order status transitions by actor role.
 * Mirrors docs/onboarding/11-api-and-workflow-reference.md state machine.
 */

const RESTAURANT_TRANSITIONS = {
  PLACED: ['CANCELLED'],
  ACKNOWLEDGED: ['CANCELLED'],
  PROCESSING: ['CANCELLED'],
}

const SUPPLIER_TRANSITIONS = {
  PLACED: ['ACKNOWLEDGED', 'CANCELLED'],
  ACKNOWLEDGED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'CANCELLED'],
}

/** Legacy COMPLETED PATCH maps to DELIVERED; allow from pre-delivery fulfillment states. */
const LEGACY_COMPLETED_TO_DELIVERED_FROM = new Set(['ACKNOWLEDGED', 'PROCESSING', 'SHIPPED'])

const TERMINAL_STATUSES = new Set([
  'CANCELLED',
  'INVOICED',
  'RECEIVED_PARTIAL',
  'RECEIVED_FULL',
  'RECEIVED_WITH_DISPUTE',
])

function normalizeRole(role) {
  return String(role || '').toUpperCase()
}

function allowedTargetsForRole(role, fromStatus) {
  const roleKey = normalizeRole(role)
  if (roleKey === 'RESTAURANT') {
    return RESTAURANT_TRANSITIONS[fromStatus] ?? []
  }
  if (roleKey === 'SUPPLIER') {
    return SUPPLIER_TRANSITIONS[fromStatus] ?? []
  }
  // Admin / system callers: union of documented forward paths (no illegal reverse jumps).
  const restaurant = RESTAURANT_TRANSITIONS[fromStatus] ?? []
  const supplier = SUPPLIER_TRANSITIONS[fromStatus] ?? []
  return [...new Set([...restaurant, ...supplier])]
}

/**
 * @param {{ role: string, from: string, to: string, legacyCompleted?: boolean }} params
 * @throws {ValidationError}
 */
export function assertValidOrderStatusTransition({ role, from, to, legacyCompleted = false }) {
  const fromStatus = String(from || '').toUpperCase()
  const toStatus = String(to || '').toUpperCase()

  if (!fromStatus || !toStatus) {
    throw new ValidationError('Order status transition requires from and to statuses')
  }

  if (fromStatus === toStatus) {
    return
  }

  if (TERMINAL_STATUSES.has(fromStatus)) {
    throw new ValidationError(`Cannot change order status from ${fromStatus}`)
  }

  if (legacyCompleted && toStatus === 'DELIVERED') {
    if (!LEGACY_COMPLETED_TO_DELIVERED_FROM.has(fromStatus)) {
      throw new ValidationError(
        `Cannot mark order delivered from ${fromStatus}; order must be acknowledged or in fulfillment`
      )
    }
    return
  }

  const allowed = allowedTargetsForRole(role, fromStatus)
  if (!allowed.includes(toStatus)) {
    const roleLabel = normalizeRole(role) || 'ACTOR'
    throw new ValidationError(
      `${roleLabel} cannot transition order from ${fromStatus} to ${toStatus}`
    )
  }
}

export {
  RESTAURANT_TRANSITIONS,
  SUPPLIER_TRANSITIONS,
  LEGACY_COMPLETED_TO_DELIVERED_FROM,
  TERMINAL_STATUSES,
}
