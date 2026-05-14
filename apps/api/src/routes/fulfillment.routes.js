import express from 'express'
import { requireAuth, requireRole, resolveTenantContext, getRequestTenant } from '../lib/rbac.js'
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'

const router = express.Router()

router.use(requireAuth, resolveTenantContext, requireRole(['SUPPLIER', 'ADMIN']))

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

async function loadStopsForRoutes(routeIds) {
  if (!routeIds.length) return new Map()
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
    WHERE rs.route_id = ANY($1::uuid[])
    ORDER BY rs.route_id, rs.sequence_number
    `,
    [routeIds]
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
          )
        ORDER BY o.id, o.created_at DESC
        `,
        [supplierId]
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
    const stopsByRoute = await loadStopsForRoutes(routeIds)

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

router.get('/waves', async (req, res) => {
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
      `
      SELECT
        dw.id,
        dw.wave_number,
        dw.scheduled_date,
        dw.status,
        COUNT(pl.id)::int AS order_count
      FROM delivery_wave dw
      LEFT JOIN pick_list pl ON pl.wave_id = dw.id
      WHERE dw.supplier_id = $1
      GROUP BY dw.id
      ORDER BY dw.scheduled_date DESC, dw.wave_number
      `,
      [supplierId]
    )

    res.json({
      ok: true,
      data: {
        waves: rows.map((row) => ({
          id: row.id,
          waveNumber: row.wave_number,
          scheduledDate: row.scheduled_date,
          status: row.status,
          orderCount: row.order_count ?? 0,
        })),
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Get fulfillment waves error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to load delivery waves' },
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
      WHERE dr.supplier_id = $1
      GROUP BY dr.id
      ORDER BY dr.scheduled_date DESC, dr.route_number
      `,
      [supplierId]
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

    const { rows } = await query(
      `
      SELECT
        de.id,
        de.order_id,
        de.exception_type,
        de.quantity_expected,
        de.quantity_actual,
        de.damage_description,
        de.notes,
        de.created_at,
        p.name AS product_name
      FROM delivery_exception de
      JOIN customer_order o ON o.id = de.order_id
      JOIN order_item oi ON oi.order_id = o.id AND oi.supplier_id = $1
      LEFT JOIN product p ON p.id = de.product_id
      WHERE EXISTS (
        SELECT 1 FROM order_item oi2
        WHERE oi2.order_id = de.order_id AND oi2.supplier_id = $1
      )
      ORDER BY de.created_at DESC
      LIMIT 100
      `,
      [supplierId]
    )

    res.json({
      ok: true,
      data: {
        exceptions: rows.map((row) => ({
          id: row.id,
          orderId: row.order_id,
          orderLabel: row.order_id.slice(0, 8).toUpperCase(),
          exceptionType: row.exception_type,
          productName: row.product_name,
          quantityExpected: row.quantity_expected != null ? parseFloat(row.quantity_expected) : null,
          quantityActual: row.quantity_actual != null ? parseFloat(row.quantity_actual) : null,
          damageDescription: row.damage_description,
          notes: row.notes,
          createdAt: row.created_at,
        })),
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Get fulfillment exceptions error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to load delivery exceptions' },
      requestId: req.requestId,
    })
  }
})

export { router as fulfillmentRoutes }
