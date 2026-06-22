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
  requireAnyPermission,
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

import { buildPackingSlipPdf } from './orders.helpers.js'
import { resolveRequestLocale } from '../../i18n/index.js'

const router = express.Router()

router.post(
  '/:id/remind',
  requireAnyPermission('ORDERS_CREATE', 'ORDERS_MANAGE'),
  requireRole(['RESTAURANT', 'ADMIN']),
  async (req, res) => {
    try {
      const { id } = req.params

      // Get order
      const { rows: orders } = await query(
        `
      SELECT o.*, r.name as restaurant_name
      FROM customer_order o
      JOIN restaurant r ON r.id = o.restaurant_id
      WHERE o.id = $1
    `,
        [id]
      )

      if (orders.length === 0) {
        throw new NotFoundError('Order not found')
      }

      const order = orders[0]

      // Verify restaurant ownership (unless admin)
      if (req.userData.role === 'RESTAURANT') {
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
      }

      // Allow reminders for orders that are not completed/cancelled
      if (['COMPLETED', 'CANCELLED'].includes(order.status)) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'VALIDATION_ERROR',
            message: `Cannot send reminder for ${order.status} orders`,
          },
          requestId: req.requestId,
        })
      }

      // Get supplier ID from order items
      const { rows: firstItem } = await query(
        `
      SELECT supplier_id FROM order_item WHERE order_id = $1 LIMIT 1
    `,
        [id]
      )

      if (firstItem.length === 0) {
        throw new NotFoundError('Order items not found')
      }

      const supplierId = firstItem[0].supplier_id

      // Get supplier information
      const { rows: suppliers } = await query(
        `
      SELECT s.id, s.name, s.contact_email, u.id as user_id
      FROM supplier s
      LEFT JOIN app_user u ON u.email = s.contact_email
      WHERE s.id = $1
    `,
        [supplierId]
      )

      if (suppliers.length === 0) {
        throw new NotFoundError('Supplier not found')
      }

      const supplier = suppliers[0]

      if (!supplier.user_id) {
        logger.warn('No user_id found for supplier', { supplier_id: supplierId })
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'VALIDATION_ERROR',
            message: 'Supplier user account not found',
          },
          requestId: req.requestId,
        })
      }

      // Import notification service
      const { notifyTenantUsers } = await import('../../services/notification.service.js')

      // Send reminder notification
      const reminderMessage =
        (order.reminder_count || 0) > 0
          ? `Friendly reminder: Order #${order.id.slice(0, 8)} from ${order.restaurant_name} is still awaiting acknowledgment. Order total: $${order.total_amount || 0}`
          : `Reminder: You have an unacknowledged order #${order.id.slice(0, 8)} from ${order.restaurant_name} for $${order.total_amount || 0}. Please acknowledge when ready.`

      try {
        await notifyTenantUsers({
          tenantId: order.supplier_id,
          tenantType: 'SUPPLIER',
          notificationType: 'ORDER',
          notificationCategory: 'PLACED',
          title: 'Order Reminder',
          message: reminderMessage,
          referenceId: order.id,
          referenceType: 'ORDER',
          metadata: {
            order_id: order.id,
            status: order.status,
            reminder_count: (order.reminder_count || 0) + 1,
            restaurant_name: order.restaurant_name,
          },
        })
      } catch (notifError) {
        logger.warn('Order reminder notification failed; proceeding anyway', {
          error: notifError.message,
        })
      }

      // Update order with reminder tracking
      const { rows: updatedOrders } = await query(
        `
      UPDATE customer_order
      SET last_reminder_sent_at = now(),
          reminder_count = COALESCE(reminder_count, 0) + 1,
          updated_at = now()
      WHERE id = $1
      RETURNING *
    `,
        [id]
      )

      logger.info('Order reminder sent', {
        orderId: order.id,
        supplierId,
        reminderCount: updatedOrders[0].reminder_count,
      })

      res.json({
        ok: true,
        data: {
          order: updatedOrders[0],
          message: 'Reminder sent successfully',
        },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Send reminder error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          name: 'INTERNAL_ERROR',
          message: 'Failed to send reminder',
          details: error.message,
        },
        requestId: req.requestId,
      })
    }
  }
)

