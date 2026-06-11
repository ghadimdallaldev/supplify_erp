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
      const { warehouse_id: warehouseId, notes } = req.body
      const { rows: existing } = await query(
        `SELECT * FROM order_warehouse_assignment WHERE id = $1 AND order_id = $2`,
        [req.params.assignmentId, req.params.id]
      )
      if (!existing.length) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: 'Assignment not found' },
          requestId: req.requestId,
        })
      }
      if (!['pending', 'picking'].includes(existing[0].status)) {
        return res.status(409).json({
          ok: false,
          data: null,
          error: {
            name: 'INVALID_STATUS',
            message: 'Can only reassign while pending or picking',
          },
          requestId: req.requestId,
        })
      }
      const { rows } = await query(
        `UPDATE order_warehouse_assignment
         SET warehouse_id = COALESCE($1, warehouse_id),
             assigned_by = 'manual',
             notes = COALESCE($2, notes),
             assigned_at = now()
         WHERE id = $3 RETURNING *`,
        [warehouseId, notes, req.params.assignmentId]
      )
      res.json({
        ok: true,
        data: { assignment: rows[0] },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Reassign warehouse error:', error)
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
      const { rows } = await query(
        `UPDATE order_warehouse_assignment
         SET status = 'dispatched', dispatched_at = now()
         WHERE id = $1 AND order_id = $2 AND status IN ('pending', 'picking', 'packed')
         RETURNING *`,
        [req.params.assignmentId, req.params.id]
      )
      if (!rows.length) {
        return res.status(409).json({
          ok: false,
          data: null,
          error: { name: 'INVALID_STATUS', message: 'Cannot dispatch this assignment' },
          requestId: req.requestId,
        })
      }
      res.json({
        ok: true,
        data: { assignment: rows[0] },
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
