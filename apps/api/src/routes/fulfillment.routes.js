import express from 'express'
import {
  requireAuth,
  requireRole,
  resolveTenantContext,
  getRequestTenant,
  requirePermission,
} from '../lib/rbac.js'
import { hasPermission } from '../lib/permissions.js'
import { PERMISSION_KEYS as P } from '../lib/permission-keys.js'
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { isFeatureEnabled, requireFeature } from '../lib/subscription.js'
import { isMultiWarehouseFulfillmentActive } from '../lib/warehouse-helpers.js'
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
} from '../services/delivery-routes.service.js'
import { getLinkedDriverId, isDriverOnlyPermissions } from '../lib/driver-rbac.js'
import {
  getLatestLocationsForDrivers,
  isGpsTrackingEnabled,
} from '../services/driver-location.service.js'
import { buildTrackingPayload, buildDriverLastSeenAlias } from '../lib/delivery-tracking-payload.js'

const router = express.Router()

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

router.use(
  requireAuth,
  resolveTenantContext,
  requireRole(['SUPPLIER', 'ADMIN']),
  fulfillmentFeature,
  requireFulfillmentAccess
)

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
    const { rows } = await query('SELECT id FROM supplier WHERE contact_email = $1', [
      req.userData.email,
    ])
    return rows[0]?.id ?? null
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
        }
      : null,
    has_pod: row.has_pod === true,
  }
}

