import express from 'express'
import PDFDocument from 'pdfkit'
import {
  requireAuth,
  requireRole,
  getRequestTenant,
  getRestaurantIdForRequest,
  getSupplierIdForRequest,
  resolveTenantContext,
  requirePermission,
} from '../../lib/rbac.js'
import { query, withTransaction } from '../../lib/db.js'
import { logger } from '../../lib/logger.js'
import { ValidationError, NotFoundError } from '../../middlewares/errorHandler.js'
import {
  DailyUsageLimitExceededError,
  resolveDailyMeterEnforcementFromSubscription,
  getTenantSubscription,
  getRecommendedPlanNames,
  buildLimitExceededPayload,
  isFeatureEnabled,
} from '../../lib/subscription.js'
import { z } from 'zod'
import { notifyOrderStatusChange } from '../../services/notification.service.js'
import {
  applyBestPromotionToOrder,
  hasActiveSupplierOrderPromotions,
} from '../../services/promotions.service.js'
import {
  applyPromotionByIdToOrder,
  validateCouponForOrder,
} from '../../services/deal-promotions.service.js'
import { writeAuditLog } from '../../lib/audit.js'
import { orderAmendmentsRouter } from '../order-amendments.routes.js'
import { ordersDriverRoutes } from '../orders-driver.routes.js'
import { assignWarehousesToOrder } from '../../services/warehouseRouting.js'
import { syncWarehouseFulfillmentOnOrderStatus } from '../../services/warehouseInventory.js'
import { hasPermission } from '../../lib/permissions.js'
import {
  updateDriverDeliveryStatus,
  getSupplierIdForOrder,
  orderHasProofOfDelivery,
} from '../../lib/driver-delivery.js'
import {
  resolveProductPricesBatch,
  getDefaultCatalogPricesBatch,
} from '../../services/resolve-product-price.service.js'
import { createRestaurantOrdersInTransaction } from '../../services/restaurant-order-create.service.js'
import {
  assertAndDeductSupplierStock,
  restoreSupplierStockForOrder,
} from '../../services/supplier-inventory.service.js'
import { ordersRouterMutationGuard } from '../../lib/route-permissions.js'
import { releaseOrderFromPlannedRoutes } from '../../services/delivery-routes.service.js'

import {
  orderCreateSchema,
  supplierOrderCreateSchema,
  deliveryStatusSchema,
  orderUpdateSchema,
  orderListSchema,
} from './orders.helpers.js'

const router = express.Router()

