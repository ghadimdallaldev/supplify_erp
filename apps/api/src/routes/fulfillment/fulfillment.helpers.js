import express from 'express'
import {
  requireAuth,
  requireRole,
  resolveTenantContext,
  getRequestTenant,
  getSupplierIdForRequest,
  requirePermission,
} from '../../lib/rbac.js'
import { hasPermission } from '../../lib/permissions.js'
import { PERMISSION_KEYS as P } from '../../lib/permission-keys.js'
import { query } from '../../lib/db.js'
import { logger } from '../../lib/logger.js'
import { isFeatureEnabled, requireFeature } from '../../lib/subscription.js'
import { isMultiWarehouseFulfillmentActive } from '../../lib/warehouse-helpers.js'
import { z } from 'zod'
import {
  listDeliveryRoutes,
  getDeliveryRoute,
  createDeliveryRoute,
  updateDeliveryRoute,
  reorderRouteStops,
  reorderRouteStopsByOrder,
  setNextRouteStop,
  updateRouteStop,
  cancelDeliveryRoute,
  getDriverActiveRoute,
  addOrdersToPlannedRoute,
  removeOrderFromPlannedRoute,
  buildDriverRouteFromAssignments,
} from '../../services/delivery-routes.service.js'
import { getLinkedDriverId, isDriverOnlyPermissions } from '../../lib/driver-rbac.js'
import {
  getLatestLocationsForDrivers,
  isGpsTrackingEnabled,
} from '../../services/driver-location.service.js'
import {
  buildTrackingPayload,
  buildDriverLastSeenAlias,
} from '../../lib/delivery-tracking-payload.js'
import { rolloverAssignmentToNextDay } from '../../services/delivery-rollover.service.js'
import { invalidateUserAuthCaches } from '../../lib/access-cache.js'

async function resolveRouteReorderAccess(req, routeId) {
  const supplierId = await resolveSupplierId(req)
  if (!supplierId) {
    return { error: { status: 403, message: 'Supplier not found' } }
  }
  const perms = req.tenantContext?.permissions ?? []
  const canSupplier = hasPermission(perms, P.FULFILLMENT_MANAGE)
  const canDriver =
    hasPermission(perms, P.DRIVER_DELIVERIES_MANAGE) ||
    (isDriverOnlyPermissions(perms) && hasPermission(perms, P.DRIVER_DELIVERIES_MANAGE))

  if (!canSupplier && !canDriver) {
    return { error: { status: 403, message: 'Insufficient permission' } }
  }

  let driverScope = null
  if (!canSupplier) {
    driverScope = await getLinkedDriverId(req.userData.id, supplierId)
    if (!driverScope) {
      return { error: { status: 403, message: 'Driver profile not linked' } }
    }
  }

  return { supplierId, driverScope }
}

const fulfillmentFeature = requireFeature(
  'fulfillment',
  (req) => req.tenantContext?.tenantId,
  (req) => req.tenantContext?.tenantType || 'SUPPLIER'
)

/** Fulfillment board for staff; driver-only endpoints use DRIVER_DELIVERIES_* instead. */
function requireFulfillmentAccess(req, res, next) {
  const perms = req.tenantContext?.permissions ?? []
  const path = req.path

  if (req.method === 'GET' && path === '/routes/active') {
    if (hasPermission(perms, P.DRIVER_DELIVERIES_VIEW)) return next()
    return requirePermission('FULFILLMENT_VIEW')(req, res, next)
  }

  if (req.method === 'PATCH' && /^\/routes\/[^/]+\/stops\/[^/]+$/.test(path)) {
    if (
      hasPermission(perms, P.DRIVER_DELIVERIES_MANAGE) ||
      hasPermission(perms, P.FULFILLMENT_MANAGE)
    ) {
      return next()
    }
    return requirePermission('FULFILLMENT_VIEW')(req, res, next)
  }

  return requirePermission('FULFILLMENT_VIEW')(req, res, next)
}

function parseWarehouseFilter(req) {
  const raw = req.query.warehouse_id ?? req.query.warehouseId
  if (!raw || typeof raw !== 'string') return null
  return raw
}

async function warehouseFilterClause(req, supplierId, paramIndex = 1) {
  const warehouseId = parseWarehouseFilter(req)
  if (!warehouseId) return { clause: '', params: [], warehouseId: null }

  const multiActive = await isFeatureEnabled(supplierId, 'SUPPLIER', 'multi_warehouse')
  const { rows: supplierRows } = await query(
    `SELECT multi_warehouse_enabled, fulfillment_mode FROM supplier WHERE id = $1`,
    [supplierId]
  )
  const supplier = supplierRows[0] || {}
  if (!isMultiWarehouseFulfillmentActive(supplier, multiActive)) {
    return { clause: '', params: [], warehouseId: null }
  }

  return {
    clause: ` AND EXISTS (
      SELECT 1 FROM order_warehouse_assignment owa
      WHERE owa.order_id = o.id AND owa.warehouse_id = $${paramIndex}
    )`,
    params: [warehouseId],
    warehouseId,
  }
}

function mapStopStatus(dbStatus) {
  switch (dbStatus) {
    case 'IN_TRANSIT':
      return 'OUT_FOR_DELIVERY'
    case 'COMPLETED':
      return 'DELIVERED'
    default:
      return dbStatus
  }
}

async function resolveSupplierId(req) {
  const tenant = await getRequestTenant(req)
  if (tenant?.tenantType === 'SUPPLIER') return tenant.tenantId
  if (req.userData.role === 'SUPPLIER') {
    return (await getSupplierIdForRequest(req)) ?? null
  }
  return null
}

async function loadStopsForRoutes(routeIds, warehouseId = null) {
  if (!routeIds.length) return new Map()
  const params = [routeIds]
  let warehouseClause = ''
  if (warehouseId) {
    warehouseClause = ` AND EXISTS (
      SELECT 1 FROM order_warehouse_assignment owa
      WHERE owa.order_id = rs.order_id AND owa.warehouse_id = $2
    )`
    params.push(warehouseId)
  }
  const { rows } = await query(
    `
    SELECT
      rs.id,
      rs.route_id,
      rs.order_id,
      rs.status,
      rs.sequence_number,
      rs.estimated_arrival,
      rs.completed_at,
      r.name AS restaurant_name,
      o.total_amount,
      (SELECT COUNT(*)::int FROM order_item oi WHERE oi.order_id = o.id) AS item_count
    FROM route_stop rs
    JOIN customer_order o ON o.id = rs.order_id
    JOIN restaurant r ON r.id = o.restaurant_id
    WHERE rs.route_id = ANY($1::uuid[])${warehouseClause}
    ORDER BY rs.route_id, rs.sequence_number
    `,
    params
  )
  const byRoute = new Map()
  for (const row of rows) {
    const list = byRoute.get(row.route_id) ?? []
    list.push({
      id: row.id,
      route_id: row.route_id,
      order_id: row.order_id,
      status: mapStopStatus(row.status),
      restaurant_name: row.restaurant_name,
      total_amount: parseFloat(row.total_amount) || 0,
      item_count: row.item_count ?? 0,
      eta_seconds: null,
    })
    byRoute.set(row.route_id, list)
  }
  return byRoute
}
export {
  resolveRouteReorderAccess,
  fulfillmentFeature,
  requireFulfillmentAccess,
  parseWarehouseFilter,
  warehouseFilterClause,
  mapStopStatus,
  resolveSupplierId,
  loadStopsForRoutes,
}
