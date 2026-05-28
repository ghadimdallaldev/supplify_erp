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
import { logger } from '../lib/logger.js'
import { NotFoundError } from '../middlewares/errorHandler.js'
import { requireFeature } from '../lib/subscription.js'
import { notifyLeaveReviewIfEligible } from '../services/reviews.service.js'

const router = express.Router()

const receivingQualityGate = requireFeature(
  'receiving_quality',
  (req) => req.tenantContext?.tenantId,
  (req) => req.tenantContext?.tenantType
)

router.use(requireAuth, resolveTenantContext, receivingQualityGate)

/** Supplier fulfillment statuses that mean the restaurant can record receiving. */
const RECEIVABLE_ORDER_STATUSES = ['DELIVERED', 'COMPLETED']

async function resolveRestaurantId(req) {
  const tenantId = await getRestaurantIdForRequest(req)
  if (tenantId) return tenantId
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
    try {
      const restaurantId = await resolveRestaurantId(req)

      if (!restaurantId) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: {
            name: 'FORBIDDEN',
            message: 'Restaurant not found',
          },
          requestId: req.requestId,
        })
      }

      // Orders supplier marked delivered (or legacy COMPLETED) without a receiving report yet
      const { rows: orders } = await query(
        `
      SELECT DISTINCT ON (o.id)
        o.*,
        s.name as supplier_name,
        s.contact_email as supplier_email,
        COALESCE(
          (SELECT COUNT(*) > 0 
           FROM receiving_report 
           WHERE order_id = o.id 
             AND status IN ('ACCEPTED', 'REJECTED', 'PARTIAL')
          ), 
          false
        ) as has_receiving_report
      FROM customer_order o
      JOIN order_item oi ON oi.order_id = o.id
      JOIN supplier s ON s.id = oi.supplier_id
      WHERE o.restaurant_id = $1 
        AND o.status::text = ANY($2::text[])
        AND NOT EXISTS (
          SELECT 1 FROM receiving_report 
          WHERE order_id = o.id 
            AND status IN ('ACCEPTED', 'REJECTED', 'PARTIAL')
        )
      ORDER BY o.id, o.created_at DESC
    `,
        [restaurantId, RECEIVABLE_ORDER_STATUSES]
      )

      // For each order, fetch its items
      const ordersWithItems = await Promise.all(
        orders.map(async (order) => {
          const { rows: items } = await query(
            `
          SELECT 
            oi.*,
            p.name as product_name,
            p.sku,
            p.unit
          FROM order_item oi
          JOIN product p ON p.id = oi.product_id
          WHERE oi.order_id = $1
        `,
            [order.id]
          )

          return {
            ...order,
            items: items.map((item) => ({
              ...item,
              ordered_quantity: parseFloat(item.quantity),
              received_quantity: 0,
              quality_status: 'PENDING',
            })),
          }
        })
      )

      res.json({
        ok: true,
        data: { orders: ordersWithItems },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error({
        message: 'Get pending orders for receiving error',
        error: error.message,
        stack: error.stack,
      })
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          name: 'INTERNAL_ERROR',
          message: 'Failed to get pending orders',
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
          error: { name: 'FORBIDDEN', message: 'Supplier not found' },
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
      WHERE o.status = 'DELIVERED' AND oi.supplier_id = $1
      ORDER BY o.id, o.created_at DESC
    `,
        [supplierId]
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
          name: 'INTERNAL_ERROR',
          message: 'Failed to get supplier receiving list',
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
          error: {
            name: 'FORBIDDEN',
            message: 'Restaurant not found',
          },
          requestId: req.requestId,
        })
      }

      // Get order details
      const { rows: orders } = await query(
        `
      SELECT * FROM customer_order WHERE id = $1 AND restaurant_id = $2
    `,
        [orderId, restaurantId]
      )

      if (orders.length === 0) {
        throw new NotFoundError('Order not found')
      }

      const order = orders[0]

      if (!RECEIVABLE_ORDER_STATUSES.includes(order.status)) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'VALIDATION_ERROR',
            message:
              'This order is not ready to receive yet. Wait until the supplier marks it as delivered.',
          },
          requestId: req.requestId,
        })
      }

      const { rows: existingReports } = await query(
        `SELECT 1 FROM receiving_report
         WHERE order_id = $1 AND status IN ('ACCEPTED', 'REJECTED', 'PARTIAL')
         LIMIT 1`,
        [orderId]
      )
      if (existingReports.length > 0) {
        return res.status(409).json({
          ok: false,
          data: null,
          error: {
            name: 'CONFLICT',
            message: 'A receiving report already exists for this order',
          },
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
            error: {
              name: 'VALIDATION_ERROR',
              message: `Received quantity cannot exceed ordered quantity (${ordered} ${unit})`,
            },
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

      // Execute within transaction
      const result = await withTransaction(async (client) => {
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
          await client.query(
            `
          INSERT INTO receiving_line_item (
            receiving_report_id, product_id, order_item_id,
            product_name, product_sku, ordered_quantity, received_quantity,
            unit, expected_unit_price, actual_unit_price,
            quality_status, notes
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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

        // Build invoice from received items (actual quantities/prices)
        const { rows: rItems } = await client.query(
          `
        SELECT 
          rli.product_id,
          rli.order_item_id,
          rli.product_name,
          rli.product_sku as sku,
          rli.received_quantity as quantity,
          COALESCE(rli.actual_unit_price, rli.expected_unit_price) as unit_price
        FROM receiving_line_item rli
        WHERE rli.receiving_report_id = $1
      `,
          [report.id]
        )

        if (rItems.length > 0) {
          // Generate minimal invoice based on orders.routes.js logic
          const now = new Date()
          const year = now.getFullYear()
          const month = now.getMonth() + 1
          let invoiceNumber = `INV-${year}-${String(month).padStart(2, '0')}-${String(Date.now()).slice(-6)}`
          try {
            const { rows: sequences } = await client.query(
              `
            INSERT INTO invoice_sequence (supplier_id, year, month, current_number, next_number)
            VALUES ($1, $2, $3, 0, 1)
            ON CONFLICT (supplier_id, year, month)
            DO UPDATE SET next_number = invoice_sequence.next_number + 1
            RETURNING next_number, prefix, format
          `,
              [supplierId, year, month]
            )
            if (sequences.length > 0) {
              const seq = sequences[0]
              const number = String(seq.next_number).padStart(6, '0')
              invoiceNumber = `${seq.prefix || 'INV'}-${year}-${String(month).padStart(2, '0')}-${number}`
            }
          } catch (sequenceError) {
            logger.warn('Failed to update invoice sequence during receiving creation', {
              supplierId,
              error: sequenceError.message,
            })
          }

          let subtotal = 0
          const taxRate = 0 // keep simple; tax config can be applied later
          for (const it of rItems) {
            subtotal += parseFloat(it.unit_price || 0) * parseFloat(it.quantity || 0)
          }
          const taxAmount = (subtotal * taxRate) / 100
          const totalAmount = subtotal + taxAmount

          const { rows: invRows } = await client.query(
            `
          INSERT INTO invoice (
            invoice_number, supplier_id, restaurant_id, order_id,
            invoice_date, issue_date, due_date,
            subtotal, tax_amount, tax_rate, tax_included, total_amount,
            balance_due, paid_amount, status, currency, payment_terms_days, notes
          ) VALUES ($1, $2, $3, $4, now(), now(), now() + interval '30 days',
            $5, $6, $7, false, $8, $8, 0, 'ISSUED', $9, 30, $10)
          RETURNING *
        `,
            [
              invoiceNumber,
              supplierId,
              restaurantId,
              orderId,
              subtotal,
              taxAmount,
              taxRate,
              totalAmount,
              order.currency || 'USD',
              `Invoice after receiving for Order #${orderId.slice(0, 8)}`,
            ]
          )

          const invoice = invRows[0]
          for (const it of rItems) {
            const lineTotal = parseFloat(it.unit_price || 0) * parseFloat(it.quantity || 0)
            await client.query(
              `
            INSERT INTO invoice_line_item (
              invoice_id, product_id, description, sku,
              quantity, unit_price, line_total, tax_rate, tax_amount, order_item_id
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          `,
              [
                invoice.id,
                it.product_id,
                it.product_name,
                it.sku,
                it.quantity,
                it.unit_price,
                lineTotal,
                taxRate,
                0,
                it.order_item_id,
              ]
            )
          }

          // Mark order as INVOICED
          await client.query(
            `
          UPDATE customer_order SET status = 'INVOICED', updated_at = now() WHERE id = $1
        `,
            [orderId]
          )
        }

        return report
      })

      notifyLeaveReviewIfEligible({
        orderId,
        supplierId,
        restaurantId,
      }).catch((err) => {
        logger.warn('Review prompt notification failed', { orderId, error: err.message })
      })

      res.status(201).json({
        ok: true,
        data: { report: result },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error({
        message: 'Create receiving report error',
        error: error.message,
        stack: error.stack,
      })
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          name: 'INTERNAL_ERROR',
          message: 'Failed to create receiving report',
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
          error: {
            name: 'FORBIDDEN',
            message: 'Restaurant not found',
          },
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
          name: 'INTERNAL_ERROR',
          message: 'Failed to get receiving history',
          details: error.message,
        },
        requestId: req.requestId,
      })
    }
  }
)

export { router as receivingRoutes }