// List orders (role-aware)
router.get('/', async (req, res) => {
  try {
    const params = orderListSchema.parse(req.query)

    const whereConditions = []
    const queryParams = []
    let paramIndex = 1

    // Role-based filtering (respects impersonation)
    const tenant = await getRequestTenant(req)
    if (tenant?.tenantType === 'RESTAURANT') {
      whereConditions.push(`o.restaurant_id = $${paramIndex}`)
      queryParams.push(tenant.tenantId)
      paramIndex++
    } else if (tenant?.tenantType === 'SUPPLIER') {
      whereConditions.push(`EXISTS (
        SELECT 1
        FROM order_item oi_s
        JOIN product p_s ON p_s.id = oi_s.product_id
        WHERE oi_s.order_id = o.id
          AND p_s.supplier_id = $${paramIndex}
      )`)
      queryParams.push(tenant.tenantId)
      paramIndex++
    } else if (req.userData.role === 'RESTAURANT' || req.userData.role === 'SUPPLIER') {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'Restaurant/Supplier record not found for user',
        },
        requestId: req.requestId,
      })
    }
    // Admin with no impersonation sees all orders

    // Status filter
    if (params.status) {
      whereConditions.push(`o.status = $${paramIndex}`)
      queryParams.push(params.status)
      paramIndex++
    }

    if (params.from) {
      const fromDate = new Date(params.from)
      if (!Number.isNaN(fromDate.getTime())) {
        whereConditions.push(`COALESCE(o.placed_at, o.created_at) >= $${paramIndex}`)
        queryParams.push(fromDate.toISOString())
        paramIndex++
      }
    }

    if (params.to) {
      const toDate = new Date(params.to)
      if (!Number.isNaN(toDate.getTime())) {
        toDate.setHours(23, 59, 59, 999)
        whereConditions.push(`COALESCE(o.placed_at, o.created_at) <= $${paramIndex}`)
        queryParams.push(toDate.toISOString())
        paramIndex++
      }
    }

    if (params.q?.trim()) {
      const term = `%${params.q.trim()}%`
      whereConditions.push(`(
        o.id::text ILIKE $${paramIndex}
        OR r.name ILIKE $${paramIndex}
        OR EXISTS (
          SELECT 1
          FROM order_item oi_q
          JOIN product p_q ON p_q.id = oi_q.product_id
          JOIN supplier s_q ON s_q.id = p_q.supplier_id
          WHERE oi_q.order_id = o.id
            AND s_q.name ILIKE $${paramIndex}
        )
      )`)
      queryParams.push(term)
      paramIndex++
    }

    // Supplier filter (for admin when not impersonating)
    if (params.supplier && req.userData.role === 'ADMIN' && !tenant) {
      whereConditions.push(`EXISTS (
        SELECT 1
        FROM order_item oi_a
        JOIN product p_a ON p_a.id = oi_a.product_id
        WHERE oi_a.order_id = o.id
          AND p_a.supplier_id = $${paramIndex}
      )`)
      queryParams.push(params.supplier)
      paramIndex++
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''

    // Supplier/search filters use EXISTS (no DISTINCT + item joins).
    const sql = `
      SELECT
        o.*,
        r.name as restaurant_name,
        r.slug as restaurant_slug
      FROM customer_order o
      JOIN restaurant r ON r.id = o.restaurant_id
      ${whereClause}
      ORDER BY o.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `

    queryParams.push(params.limit, params.offset)

    const countSql = `
      SELECT COUNT(*)::int as total
      FROM customer_order o
      JOIN restaurant r ON r.id = o.restaurant_id
      ${whereClause}
    `
    const countParams = queryParams.slice(0, -2) // Remove limit and offset

    // Main list and count are independent — run in parallel.
    const [{ rows }, { rows: countRows }] = await Promise.all([
      query(sql, queryParams),
      query(countSql, countParams),
    ])

    let ordersWithItems = rows
    if (params.includeItems) {
      // Fetch items for all orders in a single batch query.
      const orderIds = rows.map((order) => order.id)
      let items = []
      if (orderIds.length > 0) {
        try {
          const { rows: itemsRows } = await query(
            `
            SELECT
              oi.*,
              p.name as product_name,
              p.sku as product_sku
            FROM order_item oi
            JOIN product p ON p.id = oi.product_id
            WHERE oi.order_id = ANY($1)
          `,
            [orderIds]
          )

          items = itemsRows
        } catch (itemError) {
          logger.error({
            message: 'Failed to fetch order items',
            error: itemError.message,
            stack: itemError.stack,
          })
          // Continue without items if query fails
        }
      }

      // Group items by order_id
      const itemsByOrder = {}
      items.forEach((item) => {
        if (!itemsByOrder[item.order_id]) {
          itemsByOrder[item.order_id] = []
        }
        itemsByOrder[item.order_id].push(item)
      })

      // Attach items to each order
      ordersWithItems = rows.map((order) => ({
        ...order,
        items: itemsByOrder[order.id] || [],
      }))
    }

    res.json({
      ok: true,
      data: {
        orders: ordersWithItems,
        pagination: {
          total: parseInt(countRows[0].total),
          limit: params.limit,
          offset: params.offset,
        },
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: error.errors,
        },
        requestId: req.requestId,
      })
    }

    logger.error({
      message: 'List orders error',
      error: error.message,
      stack: error.stack,
    })
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to list orders',
        details: error.message,
      },
      requestId: req.requestId,
    })
  }
})

router.use('/:orderId/amendments', orderAmendmentsRouter)

export default router
