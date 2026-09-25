import express from 'express'
import { assertValidQuantityForUnit } from '../lib/quantity-unit.js'
import {
  requireAuth,
  requireRole,
  resolveTenantContext,
  requirePermission,
  getRestaurantIdForRequest,
  getSupplierIdForRequest,
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
import {
  notifyDisputeOpened,
  notifyInvoiceIssued,
  notifyOrderStatusChange,
} from '../services/notification.service.js'
import { createLotFromReceivingLine } from '../services/inventory-expiry.service.js'
import { earnLoyaltyOnOrderReceive } from '../services/loyalty.service.js'
import {
  hookRecipeCostingAfterReceiving,
  hookRecipeCostingAfterInvoice,
} from '../services/recipe-purchasing-hooks.service.js'
import { resolveRequestLocale, localizedError } from '../i18n/index.js'
import {
  buildReceivingDiscrepancies,
  validateAndEnrichReceivingLines,
  sumBillableAcceptedQuantity,
} from '../lib/receiving-line-validation.js'

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
  return getRestaurantIdForRequest(req)
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
            COALESCE(p.name, 'Unavailable product') as product_name,
            COALESCE(p.sku, oi.product_id::text) AS sku,
            COALESCE(p.unit, 'unit') AS unit
          FROM order_item oi
          LEFT JOIN product p ON p.id = oi.product_id
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
      const supplierId = await getSupplierIdForRequest(req)

      if (!supplierId) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: receivingErr(req, 'FORBIDDEN', 'supplierNotFound'),
          requestId: req.requestId,
        })
      }

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
      const {
        orderId,
        lineItems: rawLineItems,
        deliveryNotes,
        qualityScore,
        qualityNotes,
        receivedBy,
      } = req.body

      const restaurantId = await resolveRestaurantId(req)

      if (!restaurantId) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: receivingErr(req, 'FORBIDDEN', 'restaurantNotFound'),
          requestId: req.requestId,
        })
      }

      const { rows: orderItems } = await query(
        `
      SELECT oi.id, oi.quantity, oi.product_id, oi.unit_price, oi.supplier_id,
             p.unit, p.name AS product_name, p.sku
      FROM order_item oi
      LEFT JOIN product p ON p.id = oi.product_id
      WHERE oi.order_id = $1
      ORDER BY oi.created_at
    `,
        [orderId]
      )

      if (orderItems.length === 0) {
        throw new NotFoundError('Order items not found')
      }

      const supplierId = orderItems[0].supplier_id

      let lineItems
      try {
        lineItems = validateAndEnrichReceivingLines(orderItems, rawLineItems)
      } catch (validationErr) {
        if (validationErr instanceof ValidationError) {
          return res.status(400).json({
            ok: false,
            data: null,
            error: {
              name: 'VALIDATION_ERROR',
              message: validationErr.message,
            },
            requestId: req.requestId,
          })
        }
        throw validationErr
      }

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

      // Calculate totals from server-side order quantities (not client-provided ordered_quantity)
      const totalItemsOrdered = lineItems.reduce(
        (sum, item) => sum + parseFloat(item.ordered_quantity || 0),
        0
      )
      const totalItemsReceived = lineItems.reduce(
        (sum, item) => sum + parseFloat(item.received_quantity || 0),
        0
      )
      const billableAcceptedQty = sumBillableAcceptedQuantity(lineItems)
      const discrepancies = buildReceivingDiscrepancies(lineItems)
      const totalExpectedCost = lineItems.reduce(
        (sum, item) =>
          sum + parseFloat(item.ordered_quantity || 0) * parseFloat(item.expected_unit_price || 0),
        0
      )
      const totalActualCost = lineItems.reduce((sum, item) => {
        if (item.quality_status !== 'ACCEPTED') return sum
        return (
          sum +
          parseFloat(item.received_quantity || 0) *
            parseFloat(item.actual_unit_price || parseFloat(item.expected_unit_price || 0))
        )
      }, 0)

      // Determine receiving report status
      let status = 'ACCEPTED'
      if (billableAcceptedQty === 0) {
        status = 'REJECTED'
      } else if (billableAcceptedQty < totalItemsOrdered) {
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
              branchId: order.branch_id ?? null,
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

        // Order status: zero billable acceptance → dispute path; never RECEIVED_FULL when all rejected
        let autoDispute = null
        if (discrepancies.length > 0) {
          let disputeItemsToAdd = discrepancies
          // The invoice bills accepted units only, so the credit cap stays 0.
          // Shortage and damage are tracked on dispute lines for replacement.
          let disputedAmount = 0
          const hasQualityIssue = discrepancies.some((item) => item.qualityStatus !== 'ACCEPTED')
          const { rows: activeDisputes } = await client.query(
            `SELECT * FROM disputes
             WHERE order_id = $1 AND status IN ('open', 'under_review', 'escalated')
             FOR UPDATE`,
            [orderId]
          )

          if (activeDisputes.length > 0) {
            const { rows: existingItems } = await client.query(
              `SELECT order_item_id FROM dispute_items WHERE dispute_id = $1`,
              [activeDisputes[0].id]
            )
            const existingOrderItemIds = new Set(
              existingItems.map((item) => String(item.order_item_id))
            )
            disputeItemsToAdd = discrepancies.filter(
              (item) => !existingOrderItemIds.has(String(item.orderItemId))
            )
            disputedAmount = 0
            const { rows } = await client.query(
              `UPDATE disputes
               SET receiving_report_id = COALESCE(receiving_report_id, $2),
                   disputed_amount = COALESCE(disputed_amount, 0) + $3,
                   updated_at = now()
               WHERE id = $1
               RETURNING *`,
              [activeDisputes[0].id, report.id, disputedAmount]
            )
            autoDispute = rows[0]
          } else {
            const { rows } = await client.query(
              `INSERT INTO disputes (
                 order_id, restaurant_id, supplier_id, receiving_report_id,
                 type, status, description, disputed_amount, created_by
               ) VALUES ($1,$2,$3,$4,$5,'open',$6,$7,$8)
               RETURNING *`,
              [
                orderId,
                restaurantId,
                supplierId,
                report.id,
                hasQualityIssue ? 'quality_issue' : 'short_delivery',
                'Automatically opened from receiving discrepancies',
                disputedAmount,
                receivedBy || req.userData.id,
              ]
            )
            autoDispute = rows[0]
          }

          for (const item of disputeItemsToAdd) {
            await client.query(
              `INSERT INTO dispute_items (
                 dispute_id, order_item_id, product_name, quantity_ordered,
                 quantity_received, unit_price, issue_description
               )
               SELECT $1,$2,$3,$4,$5,$6,$7
               WHERE NOT EXISTS (
                 SELECT 1 FROM dispute_items
                 WHERE dispute_id = $1 AND order_item_id = $2
               )`,
              [
                autoDispute.id,
                item.orderItemId,
                item.productName,
                item.quantityOrdered,
                item.qualityStatus === 'ACCEPTED' ? item.quantityReceived : 0,
                item.unitPrice,
                item.issueDescription,
              ]
            )
          }
        }

        let nextStatus
        if (autoDispute) {
          nextStatus = 'RECEIVED_WITH_DISPUTE'
        } else if (billableAcceptedQty < totalItemsOrdered) {
          nextStatus = 'RECEIVED_PARTIAL'
        } else {
          nextStatus = 'RECEIVED_FULL'
        }
        await client.query(
          `
        UPDATE customer_order
        SET status = $1, updated_at = now()
        WHERE id = $2
      `,
          [nextStatus, orderId]
        )

        // Build invoice from accepted received items (skipped when billableAcceptedQty is 0)
        const createdInvoice =
          billableAcceptedQty > 0
            ? await createInvoiceFromReceiving(client, {
                order,
                report,
                supplierId,
                restaurantId,
                receivedBy: receivedBy || req.userData.id,
              })
            : null

        if (autoDispute && createdInvoice) {
          const { rows } = await client.query(
            `UPDATE disputes SET invoice_id = $2, updated_at = now() WHERE id = $1 RETURNING *`,
            [autoDispute.id, createdInvoice.id]
          )
          autoDispute = rows[0]
        }

        if (createdInvoice) {
          await client.query(
            `UPDATE customer_order SET status = $1, updated_at = now() WHERE id = $2`,
            [nextStatus, orderId]
          )
        }

        const earnBaseAmount = totalActualCost > 0 ? totalActualCost : 0
        const loyaltyEarn = await earnLoyaltyOnOrderReceive(client, {
          supplierId,
          restaurantId,
          orderId,
          receiveAmount: earnBaseAmount,
          createdBy: req.userData?.id,
        })

        return {
          report,
          createdInvoice,
          loyaltyEarn,
          autoDispute,
          nextStatus,
          currency: order.currency,
        }
      })

      if (result.autoDispute) {
        notifyDisputeOpened(result.autoDispute).catch((err) => {
          logger.warn('Automatic dispute notification failed', { error: err.message, orderId })
        })
      }

      notifyOrderStatusChange(
        { id: orderId, restaurant_id: restaurantId, supplier_id: supplierId },
        result.nextStatus
      ).catch((err) => {
        logger.warn('Receiving status notification failed', { error: err.message, orderId })
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
          currency: result.currency || 'USD',
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
