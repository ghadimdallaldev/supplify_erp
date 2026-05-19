import express from 'express'
import {
  requireAuth,
  requireRole,
  resolveTenantContext,
  getRequestTenant,
  requirePermission,
} from '../lib/rbac.js'
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { isFeatureEnabled, requireFeature } from '../lib/subscription.js'
import { isMultiWarehouseFulfillmentActive } from '../lib/warehouse-helpers.js'
import { z } from 'zod'

const router = express.Router()

const fulfillmentFeature = requireFeature(
  'fulfillment',
  (req) => req.tenantContext?.tenantId,
  (req) => req.tenantContext?.tenantType || 'SUPPLIER'
)

router.use(
  requireAuth,
  resolveTenantContext,
  requireRole(['SUPPLIER', 'ADMIN']),
  requirePermission('FULFILLMENT_VIEW'),
  fulfillmentFeature
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

    const whFilter = await warehouseFilterClause(req, supplierId, 2)
    const routeParams = [supplierId, ...whFilter.params]
    const routeWarehouseClause = whFilter.warehouseId
      ? ` AND EXISTS (
          SELECT 1 FROM route_stop rs2
          JOIN order_warehouse_assignment owa ON owa.order_id = rs2.order_id
          WHERE rs2.route_id = dr.id AND owa.warehouse_id = $2
        )`
      : ''

    const { rows } = await query(
      `
      SELECT
        dr.id,
        dr.route_number,
        dr.driver_name,
        dr.vehicle_info,
        dr.status,
        dr.scheduled_date,
        COUNT(rs.id)::int AS stops
      FROM delivery_route dr
      LEFT JOIN route_stop rs ON rs.route_id = dr.id
      WHERE dr.supplier_id = $1${routeWarehouseClause}
      GROUP BY dr.id
      ORDER BY dr.scheduled_date DESC, dr.route_number
      `,
      routeParams
    )

    res.json({
      ok: true,
      data: {
        routes: rows.map((row) => ({
          id: row.id,
          routeNumber: row.route_number,
          driver: row.driver_name || 'Unassigned',
          vehicle: row.vehicle_info || '—',
          status: row.status,
          stops: row.stops ?? 0,
          scheduledDate: row.scheduled_date,
        })),
      },
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
  return {
    id: row.id,
    status: row.order_status,
    total_amount: parseFloat(row.total_amount) || 0,
    created_at: row.created_at,
    restaurant_name: row.restaurant_name,
    item_count: row.item_count ?? 0,
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

    const whFilter = await warehouseFilterClause(req, supplierId, 2)
    const params = [supplierId, ...whFilter.params]

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
        EXISTS (SELECT 1 FROM proof_of_delivery pod WHERE pod.order_id = o.id) AS has_pod
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
      WHERE o.status IN ('ACKNOWLEDGED', 'PROCESSING', 'SHIPPED', 'COMPLETED')
        ${whFilter.clause}
    `

    const [
      { rows: unassigned },
      { rows: assigned },
      { rows: outForDelivery },
      { rows: deliveredToday },
    ] = await Promise.all([
      query(
        `${baseSelect}
           AND (da.id IS NULL OR da.status IN ('failed'))
           AND o.status IN ('ACKNOWLEDGED', 'PROCESSING', 'SHIPPED')
           ORDER BY o.id, o.created_at DESC`,
        params
      ),
      query(
        `${baseSelect}
           AND da.status = 'assigned'
           ORDER BY o.id, da.assigned_at DESC`,
        params
      ),
      query(
        `${baseSelect}
           AND da.status IN ('picked_up', 'out_for_delivery')
           ORDER BY o.id, da.updated_at DESC`,
        params
      ),
      query(
        `${baseSelect}
           AND da.status = 'delivered'
           AND da.delivered_at >= date_trunc('day', now())
           ORDER BY o.id, da.delivered_at DESC`,
        params
      ),
    ])

    res.json({
      ok: true,
      data: {
        pending: unassigned.map(mapDispatchOrder),
        assigned: assigned.map(mapDispatchOrder),
        out_for_delivery: outForDelivery.map(mapDispatchOrder),
        delivered_today: deliveredToday.map(mapDispatchOrder),
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
