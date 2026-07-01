import express from 'express'
import { assertValidQuantityForUnit } from '../lib/quantity-unit.js'
import {
  requireAuth,
  requireRole,
  resolveTenantContext,
  requirePermission,
  getRestaurantIdForRequest,
} from '../lib/rbac.js'
import { query, withTransaction } from '../lib/db.js'
import { startStage, mark } from '../middlewares/request-timing.js'
import { logger } from '../lib/logger.js'
import { ConflictError, NotFoundError, ValidationError } from '../middlewares/errorHandler.js'
import {
  assertNoReceivingReport,
  createInvoiceFromReceiving,
  lockOrderForReceiving,
} from '../services/invoice.service.js'
import { requireFeature } from '../lib/subscription.js'
import { notifyLeaveReviewIfEligible } from '../services/reviews.service.js'
import { notifyInvoiceIssued } from '../services/notification.service.js'
import { createLotFromReceivingLine } from '../services/inventory-expiry.service.js'
import { earnLoyaltyOnOrderReceive } from '../services/loyalty.service.js'
import {
  hookRecipeCostingAfterReceiving,
  hookRecipeCostingAfterInvoice,
} from '../services/recipe-purchasing-hooks.service.js'
import { resolveRequestLocale, localizedError } from '../i18n/index.js'

const router = express.Router()

function receivingErr(req, name, key, vars = {}) {
  return localizedError(resolveRequestLocale(req), name, `errors.${key}`, vars, 'receiving')
}

const receivingQualityGate = requireFeature(
  'receiving_quality',
  (req) => req.tenantContext?.tenantId,
  (req) => req.tenantContext?.tenantType
)

router.use(requireAuth, resolveTenantContext, receivingQualityGate)

/** Supplier fulfillment statuses that mean the restaurant can record receiving. */
const RECEIVABLE_ORDER_STATUSES = ['DELIVERED', 'COMPLETED']

async function resolveRestaurantId(req) {
  if (req.tenantContext?.tenantType === 'RESTAURANT') {
    return req.tenantContext.tenantId
  }
  const tenantId = await getRestaurantIdForRequest(req)
  if (tenantId) return tenantId
  if (req.userData?.role !== 'ADMIN') return null
  const { rows } = await query(
    `SELECT id FROM restaurant WHERE LOWER(TRIM(contact_email)) = LOWER(TRIM($1)) LIMIT 1`,
    [req.userData.email]
  )
  return rows[0]?.id || null
}

// Get delivered orders ready for receiving
router.get(
  '/pending-orders',
  requireRole(['RESTAURANT', 'ADMIN']),
  requirePermission('RECEIVING_VIEW'),
  async (req, res) => {
    startStage(req, 'handler')
    try {
      const restaurantId = await resolveRestaurantId(req)

      if (!restaurantId) {
        mark(req, 'handler')
        return res.status(403).json({
          ok: false,
          data: null,
          error: receivingErr(req, 'FORBIDDEN', 'restaurantNotFound'),
          requestId: req.requestId,
        })
      }

      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100)

      const { rows: orders } = await query(
        `
      SELECT DISTINCT ON (o.id)
        o.*,
        s.name AS supplier_name,
        s.contact_email AS supplier_email,
        (rr.id IS NOT NULL) AS has_receiving_report
      FROM customer_order o
      JOIN order_item oi ON oi.order_id = o.id
      JOIN supplier s ON s.id = oi.supplier_id
      LEFT JOIN receiving_report rr
        ON rr.order_id = o.id
        AND rr.status IN ('ACCEPTED', 'REJECTED', 'PARTIAL')
      WHERE o.restaurant_id = $1
        AND o.status::text = ANY($2::text[])
        AND rr.id IS NULL
      ORDER BY o.id, o.created_at DESC
      LIMIT $3
    `,
        [restaurantId, RECEIVABLE_ORDER_STATUSES, limit],
        req
      )

      const orderIds = orders.map((o) => o.id)
      let itemsByOrderId = new Map()
      if (orderIds.length > 0) {
        const { rows: allItems } = await query(
          `
          SELECT 
            oi.*,
            p.name as product_name,
            p.sku,
            p.unit
          FROM order_item oi
          JOIN product p ON p.id = oi.product_id
          WHERE oi.order_id = ANY($1::uuid[])
        `,
          [orderIds]
        )
        itemsByOrderId = allItems.reduce((map, item) => {
          const list = map.get(item.order_id) ?? []
          list.push({
            ...item,
            ordered_quantity: parseFloat(item.quantity),
            received_quantity: 0,
            quality_status: 'PENDING',
          })
          map.set(item.order_id, list)
          return map
        }, new Map())
      }

      const ordersWithItems = orders.map((order) => ({
        ...order,
        items: itemsByOrderId.get(order.id) ?? [],
      }))

      mark(req, 'handler')
      res.json({
        ok: true,
        data: { orders: ordersWithItems },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      mark(req, 'handler')
      logger.error({
        message: 'Get pending orders for receiving error',
        error: error.message,
        stack: error.stack,
      })
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          ...receivingErr(req, 'INTERNAL_ERROR', 'failedPendingOrders'),
          details: error.message,
        },
        requestId: req.requestId,
      })
    }
  }
)

