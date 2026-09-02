import express from 'express'
import {
  requireAuth,
  requireRole,
  resolveTenantContext,
  getRequestTenant,
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
import { getCache, setCache } from '../../lib/cache.js'
import { invalidateDispatchCacheForSupplier } from '../../lib/dispatch-cache.js'

import {
  resolveRouteReorderAccess,
  parseWarehouseFilter,
  warehouseFilterClause,
  mapStopStatus,
  resolveSupplierId,
  loadStopsForRoutes,
} from './fulfillment.helpers.js'

const router = express.Router()

router.get('/board', async (req, res) => {
  try {
    const supplierId = await resolveSupplierId(req)
    if (!supplierId) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Supplier not found' },
        requestId: req.requestId,
      })
    }

    const whFilter = await warehouseFilterClause(req, supplierId, 2)
    const unassignedParams = [supplierId, ...whFilter.params]

    const [{ rows: routes }, { rows: unassignedRows }, { rows: statsRows }] = await Promise.all([
      query(
        `
        SELECT id, route_number, driver_name, vehicle_info, scheduled_date, status
        FROM delivery_route
        WHERE supplier_id = $1
          AND status IN ('PLANNED', 'IN_PROGRESS')
        ORDER BY scheduled_date, route_number
        `,
        [supplierId]
      ),
      query(
        `
        SELECT DISTINCT ON (o.id)
          o.id,
          o.status,
          o.total_amount,
          COALESCE(o.placed_at, o.created_at) AS created_at,
          r.name AS restaurant_name,
          (SELECT COUNT(*)::int FROM order_item oi WHERE oi.order_id = o.id AND oi.supplier_id = $1) AS item_count
        FROM customer_order o
        JOIN order_item oi ON oi.order_id = o.id AND oi.supplier_id = $1
        JOIN restaurant r ON r.id = o.restaurant_id
        WHERE o.status IN ('ACKNOWLEDGED', 'PROCESSING', 'SHIPPED')
          AND NOT EXISTS (
            SELECT 1
            FROM route_stop rs
            JOIN delivery_route dr ON dr.id = rs.route_id
            WHERE rs.order_id = o.id
              AND dr.supplier_id = $1
              AND dr.status IN ('PLANNED', 'IN_PROGRESS')
          )${whFilter.clause}
        ORDER BY o.id, o.created_at DESC
        `,
        unassignedParams
      ),
      query(
        `
        SELECT
          (
            SELECT COUNT(*)::int
            FROM route_stop rs
            JOIN delivery_route dr ON dr.id = rs.route_id
            WHERE dr.supplier_id = $1
              AND rs.status = 'IN_TRANSIT'
              AND dr.status IN ('PLANNED', 'IN_PROGRESS')
          ) AS out_for_delivery,
          (
            SELECT COUNT(*)::int
            FROM route_stop rs
            JOIN delivery_route dr ON dr.id = rs.route_id
            WHERE dr.supplier_id = $1
              AND rs.status = 'COMPLETED'
              AND rs.completed_at >= date_trunc('day', now())
          ) +
          (
            SELECT COUNT(*)::int
            FROM proof_of_delivery pod
            JOIN customer_order o ON o.id = pod.order_id
            JOIN order_item oi ON oi.order_id = o.id AND oi.supplier_id = $1
            WHERE pod.delivery_timestamp >= date_trunc('day', now())
          ) AS delivered_today
        `,
        [supplierId]
      ),
    ])

    const routeIds = routes.map((r) => r.id)
    const stopsByRoute = await loadStopsForRoutes(routeIds, whFilter.warehouseId)

    const routePayload = routes.map((route) => ({
      id: route.id,
      route_number: route.route_number,
      driver_id: route.driver_name ? route.id : null,
      status: route.status,
      scheduled_date: route.scheduled_date,
      driver_name: route.driver_name,
      vehicle_info: route.vehicle_info,
      stops: stopsByRoute.get(route.id) ?? [],
    }))

    const drivers = routes
      .filter((route) => route.driver_name)
      .map((route) => {
        const fullRoute = routePayload.find((r) => r.id === route.id)
        return {
          id: route.id,
          name: route.driver_name,
          phone: null,
          vehicle: route.vehicle_info,
          status: 'ACTIVE',
          activeRoute: fullRoute ?? null,
        }
      })

    const unassignedOrders = unassignedRows.map((row) => ({
      id: row.id,
      status: row.status,
      total_amount: parseFloat(row.total_amount) || 0,
      created_at: row.created_at,
      restaurant_name: row.restaurant_name,
      item_count: row.item_count ?? 0,
    }))

    const stats = statsRows[0] ?? { out_for_delivery: 0, delivered_today: 0 }

    res.json({
      ok: true,
      data: {
        drivers,
        routes: routePayload,
        unassignedOrders,
        stats: {
          pending: unassignedOrders.length,
          outForDelivery: stats.out_for_delivery ?? 0,
          deliveredToday: stats.delivered_today ?? 0,
        },
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Get fulfillment board error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to load fulfillment board' },
      requestId: req.requestId,
    })
  }
})

