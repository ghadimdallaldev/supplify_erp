import express from 'express'
import { requireAuth, requireRole, resolveTenantContext, requirePermission } from '../lib/rbac.js'
import { requireFeature } from '../lib/subscription.js'
import { query } from '../lib/db.js'
import { requireRestaurantId, requireSupplierId } from '../lib/tenant-resolve.js'
import { logger } from '../lib/logger.js'
import { ValidationError } from '../middlewares/errorHandler.js'
import { parseReportQuery } from '../services/reports.service.js'
import * as reports from '../services/reports.service.js'
import { getRestaurantTimezone, getSupplierTimezone } from '../lib/tenant-timezone.js'
import { assertLegacyBranchOwnedByRestaurant } from '../lib/branch-scope.js'

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

const handle = (fn, zoneFor) => async (req, res) => {
  try {
    const timeZone = zoneFor ? await zoneFor(req) : null
    const params = parseReportQuery(req.query, timeZone ? { timeZone } : {})
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

function restaurantReport(fn) {
  return handle(
    async (req, params) => {
      const restaurantId = await requireRestaurantId(req)
      await assertLegacyBranchOwnedByRestaurant(params.branchId, restaurantId)
      return fn(restaurantId, params)
    },
    async (req) => getRestaurantTimezone(await requireRestaurantId(req))
  )
}

async function supplierZone(req) {
  return getSupplierTimezone(await requireSupplierId(req))
}

// Restaurant reports
router.get(
  '/restaurant/spend-by-supplier',
  requireRole(['RESTAURANT', 'ADMIN']),
  restaurantReport((restaurantId, params) =>
    reports.restaurantSpendBySupplier(restaurantId, params)
  )
)

router.get(
  '/restaurant/spend-by-category',
  requireRole(['RESTAURANT', 'ADMIN']),
  restaurantReport((restaurantId, params) =>
    reports.restaurantSpendByCategory(restaurantId, params)
  )
)

router.get(
  '/restaurant/order-volume',
  requireRole(['RESTAURANT', 'ADMIN']),
  restaurantReport((restaurantId, params) => reports.restaurantOrderVolume(restaurantId, params))
)

router.get(
  '/restaurant/cogs-trend',
  requireRole(['RESTAURANT', 'ADMIN']),
  restaurantReport((restaurantId, params) => reports.restaurantCogsTrend(restaurantId, params))
)

router.get(
  '/restaurant/top-products',
  requireRole(['RESTAURANT', 'ADMIN']),
  restaurantReport((restaurantId, params) => reports.restaurantTopProducts(restaurantId, params))
)

router.get(
  '/restaurant/receiving-quality',
  requireRole(['RESTAURANT', 'ADMIN']),
  requirePermission('RECEIVING_VIEW'),
  restaurantReport((restaurantId, params) =>
    reports.restaurantReceivingQuality(restaurantId, params)
  )
)

router.get(
  '/restaurant/waste',
  requireRole(['RESTAURANT', 'ADMIN']),
  wasteFeature,
  restaurantReport((restaurantId, params) => reports.restaurantWaste(restaurantId, params))
)

router.get(
  '/restaurant/invoice-aging',
  requireRole(['RESTAURANT', 'ADMIN']),
  requirePermission('INVOICES_VIEW'),
  restaurantReport((restaurantId, params) => reports.restaurantInvoiceAging(restaurantId, params))
)

// Supplier reports
router.get(
  '/supplier/revenue-trend',
  requireRole(['SUPPLIER', 'ADMIN']),
  handle(async (req, params) => {
    const supplierId = await requireSupplierId(req)
    return reports.supplierRevenueTrend(supplierId, params)
  }, supplierZone)
)

router.get(
  '/supplier/top-restaurants',
  requireRole(['SUPPLIER', 'ADMIN']),
  handle(async (req, params) => {
    const supplierId = await requireSupplierId(req)
    return reports.supplierTopRestaurants(supplierId, params)
  }, supplierZone)
)

router.get(
  '/supplier/top-products',
  requireRole(['SUPPLIER', 'ADMIN']),
  handle(async (req, params) => {
    const supplierId = await requireSupplierId(req)
    return reports.supplierTopProducts(supplierId, params)
  }, supplierZone)
)

router.get(
  '/supplier/fulfillment-performance',
  requireRole(['SUPPLIER', 'ADMIN']),
  handle(async (req, params) => {
    const supplierId = await requireSupplierId(req)
    return reports.supplierFulfillmentPerformance(supplierId, params)
  }, supplierZone)
)

router.get(
  '/supplier/order-volume',
  requireRole(['SUPPLIER', 'ADMIN']),
  handle(async (req, params) => {
    const supplierId = await requireSupplierId(req)
    const bucket = reports.dateBucketExpression('co.placed_at', params.granularity, params.timeZone)
    const { rows } = await query(
      `
      SELECT
        ${bucket} AS period,
        co.currency,
        COUNT(DISTINCT co.id)::int AS order_count,
        COALESCE(SUM(oi.line_total), 0)::numeric AS total_amount
      FROM customer_order co
      JOIN order_item oi ON oi.order_id = co.id AND oi.supplier_id = $1
      WHERE co.placed_at >= $2
        AND co.placed_at <= $3
        AND co.status NOT IN ('DRAFT', 'CANCELLED', 'PENDING_APPROVAL')
      GROUP BY period, co.currency
      ORDER BY period
      `,
      [supplierId, params.from, params.to]
    )
    return {
      data: rows,
      meta: {
        from: params.fromDate || reports.formatReportDate(params.from),
        to: params.toDate || reports.formatReportDate(params.to),
        granularity: params.granularity,
        rowCount: rows.length,
      },
    }
  }, supplierZone)
)

router.get(
  '/supplier/invoice-collection',
  requireRole(['SUPPLIER', 'ADMIN']),
  requirePermission('INVOICES_VIEW'),
  handle(async (req, params) => {
    const supplierId = await requireSupplierId(req)
    return reports.supplierInvoiceCollection(supplierId, params)
  }, supplierZone)
)

export { router as reportsRoutes }