// Supplier view of orders awaiting restaurant receiving (COMPLETED orders per supplier)
router.get(
  '/pending-orders/supplier',
  requireAuth,
  requireRole(['SUPPLIER', 'ADMIN']),
  requirePermission('ORDERS_VIEW'),
  async (req, res) => {
    try {
      const { rows: suppliers } = await query('SELECT id FROM supplier WHERE contact_email = $1', [
        req.userData.email,
      ])

      if (suppliers.length === 0) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: receivingErr(req, 'FORBIDDEN', 'supplierNotFound'),
          requestId: req.requestId,
        })
      }

      const supplierId = suppliers[0].id

      const { rows: orders } = await query(
        `
      SELECT DISTINCT ON (o.id)
        o.*,
        r.name as restaurant_name,
        COALESCE(
          (SELECT COUNT(*) > 0 
           FROM receiving_report 
           WHERE order_id = o.id 
             AND status IN ('ACCEPTED', 'REJECTED', 'PARTIAL')
          ), false
        ) as has_receiving_report
      FROM customer_order o
      JOIN order_item oi ON oi.order_id = o.id
      JOIN restaurant r ON r.id = o.restaurant_id
      WHERE o.status::text = ANY($2::text[]) AND oi.supplier_id = $1
      ORDER BY o.id, o.created_at DESC
    `,
        [supplierId, RECEIVABLE_ORDER_STATUSES]
      )

      res.json({
        ok: true,
        data: { orders },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error({
        message: 'Get supplier pending receiving orders error',
        error: error.message,
        stack: error.stack,
      })
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          ...receivingErr(req, 'INTERNAL_ERROR', 'failedSupplierPendingOrders'),
          details: error.message,
        },
        requestId: req.requestId,
      })
    }
  }
)

