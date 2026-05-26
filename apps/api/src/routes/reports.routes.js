import express from 'express'
import { requireAuth, requireRole, resolveTenantContext, requirePermission } from '../lib/rbac.js'
import { requireFeature } from '../lib/subscription.js'
import { query } from '../lib/db.js'
import { requireRestaurantId, requireSupplierId } from '../lib/tenant-resolve.js'
import { logger } from '../lib/logger.js'
import { ValidationError } from '../middlewares/errorHandler.js'
import { parseReportQuery } from '../services/reports.service.js'
import * as reports from '../services/reports.service.js'

const router = express.Router()

const reportsFeature = requireFeature(
  'reports',
  (req) => req.tenantContext?.tenantId,
  (req) => req.tenantContext?.tenantType
)

const wasteFeature = requireFeature(
  'waste_tracking',
  (req) => req.tenantContext?.tenantId,
  (req) => req.tenantContext?.tenantType
)

router.use(requireAuth, resolveTenantContext, reportsFeature, requirePermission('ORDERS_VIEW'))

function sendReport(res, result, requestId) {
  res.json({
    ok: true,
    data: result.data,
    meta: result.meta,
    error: null,
    requestId,
  })
}

const handle = (fn) => async (req, res) => {
  try {
    const params = parseReportQuery(req.query)
    const result = await fn(req, params)
    sendReport(res, result, req.requestId)
  } catch (error) {
    logger.error('Reports route error', { error: error.message, path: req.path })
    const status = error.statusCode || (error.name === 'ValidationError' ? 400 : 500)
    res.status(status).json({
      ok: false,
      data: null,
      meta: null,
      error: { name: error.name || 'ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
}

// Restaurant reports
router.get(
  '/restaurant/spend-by-supplier',
  requireRole(['RESTAURANT', 'ADMIN']),
  handle(async (req, params) => {
    const restaurantId = await requireRestaurantId(req)
    return reports.restaurantSpendBySupplier(restaurantId, params)
  })
)

router.get(
  '/restaurant/spend-by-category',
  requireRole(['RESTAURANT', 'ADMIN']),
  handle(async (req, params) => {
    const restaurantId = await requireRestaurantId(req)
    return reports.restaurantSpendByCategory(restaurantId, params)
  })
)

router.get(
  '/restaurant/order-volume',
  requireRole(['RESTAURANT', 'ADMIN']),
  handle(async (req, params) => {
    const restaurantId = await requireRestaurantId(req)
    return reports.restaurantOrderVolume(restaurantId, params)
  })
)

router.get(
  '/restaurant/cogs-trend',
  requireRole(['RESTAURANT', 'ADMIN']),
  handle(async (req, params) => {
    const restaurantId = await requireRestaurantId(req)
    return reports.restaurantCogsTrend(restaurantId, params)
  })
)

router.get(
  '/restaurant/top-products',
  requireRole(['RESTAURANT', 'ADMIN']),
  handle(async (req, params) => {
    const restaurantId = await requireRestaurantId(req)
    return reports.restaurantTopProducts(restaurantId, params)
  })
)

router.get(
  '/restaurant/receiving-quality',
  requireRole(['RESTAURANT', 'ADMIN']),
  handle(async (req, params) => {
    const restaurantId = await requireRestaurantId(req)
    return reports.restaurantReceivingQuality(restaurantId, params)
  })
)

router.get(
  '/restaurant/waste',
  requireRole(['RESTAURANT', 'ADMIN']),
  wasteFeature,
  handle(async (req, params) => {
    const restaurantId = await requireRestaurantId(req)
    return reports.restaurantWaste(restaurantId, params)
  })
)

router.get(
  '/restaurant/invoice-aging',
  requireRole(['RESTAURANT', 'ADMIN']),
  handle(async (req, params) => {
    const restaurantId = await requireRestaurantId(req)
    return reports.restaurantInvoiceAging(restaurantId, params)
  })
)

// Supplier reports
router.get(
  '/supplier/revenue-trend',
  requireRole(['SUPPLIER', 'ADMIN']),
  handle(async (req, params) => {
    const supplierId = await requireSupplierId(req)
    return reports.supplierRevenueTrend(supplierId, params)
  })
)

router.get(
  '/supplier/top-restaurants',
  requireRole(['SUPPLIER', 'ADMIN']),
  handle(async (req, params) => {
    const supplierId = await requireSupplierId(req)
    return reports.supplierTopRestaurants(supplierId, params)
  })
)

router.get(
  '/supplier/top-products',
  requireRole(['SUPPLIER', 'ADMIN']),
  handle(async (req, params) => {
    const supplierId = await requireSupplierId(req)
    return reports.supplierTopProducts(supplierId, params)
  })
)

router.get(
  '/supplier/fulfillment-performance',
  requireRole(['SUPPLIER', 'ADMIN']),
  handle(async (req, params) => {
    const supplierId = await requireSupplierId(req)
    return reports.supplierFulfillmentPerformance(supplierId, params)
  })
)

router.get(
  '/supplier/order-volume',
  requireRole(['SUPPLIER', 'ADMIN']),
  handle(async (req, params) => {
    const supplierId = await requireSupplierId(req)
    const bucket = reports.dateBucketExpression('co.placed_at', params.granularity)
    const { rows } = await query(
      `
      SELECT
        ${bucket} AS period,
        COUNT(DISTINCT co.id)::int AS order_count
      FROM customer_order co
      WHERE EXISTS (
        SELECT 1 FROM order_item oi WHERE oi.order_id = co.id AND oi.supplier_id = $1
      )
        AND co.placed_at >= $2
        AND co.placed_at <= $3
        AND co.status NOT IN ('DRAFT', 'CANCELLED')
      GROUP BY period
      ORDER BY period
      `,
      [supplierId, params.from, params.to]
    )
    return {
      data: rows,
      meta: {
        from: params.from.toISOString().slice(0, 10),
        to: params.to.toISOString().slice(0, 10),
        granularity: params.granularity,
        rowCount: rows.length,
      },
    }
  })
)

router.get(
  '/supplier/invoice-collection',
  requireRole(['SUPPLIER', 'ADMIN']),
  handle(async (req, params) => {
    const supplierId = await requireSupplierId(req)
    return reports.supplierInvoiceCollection(supplierId, params)
  })
)

export { router as reportsRoutes }