router.get('/routes', async (req, res) => {
  try {
    const supplierId = await resolveSupplierId(req)
    if (!supplierId) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Supplier not found' },
        requestId: req.requestId,
      })
    }

    const perms = req.tenantContext?.permissions ?? []
    let driverScope = null
    if (isDriverOnlyPermissions(perms)) {
      driverScope = await getLinkedDriverId(req.userData.id, supplierId)
      if (!driverScope) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: { name: 'FORBIDDEN', message: 'Driver profile not linked' },
          requestId: req.requestId,
        })
      }
    }

    const includeCancelled = req.query.include_cancelled === 'true'
    const routes = await listDeliveryRoutes(supplierId, {
      includeCancelled,
      driverId: driverScope,
    })

    res.json({
      ok: true,
      data: { routes },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Get fulfillment routes error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to load delivery routes' },
      requestId: req.requestId,
    })
  }
})

function mapDispatchOrder(row) {
  const plannedOnly =
    row.active_route_id && row.active_route_status === 'PLANNED' && !row.assignment_id
  return {
    id: row.id,
    status: row.order_status,
    total_amount: parseFloat(row.total_amount) || 0,
    created_at: row.created_at,
    restaurant_name: row.restaurant_name,
    item_count: row.item_count ?? 0,
    active_route_id: row.active_route_id ?? null,
    active_route_number: row.active_route_number ?? null,
    active_route_status: row.active_route_status ?? null,
    planned_route_only: plannedOnly,
    route_planning_label: plannedOnly
      ? 'Route planned — waiting for order to be ready'
      : row.active_route_status === 'PLANNED'
        ? 'Planned route'
        : null,
    assignment: row.assignment_id
      ? {
          id: row.assignment_id,
          status: row.assignment_status,
          driver: {
            id: row.driver_id,
            full_name: row.driver_name,
            phone: row.driver_phone,
            vehicle_type: row.vehicle_type,
            vehicle_plate: row.vehicle_plate,
          },
          assigned_at: row.assigned_at,
          delivered_at: row.delivered_at,
          scheduled_delivery_date: row.scheduled_delivery_date ?? null,
          rolled_over_at: row.rolled_over_at ?? null,
        }
      : null,
    has_pod: row.has_pod === true,
  }
}

const DISPATCH_BUCKET_LIMIT = 200
const DISPATCH_CACHE_TTL_SECONDS = 45

function dispatchCacheKey(supplierId, days, warehouseId) {
  return `fulfillment:dispatch:v1:${supplierId}:${days}:${warehouseId || 'all'}`
}

export { invalidateDispatchCacheForSupplier }