// Create receiving report
router.post(
  '/receive',
  requireRole(['RESTAURANT', 'ADMIN']),
  requirePermission('RECEIVING_MANAGE'),
  async (req, res) => {
    try {
      const { orderId, lineItems, deliveryNotes, qualityScore, qualityNotes, receivedBy } = req.body

      const restaurantId = await resolveRestaurantId(req)

      if (!restaurantId) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: receivingErr(req, 'FORBIDDEN', 'restaurantNotFound'),
          requestId: req.requestId,
        })
      }

      // Get supplier_id from the first order_item
      const { rows: items } = await query(
        `
      SELECT DISTINCT supplier_id FROM order_item WHERE order_id = $1 LIMIT 1
    `,
        [orderId]
      )

      if (items.length === 0) {
        throw new NotFoundError('Order items not found')
      }

      const supplierId = items[0].supplier_id

      for (const line of lineItems) {
        const unit = line.unit || 'unit'
        const ordered = parseFloat(line.ordered_quantity || 0)
        const receivedRaw = parseFloat(line.received_quantity ?? line.ordered_quantity ?? 0)
        try {
          line.received_quantity = assertValidQuantityForUnit(receivedRaw, unit, {
            fieldName: 'Received quantity',
          })
          if (line.ordered_quantity != null) {
            line.ordered_quantity = assertValidQuantityForUnit(
              parseFloat(line.ordered_quantity),
              unit,
              { fieldName: 'Ordered quantity' }
            )
          }
        } catch (qtyErr) {
          return res.status(400).json({
            ok: false,
            data: null,
            error: {
              name: 'VALIDATION_ERROR',
              message: qtyErr.message,
            },
            requestId: req.requestId,
          })
        }
        if (line.received_quantity > ordered) {
          return res.status(400).json({
            ok: false,
            data: null,
            error: receivingErr(req, 'VALIDATION_ERROR', 'receivedExceedsOrdered', {
              ordered,
              unit,
            }),
            requestId: req.requestId,
          })
        }
      }

      // Calculate totals
      const totalItemsOrdered = lineItems.reduce(
        (sum, item) => sum + parseFloat(item.ordered_quantity || 0),
        0
      )
      const totalItemsReceived = lineItems.reduce(
        (sum, item) => sum + parseFloat(item.received_quantity || 0),
        0
      )
      const totalExpectedCost = lineItems.reduce(
        (sum, item) =>
          sum + parseFloat(item.ordered_quantity || 0) * parseFloat(item.expected_unit_price || 0),
        0
      )
      const totalActualCost = lineItems.reduce(
        (sum, item) =>
          sum +
          parseFloat(item.received_quantity || 0) *
            parseFloat(item.actual_unit_price || parseFloat(item.expected_unit_price || 0)),
        0
      )

      // Determine status
      let status = 'ACCEPTED'
      if (totalItemsReceived < totalItemsOrdered) {
        status = 'PARTIAL'
      }

      // Execute within transaction (order lock + duplicate report check inside txn)
      const result = await withTransaction(async (client) => {
        const order = await lockOrderForReceiving(client, orderId, restaurantId)

        if (!RECEIVABLE_ORDER_STATUSES.includes(order.status)) {
          throw new ValidationError('Order is not ready for receiving')
        }

        await assertNoReceivingReport(client, orderId)

        // Create receiving report
        const { rows: reports } = await client.query(
          `
        INSERT INTO receiving_report (
          order_id, restaurant_id, supplier_id, received_by,
          total_items_ordered, total_items_received,
          total_expected_cost, total_actual_cost,
          quality_score, quality_notes, delivery_notes, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `,
          [
            orderId,
            restaurantId,
            supplierId,
            receivedBy || req.userData.id,
            totalItemsOrdered,
            totalItemsReceived,
            totalExpectedCost,
            totalActualCost,
            qualityScore,
            qualityNotes,
            deliveryNotes,
            status,
          ]
        )

        const report = reports[0]

        // Create receiving line items
        for (const item of lineItems) {
          const { rows: insertedLines } = await client.query(
            `
          INSERT INTO receiving_line_item (
            receiving_report_id, product_id, order_item_id,
            product_name, product_sku, ordered_quantity, received_quantity,
            unit, expected_unit_price, actual_unit_price,
            quality_status, notes
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING id
        `,
            [
              report.id,
              item.productId,
              item.orderItemId,
              item.product_name,
              item.sku,
              item.ordered_quantity,
              item.received_quantity,
              item.unit || 'unit',
              item.expected_unit_price,
              item.actual_unit_price || item.expected_unit_price,
              item.quality_status,
              item.notes || '',
            ]
          )

          const lineItemId = insertedLines[0]?.id
          const expiryDate = item.expiryDate || item.expiry_date
          if (
            item.quality_status === 'ACCEPTED' &&
            expiryDate &&
            parseFloat(item.received_quantity || 0) > 0
          ) {
            await createLotFromReceivingLine(client, {
              restaurantId,
              reportId: report.id,
              lineItemId,
              productId: item.productId,
              supplierId,
              orderId,
              orderItemId: item.orderItemId,
              itemName: item.product_name,
              productSku: item.sku,
              quantity: item.received_quantity,
              unit: item.unit || 'unit',
              batchLotNumber: item.batchLotNumber || item.batch_lot_number,
              receivedDate:
                item.receivedDate || item.received_date || new Date().toISOString().slice(0, 10),
              expiryDate,
              storageLocation: item.storageLocation || item.storage_location,
              notes: item.notes,
            })
          }

          // Update restaurant inventory if item is accepted and has quantity
          if (item.quality_status === 'ACCEPTED' && parseFloat(item.received_quantity || 0) > 0) {
            const { rows: existingInventory } = await client.query(
              `
            SELECT * FROM restaurant_inventory 
            WHERE restaurant_id = $1 AND product_id = $2
          `,
              [restaurantId, item.productId]
            )

            const receivedQty = parseFloat(item.received_quantity || 0)
            const balanceBefore =
              existingInventory.length > 0 ? Number(existingInventory[0].quantity) : 0
            const balanceAfter = balanceBefore + receivedQty

            if (existingInventory.length > 0) {
              // Update existing inventory
              await client.query(
                `
              UPDATE restaurant_inventory 
              SET quantity = quantity + $1,
                  last_restocked_at = now(),
                  updated_at = now()
              WHERE id = $2
            `,
                [receivedQty, existingInventory[0].id]
              )
            } else {
              // Create new inventory entry
              await client.query(
                `
              INSERT INTO restaurant_inventory (
                restaurant_id, product_id, quantity, last_restocked_at
              )
              VALUES ($1, $2, $3, now())
            `,
                [restaurantId, item.productId, receivedQty]
              )
            }

            // Add inventory movement log (treat receiving as an ADD)
            await client.query(
              `
            INSERT INTO inventory_movement_log (
              restaurant_id, product_id, type, quantity,
              balance_before, balance_after, reason, reference_id, reference_type
            )
            VALUES ($1, $2, 'ADD', $3, $4, $5, $6, $7, 'RECEIVING_REPORT')
          `,
              [
                restaurantId,
                item.productId,
                receivedQty,
                balanceBefore,
                balanceAfter,
                'Order received',
                report.id,
              ]
            )
          }
        }

        const { markReorderForecastDirty } = await import(
          '../services/reorder-forecast-cache.service.js'
        )
        await markReorderForecastDirty(restaurantId, { reason: 'receiving_completed' })

        // Update order status to RECEIVED_PARTIAL/FULL
        const nextStatus =
          totalItemsReceived < totalItemsOrdered ? 'RECEIVED_PARTIAL' : 'RECEIVED_FULL'
        await client.query(
          `
        UPDATE customer_order
        SET status = $1, updated_at = now()
        WHERE id = $2
      `,
          [nextStatus, orderId]
        )

        // Build invoice from accepted received items
        const createdInvoice = await createInvoiceFromReceiving(client, {
          order,
          report,
          supplierId,
          restaurantId,
          receivedBy: receivedBy || req.userData.id,
        })

        const earnBaseAmount =
          totalActualCost > 0 ? totalActualCost : parseFloat(order.total_amount || 0)
        const loyaltyEarn = await earnLoyaltyOnOrderReceive(client, {
          supplierId,
          restaurantId,
          orderId,
          receiveAmount: earnBaseAmount,
          createdBy: req.userData?.id,
        })

        return { report, createdInvoice, loyaltyEarn }
      })

      if (result.createdInvoice) {
        notifyInvoiceIssued(result.createdInvoice).catch((err) => {
          logger.warn('Auto-invoice notification failed', { error: err.message, orderId })
        })
      }

      notifyLeaveReviewIfEligible({
        orderId,
        supplierId,
        restaurantId,
      }).catch((err) => {
        logger.warn('Review prompt notification failed', { orderId, error: err.message })
      })

      const costingItems = lineItems
        .filter(
          (item) =>
            item.quality_status === 'ACCEPTED' && parseFloat(item.received_quantity || 0) > 0
        )
        .map((item) => ({
          productId: item.productId,
          supplierId,
          unitPrice: item.actual_unit_price || item.expected_unit_price,
          unit: item.unit || 'unit',
        }))
      hookRecipeCostingAfterReceiving(restaurantId, costingItems)
      if (result.createdInvoice) {
        hookRecipeCostingAfterInvoice(restaurantId, costingItems)
      }

      res.status(201).json({
        ok: true,
        data: { report: result.report, invoice: result.createdInvoice },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      if (error instanceof ConflictError) {
        return res.status(409).json({
          ok: false,
          data: null,
          error: receivingErr(req, 'CONFLICT', 'reportAlreadyExists'),
          requestId: req.requestId,
        })
      }
      if (error instanceof ValidationError) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: receivingErr(req, 'VALIDATION_ERROR', 'orderNotReady'),
          requestId: req.requestId,
        })
      }
      if (error instanceof NotFoundError) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: receivingErr(req, 'NOT_FOUND', 'orderNotFound'),
          requestId: req.requestId,
        })
      }
      logger.error({
        message: 'Create receiving report error',
        error: error.message,
        stack: error.stack,
      })
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          ...receivingErr(req, 'INTERNAL_ERROR', 'failedCreateReport'),
          details: error.message,
        },
        requestId: req.requestId,
      })
    }
  }
)