// Get packing slip as PDF (must be before /:id/packing-slip so path matches)
router.get(
  '/:id/packing-slip/pdf',
  requireRole(['SUPPLIER', 'RESTAURANT', 'ADMIN']),
  async (req, res) => {
    try {
      const { id } = req.params
      const { rows: orders } = await query(
        `
      SELECT o.*, r.name as restaurant_name, r.contact_email, r.phone,
        r.address_json as restaurant_address
      FROM customer_order o
      JOIN restaurant r ON r.id = o.restaurant_id
      WHERE o.id = $1
    `,
        [id]
      )
      if (orders.length === 0) {
        return res.status(404).json({ ok: false, error: { message: 'Order not found' } })
      }
      const order = orders[0]
      let supplierId = null
      if (req.userData.role === 'SUPPLIER') {
        supplierId = await getSupplierIdForRequest(req)
      }
      const itemsQuery = supplierId
        ? `
        SELECT oi.*, p.name as product_name, p.sku as product_sku, p.unit,
          s.name as supplier_name
        FROM order_item oi
        JOIN product p ON p.id = oi.product_id
        JOIN supplier s ON s.id = oi.supplier_id
        WHERE oi.order_id = $1 AND oi.supplier_id = $2
        ORDER BY p.name
      `
        : `
        SELECT oi.*, p.name as product_name, p.sku as product_sku, p.unit,
          s.name as supplier_name
        FROM order_item oi
        JOIN product p ON p.id = oi.product_id
        JOIN supplier s ON s.id = oi.supplier_id
        WHERE oi.order_id = $1
        ORDER BY s.name, p.name
      `
      const { rows: items } = await query(itemsQuery, supplierId ? [id, supplierId] : [id])
      const packingSlip = {
        orderNumber: order.id.substring(0, 8).toUpperCase(),
        restaurantName: order.restaurant_name,
        restaurantAddress: order.restaurant_address,
        orderDate: order.placed_at || order.created_at,
        items: items.map((item) => ({
          sku: item.product_sku,
          name: item.product_name,
          quantity: item.quantity,
          unit: item.unit,
        })),
        totalAmount: order.total_amount,
        currency: order.currency,
      }
      const buf = await buildPackingSlipPdf(packingSlip, resolveRequestLocale(req))
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="packing-slip-${order.id.substring(0, 8)}.pdf"`
      )
      res.send(buf)
    } catch (error) {
      logger.error('Get packing slip PDF error:', error)
      res.status(500).json({ ok: false, error: { message: 'Failed to get packing slip PDF' } })
    }
  }
)

// Get packing slip (JSON)
router.get(
  '/:id/packing-slip',
  requireRole(['SUPPLIER', 'RESTAURANT', 'ADMIN']),
  async (req, res) => {
    try {
      const { id } = req.params

      // Get order with items
      const { rows: orders } = await query(
        `
      SELECT o.*, r.name as restaurant_name, r.contact_email, r.phone,
        r.address_json as restaurant_address
      FROM customer_order o
      JOIN restaurant r ON r.id = o.restaurant_id
      WHERE o.id = $1
    `,
        [id]
      )

      if (orders.length === 0) {
        throw new NotFoundError('Order not found')
      }

      const order = orders[0]

      // If supplier, verify they own items in this order and filter items
      let supplierId = null
      if (req.userData.role === 'SUPPLIER') {
        supplierId = await getSupplierIdForRequest(req)
      }

      // Get order items (filter by supplier if supplier role)
      const itemsQuery = supplierId
        ? `
        SELECT oi.*, p.name as product_name, p.sku as product_sku, p.unit,
          s.name as supplier_name
        FROM order_item oi
        JOIN product p ON p.id = oi.product_id
        JOIN supplier s ON s.id = oi.supplier_id
        WHERE oi.order_id = $1 AND oi.supplier_id = $2
        ORDER BY p.name
      `
        : `
        SELECT oi.*, p.name as product_name, p.sku as product_sku, p.unit,
          s.name as supplier_name
        FROM order_item oi
        JOIN product p ON p.id = oi.product_id
        JOIN supplier s ON s.id = oi.supplier_id
        WHERE oi.order_id = $1
        ORDER BY s.name, p.name
      `

      const { rows: items } = await query(itemsQuery, supplierId ? [id, supplierId] : [id])

      // Return JSON for now (PDF generation can be added later)
      res.json({
        ok: true,
        data: {
          order,
          items,
          packingSlip: {
            orderNumber: order.id.substring(0, 8).toUpperCase(),
            restaurantName: order.restaurant_name,
            restaurantAddress: order.restaurant_address,
            orderDate: order.placed_at || order.created_at,
            items: items.map((item) => ({
              sku: item.product_sku,
              name: item.product_name,
              quantity: item.quantity,
              unit: item.unit,
            })),
            totalAmount: order.total_amount,
            currency: order.currency,
          },
        },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Get packing slip error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          name: 'INTERNAL_ERROR',
          message: 'Failed to get packing slip',
        },
        requestId: req.requestId,
      })
    }
  }
)

export default router
