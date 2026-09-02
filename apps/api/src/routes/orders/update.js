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
  scheduleOrderStatusNotification,
  scheduleOrderPlacedNotification,
  handleOrderDelivery,
} from './orders.helpers.js'
import { scheduleOrdersCalendarCacheInvalidation } from '../../lib/orders-calendar-cache.js'
import { invalidateDashboardSummaryCache } from '../../services/dashboard-summary.service.js'

const router = express.Router()

router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params
    logger.info('Order update request', {
      id,
      body: req.body,
      contentType: req.headers['content-type'],
    })
    let updateData
    try {
      updateData = orderUpdateSchema.parse(req.body)
    } catch (validationError) {
      logger.error('Validation error', {
        error: validationError.message,
        errors: validationError.errors?.map((e) => ({ path: e.path, message: e.message })),
      })
      throw validationError
    }

    // Get order
    const { rows: orders } = await query(
      `
      SELECT * FROM customer_order WHERE id = $1
    `,
      [id]
    )

    if (orders.length === 0) {
      throw new NotFoundError('Order not found')
    }

    const order = orders[0]

    if (updateData.delivery_status) {
      if (!hasPermission(req.tenantContext?.permissions ?? [], 'FULFILLMENT_MANAGE')) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: {
            name: 'FORBIDDEN',
            message: 'Missing permission: FULFILLMENT_MANAGE',
          },
          requestId: req.requestId,
        })
      }
      const supplierId = (await getSupplierIdForRequest(req)) || (await getSupplierIdForOrder(id))
      if (!supplierId) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: { name: 'FORBIDDEN', message: 'Supplier not found' },
          requestId: req.requestId,
        })
      }
      const assignment = await updateDriverDeliveryStatus({
        orderId: id,
        supplierId,
        status: updateData.delivery_status,
        notes: updateData.notes,
        failureReason: updateData.failure_reason,
        actorUserId: req.userData.id,
      })
      const { rows: refreshed } = await query(`SELECT * FROM customer_order WHERE id = $1`, [id])
      const hasPod = await orderHasProofOfDelivery(id)
      return res.json({
        ok: true,
        data: {
          order: refreshed[0],
          assignment,
          podRequired: updateData.delivery_status === 'delivered',
          hasPod,
        },
        error: null,
        requestId: req.requestId,
      })
    }

    // Get supplier_id from order items (first item's supplier)
    const { rows: firstItem } = await query(
      `
      SELECT supplier_id FROM order_item WHERE order_id = $1 LIMIT 1
    `,
      [id]
    )

    const supplier_id = firstItem.length > 0 ? firstItem[0].supplier_id : null

    // Add supplier_id to order object for notification logic
    order.supplier_id = supplier_id

    // Check permissions based on role and status transition
    if (req.userData.role === 'RESTAURANT') {
      // Restaurants can only cancel their own orders
      if (updateData.status && updateData.status !== 'CANCELLED') {
        return res.status(403).json({
          ok: false,
          data: null,
          error: {
            name: 'FORBIDDEN',
            message: 'Restaurants can only cancel orders',
          },
          requestId: req.requestId,
        })
      }

      const restaurantId = await getRestaurantIdForRequest(req)
      if (!restaurantId || restaurantId !== order.restaurant_id) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: {
            name: 'FORBIDDEN',
            message: 'Access denied',
          },
          requestId: req.requestId,
        })
      }
    } else if (req.userData.role === 'SUPPLIER') {
      const supplierPerms = req.tenantContext?.permissions ?? []
      const supplierId = await getSupplierIdForRequest(req)
      if (!supplierId || supplierId !== supplier_id) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: {
            name: 'FORBIDDEN',
            message: 'Access denied',
          },
          requestId: req.requestId,
        })
      }

      if (updateData.status === 'CANCELLED') {
        if (!hasPermission(supplierPerms, 'ORDERS_MANAGE')) {
          return res.status(403).json({
            ok: false,
            data: null,
            error: {
              name: 'FORBIDDEN',
              message: 'Missing permission: ORDERS_MANAGE',
            },
            requestId: req.requestId,
          })
        }
        const declineReason = (updateData.decline_reason || updateData.cancel_reason || '').trim()
        if (declineReason.length < 3) {
          return res.status(400).json({
            ok: false,
            data: null,
            error: {
              name: 'DECLINE_REASON_REQUIRED',
              message: 'A reason is required when declining an order (at least 3 characters).',
            },
            requestId: req.requestId,
          })
        }
        updateData.cancel_reason = declineReason
      } else if (!hasPermission(supplierPerms, 'ORDERS_EDIT')) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: {
            name: 'FORBIDDEN',
            message: 'Missing permission: ORDERS_EDIT',
          },
          requestId: req.requestId,
        })
      } else if (
        updateData.status &&
        !['ACKNOWLEDGED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'COMPLETED'].includes(
          updateData.status
        )
      ) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: {
            name: 'FORBIDDEN',
            message: 'Suppliers can only confirm, fulfill, deliver, or decline orders',
          },
          requestId: req.requestId,
        })
      }

      // Legacy COMPLETED → DELIVERED only (inventory applies on receiving)
      if (updateData.status === 'COMPLETED') {
        return await handleOrderDelivery(id, req.userData, res, req)
      }
    }

    // Build update query
    const updateFields = []
    const updateValues = []
    let paramIndex = 1

    if (updateData.status) {
      updateFields.push(`status = $${paramIndex}`)
      updateValues.push(updateData.status)
      paramIndex++
    }

    if (updateData.status === 'CANCELLED' && updateData.status !== order.status) {
      const cancelledBy = req.userData.role === 'SUPPLIER' ? 'SUPPLIER' : 'RESTAURANT'
      const cancelReason =
        (updateData.cancel_reason || updateData.decline_reason || updateData.notes || '').trim() ||
        null

      updateFields.push(`cancelled_by = $${paramIndex}`)
      updateValues.push(cancelledBy)
      paramIndex++

      if (cancelReason) {
        updateFields.push(`cancel_reason = $${paramIndex}`)
        updateValues.push(cancelReason)
        paramIndex++
      }
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'No fields to update',
        },
        requestId: req.requestId,
      })
    }

    updateFields.push(`updated_at = now()`)

    // Now add the WHERE clause with the order id
    updateValues.push(id)

    const rows = await withTransaction(async (client) => {
      const { rows: updated } = await client.query(
        `
        UPDATE customer_order
        SET ${updateFields.join(', ')}
        WHERE id = $${updateValues.length}
        RETURNING *
      `,
        updateValues
      )

      if (updateData.status && updateData.status !== order.status) {
        await syncWarehouseFulfillmentOnOrderStatus(client, id, updateData.status, order.status)
      }

      // Unified release: WH-assigned → release reservations; legacy-only → restore inventory.
      // syncWarehouse already releases WH on CANCELLED/REJECTED (idempotent).
      if (
        (updateData.status === 'CANCELLED' || updateData.status === 'REJECTED') &&
        order.status !== updateData.status
      ) {
        await restoreSupplierStockForOrder(client, id)
      }

      return updated
    })

    logger.info('Order updated', {
      orderId: rows[0].id,
      status: rows[0].status,
      actor: req.userData.id,
    })

    if (updateData.status === 'CANCELLED' && order.status !== 'CANCELLED' && order.supplier_id) {
      void releaseOrderFromPlannedRoutes(id, order.supplier_id).catch((error) => {
        logger.warn({
          event: 'order.route_release.background_failed',
          orderId: id,
          supplierId: order.supplier_id,
          error: error?.message,
        })
      })
    }

    if (updateData.status && updateData.status !== order.status) {
      scheduleOrderStatusNotification(rows[0], updateData.status, order.supplier_id)
    }

    if (updateData.status && updateData.status !== order.status) {
      scheduleOrdersCalendarCacheInvalidation([rows[0].restaurant_id, order.supplier_id], {
        reason: 'order.updated',
        requestId: req.requestId,
      })
      void invalidateDashboardSummaryCache([
        { tenantType: 'RESTAURANT', tenantId: rows[0].restaurant_id },
        { tenantType: 'SUPPLIER', tenantId: order.supplier_id },
      ])
    }

    res.json({
      ok: true,
      data: { order: rows[0] },
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
          message: 'Invalid update data',
          details: error.errors,
        },
        requestId: req.requestId,
      })
    }

    logger.error('Update order error', { error: error.message, code: error.code })
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to update order',
        details: error.message,
      },
      requestId: req.requestId,
    })
  }
})

export default router
