/**
 * Order statuses for planned route assignment vs live dispatch activation.
 * Maps business terms: CONFIRMED/ACCEPTED → ACKNOWLEDGED, PREPARING → PROCESSING,
 * READY_FOR_DELIVERY → SHIPPED.
 */

/** Safe to add to a PLANNED delivery route (no driver assignment yet). */
export const PLANNED_ROUTE_ORDER_STATUSES = Object.freeze([
  'PLACED',
  'PENDING_APPROVAL',
  'ACKNOWLEDGED',
  'PROCESSING',
  'SHIPPED',
])

/** Orders that receive driver assignment when a route is activated (IN_PROGRESS). */
export const DISPATCH_ELIGIBLE_ORDER_STATUSES = Object.freeze(['SHIPPED', 'PROCESSING'])

export function isPlannedRouteEligibleStatus(status) {
  return PLANNED_ROUTE_ORDER_STATUSES.includes(String(status || '').toUpperCase())
}

export function isDispatchEligibleStatus(status) {
  return DISPATCH_ELIGIBLE_ORDER_STATUSES.includes(String(status || '').toUpperCase())
}

export function plannedRouteIneligibleReason(status) {
  const s = String(status || '').toUpperCase()
  if (s === 'CANCELLED') return 'Order is cancelled'
  if (['DELIVERED', 'COMPLETED', 'INVOICED'].includes(s)) return 'Order is already completed'
  if (!isPlannedRouteEligibleStatus(s)) {
    return 'Order is not eligible for route planning'
  }
  return null
}
