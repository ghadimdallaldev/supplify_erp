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
import {
  syncWarehouseFulfillmentOnOrderStatus,
  commitDispatchInventoryForAssignment,
  reassignOrderWarehouseAssignment,
} from '../../services/warehouseInventory.js'
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

// Order warehouse assignments (no extra feature gate — exists in single-warehouse mode too)
router.get('/:id/warehouses', async (req, res, next) => {
  try {
    const { id } = req.params
    const { rows: orders } = await query(`SELECT restaurant_id FROM customer_order WHERE id = $1`, [
      id,
    ])
    if (!orders.length) throw new NotFoundError('Order not found')

    const tenant = await getRequestTenant(req)
    if (tenant?.tenantType === 'RESTAURANT' && orders[0].restaurant_id !== tenant.tenantId) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Access denied' },
        requestId: req.requestId,
      })
    }

    const assignments = await loadOrderWarehouseAssignments(id)
    res.json({
      ok: true,
      data: { assignments, multiLocation: assignments.some((a) => a.order_item_id != null) },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    if (error instanceof NotFoundError) return next(error)
    logger.error('Get order warehouses error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to get warehouse assignments' },
      requestId: req.requestId,
    })
  }
})

router.patch(
  '/:id/warehouses/:assignmentId',
  requireRole(['SUPPLIER']),
  requirePermission('ORDERS_MANAGE'),
  async (req, res) => {
    try {
      const orderId = req.params.id
      const assignmentId = req.params.assignmentId
      const newWarehouseId = req.body?.warehouse_id ?? req.body?.warehouseId
      if (!newWarehouseId) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: { name: 'VALIDATION_ERROR', message: 'warehouse_id is required' },
          requestId: req.requestId,
        })
      }

      const supplierId = await getSupplierIdForRequest(req)
      if (!supplierId) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: { name: 'FORBIDDEN', message: 'Supplier not found' },
          requestId: req.requestId,
        })
      }

      const { rows: orderRows } = await query(
        `SELECT 1 FROM customer_order o
         JOIN order_item oi ON oi.order_id = o.id AND oi.supplier_id = $1
         WHERE o.id = $2
         LIMIT 1`,
        [supplierId, orderId]
      )
      if (!orderRows.length) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: 'Order not found' },
          requestId: req.requestId,
        })
      }

      const assignment = await withTransaction(async (client) => {
        return reassignOrderWarehouseAssignment(client, {
          orderId,
          assignmentId,
          newWarehouseId,
          supplierId,
          assignedBy: req.userData?.id || 'manual',
        })
      })

      if (!assignment) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: 'Warehouse assignment not found' },
          requestId: req.requestId,
        })
      }

      res.json({
        ok: true,
        data: { assignment },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      if (error?.code === 'INVALID_STATUS') {
        return res.status(409).json({
          ok: false,
          data: null,
          error: { name: 'INVALID_STATUS', message: error.message },
          requestId: req.requestId,
        })
      }
      if (error?.code === 'WAREHOUSE_NOT_FOUND') {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'WAREHOUSE_NOT_FOUND', message: error.message },
          requestId: req.requestId,
        })
      }
      if (String(error?.message || '').includes('Insufficient stock')) {
        return res.status(409).json({
          ok: false,
          data: null,
          error: { name: 'INSUFFICIENT_STOCK', message: error.message },
          requestId: req.requestId,
        })
      }
      logger.error('Reassign warehouse assignment error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to reassign warehouse' },
        requestId: req.requestId,
      })
    }
  }
)
router.post(
  '/:id/warehouses/:assignmentId/dispatch',
  requireRole(['SUPPLIER']),
  requirePermission('ORDERS_MANAGE'),
  async (req, res) => {
    try {
      const supplierId = await getSupplierIdForRequest(req)
      if (!supplierId) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: { name: 'FORBIDDEN', message: 'Supplier not found' },
          requestId: req.requestId,
        })
      }

      const { rows: orderRows } = await query(
        `SELECT 1 FROM customer_order o
         JOIN order_item oi ON oi.order_id = o.id AND oi.supplier_id = $1
         WHERE o.id = $2
         LIMIT 1`,
        [supplierId, req.params.id]
      )
      if (!orderRows.length) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: 'Order not found' },
          requestId: req.requestId,
        })
      }

      const assignment = await withTransaction(async (client) => {
        return commitDispatchInventoryForAssignment(client, req.params.id, req.params.assignmentId)
      })
      if (!assignment) {
        return res.status(409).json({
          ok: false,
          data: null,
          error: { name: 'INVALID_STATUS', message: 'Cannot dispatch this assignment' },
          requestId: req.requestId,
        })
      }
      res.json({
        ok: true,
        data: { assignment },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Dispatch warehouse assignment error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to dispatch' },
        requestId: req.requestId,
      })
    }
  }
)

export default router