function buildDispatchBaseSelect() {
  return `
      SELECT DISTINCT ON (o.id)
        o.id,
        o.status AS order_status,
        o.total_amount,
        COALESCE(o.placed_at, o.created_at) AS created_at,
        r.name AS restaurant_name,
        COALESCE(oic.item_count, 0) AS item_count,
        da.id AS assignment_id,
        da.status AS assignment_status,
        da.assigned_at,
        da.delivered_at,
        da.scheduled_delivery_date,
        da.rolled_over_at,
        d.id AS driver_id,
        d.full_name AS driver_name,
        d.phone AS driver_phone,
        d.vehicle_type,
        d.vehicle_plate,
        (pod.order_id IS NOT NULL) AS has_pod,
        ar.route_id AS active_route_id,
        ar.route_number AS active_route_number,
        ar.route_status AS active_route_status
      FROM customer_order o
      JOIN order_item oi ON oi.order_id = o.id AND oi.supplier_id = $1
      JOIN restaurant r ON r.id = o.restaurant_id
      LEFT JOIN (
        SELECT order_id, COUNT(*)::int AS item_count
        FROM order_item
        WHERE supplier_id = $1
        GROUP BY order_id
      ) oic ON oic.order_id = o.id
      LEFT JOIN (SELECT DISTINCT order_id FROM proof_of_delivery) pod ON pod.order_id = o.id
      LEFT JOIN LATERAL (
        SELECT * FROM driver_assignments da2
        WHERE da2.order_id = o.id AND da2.status NOT IN ('reassigned')
        ORDER BY da2.created_at DESC
        LIMIT 1
      ) da ON true
      LEFT JOIN drivers d ON d.id = da.driver_id
      LEFT JOIN LATERAL (
        SELECT dr.id AS route_id, dr.route_number, dr.status AS route_status
        FROM route_stop rs
        JOIN delivery_route dr ON dr.id = rs.route_id
        WHERE rs.order_id = o.id
          AND dr.supplier_id = $1
          AND dr.status IN ('PLANNED', 'IN_PROGRESS')
        LIMIT 1
      ) ar ON true
      WHERE o.status IN ('PLACED', 'PENDING_APPROVAL', 'ACKNOWLEDGED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'COMPLETED')
  `
}

function parseDispatchQuery(query = {}) {
  const days = Math.min(Math.max(parseInt(String(query.days ?? 14), 10) || 14, 1), 90)
  return { days }
}