const DISPATCH_BUCKET_LIMIT = 500

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
    const params = [supplierId, ...whFilter.params]
    const dateParamIndex = params.length + 1
    params.push(days)
    const placedSinceClause = `AND COALESCE(o.placed_at, o.created_at) >= NOW() - ($${dateParamIndex}::int * INTERVAL '1 day')`

    const baseSelect = `
      SELECT DISTINCT ON (o.id)
        o.id,
        o.status AS order_status,
        o.total_amount,
        COALESCE(o.placed_at, o.created_at) AS created_at,
        r.name AS restaurant_name,
        (SELECT COUNT(*)::int FROM order_item oi WHERE oi.order_id = o.id AND oi.supplier_id = $1) AS item_count,
        da.id AS assignment_id,
        da.status AS assignment_status,
        da.assigned_at,
        da.delivered_at,
        d.id AS driver_id,
        d.full_name AS driver_name,
        d.phone AS driver_phone,
        d.vehicle_type,
        d.vehicle_plate,
        EXISTS (SELECT 1 FROM proof_of_delivery pod WHERE pod.order_id = o.id) AS has_pod,
        ar.route_id AS active_route_id,
        ar.route_number AS active_route_number,
        ar.route_status AS active_route_status
      FROM customer_order o
      JOIN order_item oi ON oi.order_id = o.id AND oi.supplier_id = $1
      JOIN restaurant r ON r.id = o.restaurant_id
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

    res.json({
      ok: true,
      data: {
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
      },
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

router.get('/exceptions', async (req, res) => {
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

    const statusFilter = req.query.status
    const typeFilter = req.query.type
    const whFilter = await warehouseFilterClause(req, supplierId, 2)
    const exceptionParams = [supplierId, ...whFilter.params]
    let paramIdx = exceptionParams.length + 1
    let extraClause = ''

    if (statusFilter) {
      extraClause += ` AND fe.status = $${paramIdx++}`
      exceptionParams.push(statusFilter)
    }
    if (typeFilter) {
      extraClause += ` AND fe.type = $${paramIdx++}`
      exceptionParams.push(typeFilter)
    }
    if (whFilter.warehouseId) {
      extraClause += ` AND fe.warehouse_id = $${paramIdx++}`
      exceptionParams.push(whFilter.warehouseId)
    }

    const { rows } = await query(
      `
      SELECT
        fe.id,
        fe.order_id,
        fe.type,
        fe.status,
        fe.description,
        fe.resolution_notes,
        fe.created_at,
        fe.resolved_at,
        r.name AS restaurant_name
      FROM fulfillment_exceptions fe
      LEFT JOIN customer_order o ON o.id = fe.order_id
      LEFT JOIN restaurant r ON r.id = o.restaurant_id
      WHERE fe.supplier_id = $1${extraClause}
      ORDER BY fe.created_at DESC
      LIMIT 200
      `,
      exceptionParams
    )

    const openCount = rows.filter((r) => r.status === 'open').length

    res.json({
      ok: true,
      data: {
        openCount,
        exceptions: rows.map((row) => ({
          id: row.id,
          orderId: row.order_id,
          orderLabel: row.order_id ? row.order_id.slice(0, 8).toUpperCase() : '—',
          restaurantName: row.restaurant_name,
          exceptionType: row.type,
          status: row.status,
          description: row.description,
          resolutionNotes: row.resolution_notes,
          createdAt: row.created_at,
          resolvedAt: row.resolved_at,
        })),
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Get fulfillment exceptions error:', {
      message: error?.message,
      code: error?.code,
      detail: error?.detail,
    })
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to load delivery exceptions' },
      requestId: req.requestId,
    })
  }
})

router.post(
  '/exceptions/:id/resolve',
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
      const body = z.object({ resolution_notes: z.string().optional() }).parse(req.body ?? {})
      const { rows } = await query(
        `UPDATE fulfillment_exceptions
         SET status = 'resolved',
             resolution_notes = COALESCE($1, resolution_notes),
             resolved_by = $2,
             resolved_at = now(),
             updated_at = now()
         WHERE id = $3 AND supplier_id = $4
         RETURNING *`,
        [body.resolution_notes ?? null, req.userData.id, req.params.id, supplierId]
      )
      if (!rows.length) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: 'Exception not found' },
          requestId: req.requestId,
        })
      }
      res.json({
        ok: true,
        data: { exception: rows[0] },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Resolve fulfillment exception error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to resolve exception' },
        requestId: req.requestId,
      })
    }
  }
)

router.get('/routes/today', async (req, res, next) => {
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
    if (!hasPermission(perms, P.DRIVER_DELIVERIES_VIEW)) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Driver delivery access required' },
        requestId: req.requestId,
      })
    }
    const driverId = await getLinkedDriverId(req.userData.id, supplierId)
    if (!driverId) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Driver profile not linked' },
        requestId: req.requestId,
      })
    }
    const route = await getDriverActiveRoute(supplierId, driverId)
    res.json({ ok: true, data: { route }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.get('/routes/active', async (req, res, next) => {
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
    if (!hasPermission(perms, P.DRIVER_DELIVERIES_VIEW)) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Driver delivery access required' },
        requestId: req.requestId,
      })
    }
    const driverId = await getLinkedDriverId(req.userData.id, supplierId)
    if (!driverId) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Driver profile not linked' },
        requestId: req.requestId,
      })
    }
    const route = await getDriverActiveRoute(supplierId, driverId)
    res.json({ ok: true, data: { route }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.get('/routes/:id', async (req, res, next) => {
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
    const route = await getDeliveryRoute(supplierId, req.params.id, {
      driverIdScope: driverScope,
    })
    res.json({ ok: true, data: { route }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

const createRouteSchema = z.object({
  order_ids: z.array(z.string().uuid()).min(1),
  driver_id: z.string().uuid(),
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  route_label: z.string().max(120).optional(),
  area: z.string().max(120).optional(),
})

router.post('/routes', requirePermission('FULFILLMENT_MANAGE'), async (req, res, next) => {
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
    const body = createRouteSchema.parse(req.body ?? {})
    const route = await createDeliveryRoute({
      supplierId,
      orderIds: body.order_ids,
      driverId: body.driver_id,
      scheduledDate: body.scheduled_date,
      routeLabel: body.route_label,
      area: body.area,
      userId: req.userData.id,
    })
    res.status(201).json({ ok: true, data: { route }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

const addRouteStopsSchema = z.object({
  order_ids: z.array(z.string().uuid()).min(1),
})

router.post(
  '/routes/:id/stops',
  requirePermission('FULFILLMENT_MANAGE'),
  async (req, res, next) => {
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
      const body = addRouteStopsSchema.parse(req.body ?? {})
      const route = await addOrdersToPlannedRoute({
        supplierId,
        routeId: req.params.id,
        orderIds: body.order_ids,
        userId: req.userData?.id,
      })
      res.status(201).json({ ok: true, data: { route }, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.delete(
  '/routes/:id/stops/:orderId',
  requirePermission('FULFILLMENT_MANAGE'),
  async (req, res, next) => {
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
      const route = await removeOrderFromPlannedRoute({
        supplierId,
        routeId: req.params.id,
        orderId: req.params.orderId,
      })
      res.json({ ok: true, data: { route }, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.patch('/routes/:id', requirePermission('FULFILLMENT_MANAGE'), async (req, res, next) => {
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
    const body = z
      .object({
        route_label: z.string().max(120).optional(),
        area: z.string().max(120).optional(),
        scheduled_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        driver_id: z.string().uuid().optional(),
        status: z.enum(['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
      })
      .parse(req.body ?? {})
    const route = await updateDeliveryRoute(supplierId, req.params.id, {
      routeLabel: body.route_label,
      area: body.area,
      scheduledDate: body.scheduled_date,
      driverId: body.driver_id,
      status: body.status,
      userId: req.userData?.id,
    })
    res.json({ ok: true, data: { route }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.delete('/routes/:id', requirePermission('FULFILLMENT_MANAGE'), async (req, res, next) => {
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
    const route = await cancelDeliveryRoute(supplierId, req.params.id)
    res.json({ ok: true, data: { route }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.post('/routes/:id/stops/reorder', async (req, res, next) => {
  try {
    const access = await resolveRouteReorderAccess(req, req.params.id)
    if (access.error) {
      return res.status(access.error.status).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: access.error.message },
        requestId: req.requestId,
      })
    }
    const body = z.object({ stop_ids: z.array(z.string().uuid()).min(1) }).parse(req.body ?? {})
    const route = await reorderRouteStops(access.supplierId, req.params.id, body.stop_ids, {
      driverIdScope: access.driverScope,
    })
    res.json({ ok: true, data: { route }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

const reorderStopsByOrderSchema = z.object({
  stops: z
    .array(
      z.object({
        orderId: z.string().uuid(),
        stopSequence: z.number().int().positive(),
      })
    )
    .min(1),
})

router.patch('/routes/:id/stops/reorder', async (req, res, next) => {
  try {
    const access = await resolveRouteReorderAccess(req, req.params.id)
    if (access.error) {
      return res.status(access.error.status).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: access.error.message },
        requestId: req.requestId,
      })
    }
    const body = reorderStopsByOrderSchema.parse(req.body ?? {})
    const route = await reorderRouteStopsByOrder(access.supplierId, req.params.id, body.stops, {
      driverIdScope: access.driverScope,
    })
    res.json({ ok: true, data: { route }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.patch('/routes/:id/next-stop', async (req, res, next) => {
  try {
    const access = await resolveRouteReorderAccess(req, req.params.id)
    if (access.error) {
      return res.status(access.error.status).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: access.error.message },
        requestId: req.requestId,
      })
    }
    const body = z.object({ orderId: z.string().uuid() }).parse(req.body ?? {})
    const route = await setNextRouteStop(access.supplierId, req.params.id, body.orderId, {
      driverIdScope: access.driverScope,
    })
    res.json({ ok: true, data: { route }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

const stopStatusSchema = z.enum(['PLANNED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED'])

router.patch('/routes/:id/stops/:stopId', async (req, res, next) => {
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
    const canManage =
      perms.includes('FULFILLMENT_MANAGE') ||
      perms.includes('DRIVER_DELIVERIES_MANAGE') ||
      isDriverOnlyPermissions(perms)
    if (!canManage) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Insufficient permission' },
        requestId: req.requestId,
      })
    }
    if (isDriverOnlyPermissions(perms) && !perms.includes('DRIVER_DELIVERIES_MANAGE')) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Insufficient permission' },
        requestId: req.requestId,
      })
    }
    const body = z
      .object({
        status: stopStatusSchema.optional(),
        notes: z.string().max(2000).optional(),
        failure_reason: z.string().max(500).optional(),
      })
      .parse(req.body ?? {})

    const route = await getDeliveryRoute(supplierId, req.params.id)
    if (isDriverOnlyPermissions(perms)) {
      const driverId = await getLinkedDriverId(req.userData.id, supplierId)
      if (route.driverId !== driverId) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: { name: 'FORBIDDEN', message: 'Not your route' },
          requestId: req.requestId,
        })
      }
    } else if (!perms.includes('FULFILLMENT_MANAGE')) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Insufficient permission' },
        requestId: req.requestId,
      })
    }

    const updated = await updateRouteStop(supplierId, req.params.id, req.params.stopId, {
      status: body.status,
      notes: body.notes,
      failureReason: body.failure_reason,
      userId: req.userData.id,
      permissions: perms,
    })
    res.json({ ok: true, data: { route: updated }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.post('/exceptions/:id/ignore', requirePermission('FULFILLMENT_MANAGE'), async (req, res) => {
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
      `UPDATE fulfillment_exceptions
         SET status = 'ignored', resolved_by = $1, resolved_at = now(), updated_at = now()
         WHERE id = $2 AND supplier_id = $3
         RETURNING *`,
      [req.userData.id, req.params.id, supplierId]
    )
    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Exception not found' },
        requestId: req.requestId,
      })
    }
    res.json({
      ok: true,
      data: { exception: rows[0] },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Ignore fulfillment exception error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to ignore exception' },
      requestId: req.requestId,
    })
  }
})

export { router as fulfillmentRoutes }
