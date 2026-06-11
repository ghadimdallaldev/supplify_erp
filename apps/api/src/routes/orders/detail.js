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
import { loadOrderWarehouseAssignments } from './orders.helpers.js'

const router = express.Router()

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params

    // Get order with items
    const { rows: orders } = await query(
      `
      SELECT 
        o.*,
        r.name as restaurant_name,
        r.slug as restaurant_slug,
        r.address_json as restaurant_address,
        r.delivery_instructions as restaurant_delivery_instructions,
        r.phone as restaurant_phone,
        r.operating_hours as restaurant_operating_hours,
        b.name as branch_name,
        b.address_json as branch_address,
        b.delivery_instructions as branch_delivery_instructions,
        b.phone as branch_phone
      FROM customer_order o
      JOIN restaurant r ON r.id = o.restaurant_id
      LEFT JOIN branch b ON b.id = o.branch_id
      WHERE o.id = $1
    `,
      [id]
    )

    if (orders.length === 0) {
      throw new NotFoundError('Order not found')
    }

    const order = orders[0]

    // Check access permissions (respects impersonation)
    const tenant = await getRequestTenant(req)
    if (tenant?.tenantType === 'RESTAURANT') {
      if (order.restaurant_id !== tenant.tenantId) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: { name: 'FORBIDDEN', message: 'Access denied' },
          requestId: req.requestId,
        })
      }
    } else if (tenant?.tenantType === 'SUPPLIER') {
      const { rows: supplierItems } = await query(
        `SELECT 1 FROM order_item WHERE order_id = $1 AND supplier_id = $2 LIMIT 1`,
        [id, tenant.tenantId]
      )
      if (supplierItems.length === 0) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: { name: 'FORBIDDEN', message: 'Access denied' },
          requestId: req.requestId,
        })
      }
    } else if (req.userData.role === 'RESTAURANT') {
      const restaurantId = await getRestaurantIdForRequest(req)
      if (!restaurantId || restaurantId !== order.restaurant_id) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: { name: 'FORBIDDEN', message: 'Access denied' },
          requestId: req.requestId,
        })
      }
    } else if (req.userData.role === 'SUPPLIER') {
      const { rows: supplierItems } = await query(
        `SELECT 1 FROM order_item oi JOIN supplier s ON s.id = oi.supplier_id WHERE oi.order_id = $1 AND s.contact_email = $2 LIMIT 1`,
        [id, req.userData.email]
      )
      if (supplierItems.length === 0) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: { name: 'FORBIDDEN', message: 'Access denied' },
          requestId: req.requestId,
        })
      }
    }

    // Fetch all order detail sub-queries in parallel — none depend on each other.
    const [
      { rows: items },
      warehouseAssignments,
      { rows: promotionRows },
      { rows: replacementOrders },
      { rows: disputeRows },
    ] = await Promise.all([
      query(
        `
        SELECT
          oi.*,
          p.name as product_name,
          p.sku as product_sku,
          s.name as supplier_name,
          s.slug as supplier_slug,
          pick.location_code
        FROM order_item oi
        JOIN product p ON p.id = oi.product_id
        JOIN supplier s ON s.id = oi.supplier_id
        LEFT JOIN LATERAL (
          SELECT pli.location_code
          FROM pick_list pl
          JOIN pick_list_item pli ON pli.pick_list_id = pl.id
          WHERE pl.order_id = oi.order_id
            AND pli.product_id = oi.product_id
          ORDER BY pl.created_at DESC
          LIMIT 1
        ) pick ON true
        WHERE oi.order_id = $1
        ORDER BY s.name, p.name
      `,
        [id]
      ),
      loadOrderWarehouseAssignments(id),
      query(
        `
        SELECT
          pu.promotion_id,
          pu.discount_applied,
          p.name AS promotion_name,
          p.type AS promotion_type
        FROM promotion_usages pu
        JOIN promotions p ON p.id = pu.promotion_id
        WHERE pu.order_id = $1
        LIMIT 1
        `,
        [id]
      ),
      query(
        `
        SELECT id, status, placement_source, source_order_id, source_dispute_id, created_at, total_amount
        FROM customer_order
        WHERE source_order_id = $1
        ORDER BY created_at ASC
        `,
        [id]
      ),
      order.source_dispute_id
        ? query(`SELECT id, status, resolution_type, order_id FROM disputes WHERE id = $1`, [
            order.source_dispute_id,
          ])
        : Promise.resolve({ rows: [] }),
    ])

    const promotionUsage = promotionRows[0]
    const appliedPromotion = promotionUsage
      ? {
          promotionId: promotionUsage.promotion_id,
          promotionName: promotionUsage.promotion_name,
          promotionType: promotionUsage.promotion_type,
          discountAmount: Number(promotionUsage.discount_applied),
        }
      : null

    const sourceDispute = disputeRows[0] || null

    res.json({
      ok: true,
      data: {
        order: {
          ...order,
          items,
          warehouseAssignments,
          multiLocationFulfillment: warehouseAssignments.some((a) => a.order_item_id != null),
          appliedPromotion,
          promotion: appliedPromotion,
          replacementOrders,
          sourceDispute,
        },
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    // Let NotFoundError pass through to error handler (next middleware)
    if (error instanceof NotFoundError) {
      return next(error)
    }
    logger.error('Get order error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get order',
      },
      requestId: req.requestId,
    })
  }
})

export default router