router.get('/dispatch', async (req, res) => {
  try {
    const supplierId = await resolveSupplierId(req)
    if (!supplierId) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Supplier not found' },
        requestId: req.requestId,
      })
    }

    const { days } = parseDispatchQuery(req.query)
    const whFilter = await warehouseFilterClause(req, supplierId, 2)
    const warehouseId = parseWarehouseFilter(req) || null
    const cacheKey = dispatchCacheKey(supplierId, days, warehouseId)
    const cached = await getCache(cacheKey)
    if (cached) {
      return res.json({
        ok: true,
        data: cached,
        error: null,
        requestId: req.requestId,
      })
    }

    const params = [supplierId, ...whFilter.params]
    const dateParamIndex = params.length + 1
    params.push(days)
    const placedSinceClause = `AND COALESCE(o.placed_at, o.created_at) >= NOW() - ($${dateParamIndex}::int * INTERVAL '1 day')`

    const baseSelect = `${buildDispatchBaseSelect()}
        ${placedSinceClause}
        ${whFilter.clause}
    `

    const bucketLimit = DISPATCH_BUCKET_LIMIT
    const limitParamIndex = params.length + 1
    const limitParams = [...params, bucketLimit]

    const [
      { rows: unassigned },
      { rows: assigned },
      { rows: outForDelivery },
      { rows: deliveredToday },
    ] = await Promise.all([
      query(
        `${baseSelect}
           AND (da.id IS NULL OR da.status IN ('failed'))
           AND o.status IN ('PLACED', 'PENDING_APPROVAL', 'ACKNOWLEDGED', 'PROCESSING', 'SHIPPED')
           ORDER BY o.id, o.created_at DESC
           LIMIT $${limitParamIndex}`,
        limitParams
      ),
      query(
        `${baseSelect}
           AND da.status IN ('assigned', 'rescheduled')
           ORDER BY o.id, da.assigned_at DESC
           LIMIT $${limitParamIndex}`,
        limitParams
      ),
      query(
        `${baseSelect}
           AND da.status IN ('picked_up', 'out_for_delivery')
           ORDER BY o.id, da.updated_at DESC
           LIMIT $${limitParamIndex}`,
        limitParams
      ),
      query(
        `${baseSelect}
           AND da.status = 'delivered'
           AND da.delivered_at >= date_trunc('day', now())
           ORDER BY o.id, da.delivered_at DESC
           LIMIT $${limitParamIndex}`,
        limitParams
      ),
    ])

    const truncated = {
      pending: unassigned.length >= bucketLimit,
      assigned: assigned.length >= bucketLimit,
      out_for_delivery: outForDelivery.length >= bucketLimit,
      delivered_today: deliveredToday.length >= bucketLimit,
    }

    const allRows = [...unassigned, ...assigned, ...outForDelivery, ...deliveredToday]
    const driverIds = [...new Set(allRows.map((r) => r.driver_id).filter(Boolean))]
    const locationMap = isGpsTrackingEnabled()
      ? await getLatestLocationsForDrivers(driverIds)
      : new Map()

    const mapWithLocation = (row) => {
      const card = mapDispatchOrder(row)
      const locRow = row.driver_id ? locationMap.get(row.driver_id) : null
      const allowFallback = ['picked_up', 'out_for_delivery'].includes(row.assignment_status)
      card.tracking = buildTrackingPayload({
        orderId: row.id,
        locationRow: locRow
          ? {
              latitude: locRow.latitude,
              longitude: locRow.longitude,
              accuracyMeters: locRow.accuracyMeters,
              speedMps: locRow.speedMps,
              headingDegrees: locRow.headingDegrees,
              recordedAt: locRow.recordedAt,
              orderId: locRow.orderId,
            }
          : null,
        allowDriverFallback: allowFallback,
      })
      card.driver_last_seen = buildDriverLastSeenAlias(card.tracking)
      return card
    }

    const responseData = {
      pending: unassigned.map(mapWithLocation),
      assigned: assigned.map(mapWithLocation),
      out_for_delivery: outForDelivery.map(mapWithLocation),
      delivered_today: deliveredToday.map(mapWithLocation),
      windowDays: days,
      bucketLimit,
      truncated,
      stats: {
        pending: unassigned.length,
        assigned: assigned.length,
        outForDelivery: outForDelivery.length,
        deliveredToday: deliveredToday.length,
      },
    }

    await setCache(cacheKey, responseData, DISPATCH_CACHE_TTL_SECONDS).catch(() => {})

    res.json({
      ok: true,
      data: responseData,
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Get fulfillment dispatch error:', {
      message: error?.message,
      code: error?.code,
      detail: error?.detail,
    })
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to load dispatch board' },
      requestId: req.requestId,
    })
  }
})

router.post(
  '/assignments/:assignmentId/rollover-to-tomorrow',
  requirePermission('FULFILLMENT_MANAGE'),
  async (req, res) => {
    try {
      const supplierId = await resolveSupplierId(req)
      if (!supplierId) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: { name: 'FORBIDDEN', message: 'Supplier not found' },
          requestId: req.requestId,
        })
      }

      const { rows } = await query(
        `SELECT id, supplier_id, order_id FROM driver_assignments WHERE id = $1`,
        [req.params.assignmentId]
      )
      if (!rows.length || rows[0].supplier_id !== supplierId) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: 'Assignment not found' },
          requestId: req.requestId,
        })
      }

      const outcome = await rolloverAssignmentToNextDay({
        assignmentId: req.params.assignmentId,
        actorUserId: req.userData?.id ?? null,
        force: true,
        notifyRestaurant: req.body?.notify_restaurant === true,
      })

      if (!outcome.ok) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'VALIDATION_ERROR',
            message: `Cannot move to tomorrow (${outcome.reason ?? 'unknown'})`,
          },
          requestId: req.requestId,
        })
      }

      await invalidateUserAuthCaches({ tenantId: supplierId, tenantType: 'SUPPLIER' })

      res.json({
        ok: true,
        data: outcome,
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Manual delivery rollover error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to move delivery to tomorrow' },
        requestId: req.requestId,
      })
    }
  }
)

export default router