// Get receiving history
router.get(
  '/history',
  requireRole(['RESTAURANT', 'ADMIN']),
  requirePermission('RECEIVING_VIEW'),
  async (req, res) => {
    try {
      const restaurantId = await resolveRestaurantId(req)

      if (!restaurantId) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: receivingErr(req, 'FORBIDDEN', 'restaurantNotFound'),
          requestId: req.requestId,
        })
      }

      const { rows: reports } = await query(
        `
      SELECT 
        rr.*,
        o.id as order_id,
        o.created_at as order_created_at,
        s.name as supplier_name,
        COUNT(rli.id) as line_item_count
      FROM receiving_report rr
      JOIN customer_order o ON o.id = rr.order_id
      JOIN supplier s ON s.id = rr.supplier_id
      LEFT JOIN receiving_line_item rli ON rli.receiving_report_id = rr.id
      WHERE rr.restaurant_id = $1
      GROUP BY rr.id, o.id, o.created_at, s.name
      ORDER BY rr.received_at DESC
      LIMIT 50
    `,
        [restaurantId]
      )

      res.json({
        ok: true,
        data: { reports },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error({
        message: 'Get receiving history error',
        error: error.message,
        stack: error.stack,
      })
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          ...receivingErr(req, 'INTERNAL_ERROR', 'failedReceivingHistory'),
          details: error.message,
        },
        requestId: req.requestId,
      })
    }
  }
)

export { router as receivingRoutes }
