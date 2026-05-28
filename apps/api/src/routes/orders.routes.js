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
} from '../lib/rbac.js'
import { query, withTransaction } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { ValidationError, NotFoundError } from '../middlewares/errorHandler.js'
import {
  checkAndIncrementUsage,
  getTenantSubscription,
  getRecommendedPlanNames,
  buildLimitExceededPayload,
  requireFeature,
  isFeatureEnabled,
} from '../lib/subscription.js'
import { z } from 'zod'
import { notifyOrderStatusChange } from '../services/notification.service.js'
import { applyBestPromotionToOrder } from '../services/promotions.service.js'
import {
  applyPromotionByIdToOrder,
  validateCouponForOrder,
} from '../services/deal-promotions.service.js'
import { writeAuditLog } from '../lib/audit.js'
import { orderAmendmentsRouter } from './order-amendments.routes.js'
import { ordersDriverRoutes } from './orders-driver.routes.js'
import { assignWarehousesToOrder } from '../services/warehouseRouting.js'
import { syncWarehouseFulfillmentOnOrderStatus } from '../services/warehouseInventory.js'
import { hasPermission } from '../lib/permissions.js'
import {
  updateDriverDeliveryStatus,
  getSupplierIdForOrder,
  orderHasProofOfDelivery,
} from '../lib/driver-delivery.js'
import {
  assertAndDeductSupplierStock,
  restoreSupplierStockForOrder,
} from '../services/supplier-inventory.service.js'

const router = express.Router()

router.use(requireAuth, resolveTenantContext, requirePermission('ORDERS_VIEW'))

/** Build PDF buffer for a packing slip */
function buildPackingSlipPdf(packingSlip) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 })
    const chunks = []
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    doc.fontSize(20).text('PACKING SLIP', { continued: false })
    doc.fontSize(10).text(`Order #${packingSlip.orderNumber}`, { continued: false })
    doc.moveDown()
    doc.text(
      `Date: ${packingSlip.orderDate ? new Date(packingSlip.orderDate).toLocaleDateString() : 'N/A'}`
    )
    doc.moveDown()
    doc.text(`Ship To: ${packingSlip.restaurantName || ''}`)
    if (packingSlip.restaurantAddress && typeof packingSlip.restaurantAddress === 'object') {
      const addr = packingSlip.restaurantAddress
      doc.text([addr.street, addr.city, addr.region, addr.country].filter(Boolean).join(', '))
    } else if (typeof packingSlip.restaurantAddress === 'string') {
      doc.text(packingSlip.restaurantAddress)
    }
    doc.moveDown(1.5)

    doc.fontSize(12).text('Items', { underline: true })
    doc.moveDown(0.5)
    doc.fontSize(10)
    packingSlip.items.forEach((line, i) => {
      doc.text(
        `${i + 1}. ${line.sku || '-'} | ${line.name || 'Item'} | Qty: ${line.quantity} ${line.unit || ''}`.trim()
      )
    })
    doc.moveDown(1)
    doc.text(
      `Total: ${packingSlip.currency || 'USD'} ${Number(packingSlip.totalAmount || 0).toFixed(2)}`
    )
    doc.end()
  })
}

// Validation schemas
const orderCreateSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().positive(),
        notes: z.string().optional(),
      })
    )
    .min(1),
  promotionId: z.string().uuid().optional(),
  couponCode: z.string().max(64).optional(),
  status: z
    .enum([
      'DRAFT',
      'PLACED',
      'ACKNOWLEDGED',
      'PROCESSING',
      'SHIPPED',
      'DELIVERED',
      'RECEIVED_PARTIAL',
      'RECEIVED_FULL',
      'INVOICED',
      'COMPLETED',
      'CANCELLED',
    ])
    .default('PLACED'),
})

const supplierOrderCreateSchema = z.object({
  restaurant_id: z.string().uuid(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().positive(),
        notes: z.string().optional(),
      })
    )
    .min(1),
  notes: z.string().optional(),
})

const deliveryStatusSchema = z.enum([
  'assigned',
  'picked_up',
  'out_for_delivery',
  'delivered',
  'failed',
  'rescheduled',
])

const orderUpdateSchema = z.object({
  status: z
    .enum([
      'DRAFT',
      'PLACED',
      'ACKNOWLEDGED',
      'PROCESSING',
      'SHIPPED',
      'DELIVERED',
      'RECEIVED_PARTIAL',
      'RECEIVED_FULL',
      'INVOICED',
      'COMPLETED',
      'CANCELLED',
    ])
    .optional(),
  notes: z.string().optional(),
  cancel_reason: z.string().trim().min(1).max(2000).optional(),
  decline_reason: z.string().trim().min(1).max(2000).optional(),
  delivery_status: deliveryStatusSchema.optional(),
  failure_reason: z.string().optional(),
})

const orderListSchema = z.object({
  status: z.string().optional(),
  supplier: z.string().uuid().optional(),
  limit: z
    .string()
    .transform((val) => parseInt(val, 10))
    .default('20'),
  offset: z
    .string()
    .transform((val) => parseInt(val, 10))
    .default('0'),
})

// Helper function to create invoice from delivered order
export async function createInvoiceFromOrder(order, orderItems, supplierId, client) {
  try {
    // Use a savepoint so failures don't abort the outer transaction
    await client.query('SAVEPOINT invoice_create_sp')
    // Check if invoice already exists for this supplier and order (multi-supplier support)
    const { rows: existingInvoices } = await client.query(
      `
      SELECT id FROM invoice WHERE order_id = $1 AND supplier_id = $2
    `,
      [order.id, supplierId]
    )

    if (existingInvoices.length > 0) {
      logger.info('Invoice already exists for this supplier and order', {
        orderId: order.id,
        supplierId,
      })
      return null
    }

    // Get comprehensive supplier data (name, address, etc.)
    const { rows: suppliers } = await client.query(
      `
      SELECT s.* FROM supplier s WHERE s.id = $1
    `,
      [supplierId]
    )

    if (suppliers.length === 0) {
      logger.error('Supplier not found for invoice creation', { supplierId })
      return null
    }

    // Get tax configuration for supplier (if available)
    const { rows: taxConfigs } = await client.query(
      `
      SELECT tax_rate, tax_type, tax_name
      FROM tax_config
      WHERE supplier_id = $1 AND is_active = true
        AND effective_from <= CURRENT_DATE
        AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
      ORDER BY effective_from DESC
      LIMIT 1
    `,
      [supplierId]
    )

    const taxConfig =
      taxConfigs.length > 0
        ? taxConfigs[0]
        : { tax_rate: 0, tax_type: 'SALES_TAX', tax_name: 'Tax' }
    const taxRate = parseFloat(taxConfig.tax_rate || 0)

    // Generate invoice number using supplier-specific sequence or default
    let invoiceNumber
    try {
      const year = new Date().getFullYear()
      const month = new Date().getMonth() + 1

      // Try to use invoice sequence table if available
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
      } else {
        invoiceNumber = `INV-${year}-${String(month).padStart(2, '0')}-${String(Date.now()).slice(-6)}`
      }
    } catch (seqError) {
      // Fallback if sequence table doesn't exist
      logger.warn('Invoice sequence generation failed, using timestamp', {
        error: seqError.message,
      })
      invoiceNumber = `INV-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(Date.now()).slice(-6)}`
    }

    // Calculate invoice dates
    const invoiceDate = new Date()
    const issueDate = new Date()
    const paymentTermsDays = 30 // Could be fetched from supplier settings
    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + paymentTermsDays)

    // Batch-fetch product details for line items (avoids N+1 inside transaction)
    const productIds = orderItems.map((item) => item.product_id)
    const { rows: productRows } = await client.query(
      `SELECT id, name, sku FROM product WHERE id = ANY($1)`,
      [productIds]
    )
    const productMap = new Map(productRows.map((p) => [p.id, p]))

    let subtotal = 0
    const lineItemsData = []
    for (const item of orderItems) {
      const product = productMap.get(item.product_id) || null
      const unitPrice = parseFloat(item.unit_price || 0)
      const quantity = parseFloat(item.quantity || 0)
      const lineTotal = unitPrice * quantity
      subtotal += lineTotal
      lineItemsData.push({
        product_id: item.product_id,
        description: product?.name || item.product_name || 'Product',
        sku: product?.sku || 'N/A',
        quantity,
        unit_price: unitPrice,
        line_total: lineTotal,
        tax_rate: taxRate,
        tax_amount: (lineTotal * taxRate) / 100,
        order_item_id: item.id,
      })
    }

    // Calculate tax (assuming tax is NOT included in subtotal)
    const taxAmount = (subtotal * taxRate) / 100
    const totalAmount = subtotal + taxAmount

    // Create invoice with comprehensive data
    const { rows: invoices } = await client.query(
      `
      INSERT INTO invoice (
        invoice_number, supplier_id, restaurant_id, order_id,
        invoice_date, issue_date, due_date,
        subtotal, tax_amount, tax_rate, tax_included, total_amount,
        balance_due, paid_amount,
        status, currency,
        payment_terms_days,
        notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *
    `,
      [
        invoiceNumber,
        supplierId,
        order.restaurant_id,
        order.id,
        invoiceDate,
        issueDate,
        dueDate,
        subtotal,
        taxAmount,
        taxRate,
        false, // tax_included
        totalAmount,
        totalAmount, // balance_due initially equals total
        0, // paid_amount
        'ISSUED',
        order.currency || 'USD',
        paymentTermsDays,
        `Invoice for Order #${order.id.slice(0, 8)} - Placed: ${new Date(order.placed_at || order.created_at).toLocaleDateString()}`,
      ]
    )

    const invoice = invoices[0]

    // Create comprehensive invoice line items
    for (const lineItem of lineItemsData) {
      await client.query(
        `
        INSERT INTO invoice_line_item (
          invoice_id, product_id, description, sku,
          quantity, unit_price, line_total,
          tax_rate, tax_amount,
          order_item_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
        [
          invoice.id,
          lineItem.product_id,
          lineItem.description,
          lineItem.sku,
          lineItem.quantity,
          lineItem.unit_price,
          lineItem.line_total,
          lineItem.tax_rate,
          lineItem.tax_amount,
          lineItem.order_item_id,
        ]
      )
    }
    // Release savepoint on success
    await client.query('RELEASE SAVEPOINT invoice_create_sp')

    logger.info('Comprehensive invoice created from order', {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      orderId: order.id,
      supplierId,
      restaurantId: order.restaurant_id,
      subtotal,
      taxAmount,
      totalAmount,
      lineItemsCount: lineItemsData.length,
    })

    return invoice
  } catch (error) {
    // Roll back only the invoice part and continue outer transaction
    try {
      await client.query('ROLLBACK TO SAVEPOINT invoice_create_sp')
    } catch (rollbackError) {
      logger.warn('Failed to rollback invoice savepoint', { error: rollbackError.message })
    }
    logger.error('Error creating invoice from order', { error: error.message, orderId: order.id })
    // Don't throw - invoice creation is non-critical
    return null
  }
}

// Helper function to handle order delivery and update restaurant inventory
async function handleOrderDelivery(orderId, userData, res, req) {
  try {
    const result = await withTransaction(async (client) => {
      // Get order first
      const { rows: orders } = await client.query(
        `
        SELECT * FROM customer_order WHERE id = $1
      `,
        [orderId]
      )

      if (orders.length === 0) {
        throw new NotFoundError('Order not found')
      }

      const order = orders[0]

      const supplierId = await getSupplierIdForRequest(req)
      if (!supplierId) {
        throw new ValidationError('Supplier not found')
      }

      // Get order items (orders are now single-supplier, so all items belong to this supplier)
      const { rows: orderItems } = await client.query(
        `
        SELECT oi.*, p.supplier_id, p.name as product_name
        FROM order_item oi
        JOIN product p ON p.id = oi.product_id
        WHERE oi.order_id = $1
      `,
        [orderId]
      )

      if (orderItems.length === 0) {
        throw new ValidationError('No items found in this order')
      }

      // Verify all items belong to this supplier (safety check for data integrity)
      for (const item of orderItems) {
        if (item.supplier_id !== supplierId) {
          throw new ValidationError('Order contains items from other suppliers')
        }
      }

      const supplierItems = orderItems

      // Update restaurant inventory ONLY for this supplier's items (batch upsert — avoids N+1)
      if (supplierItems.length > 0) {
        // Build VALUES list: ($1,$2,$3), ($4,$5,$6), ...
        const vals = []
        const params = []
        let p = 1
        for (const item of supplierItems) {
          vals.push(`($${p},$${p + 1},$${p + 2},now())`)
          params.push(order.restaurant_id, item.product_id, item.quantity)
          p += 3
        }
        await client.query(
          `INSERT INTO restaurant_inventory (restaurant_id, product_id, quantity, updated_at)
           VALUES ${vals.join(', ')}
           ON CONFLICT (restaurant_id, product_id)
           DO UPDATE SET quantity = restaurant_inventory.quantity + EXCLUDED.quantity, updated_at = now()`,
          params
        )
      }

      // Create invoice from the order (orders are now single-supplier)
      // Do not create invoice here; invoice will be created after restaurant receiving
      const invoice = null

      // Mark order as DELIVERED; restaurant will move it to RECEIVED_* upon receiving
      await client.query(
        `
        UPDATE customer_order 
        SET status = 'DELIVERED', updated_at = now()
        WHERE id = $1
      `,
        [orderId]
      )
      order.status = 'DELIVERED'

      logger.info('Order delivered and restaurant inventory updated', {
        orderId: order.id,
        restaurantId: order.restaurant_id,
        supplierId,
        itemCount: supplierItems.length,
        actor: userData.id,
      })

      return { order, supplierId }
    })

    // Send notification to restaurant about completed order
    try {
      const { rows: restaurantInfo } = await query(
        `
        SELECT id, name FROM restaurant WHERE id = $1
      `,
        [result.order.restaurant_id]
      )

      const { rows: supplierInfo } = await query(
        `
        SELECT id, name FROM supplier WHERE id = $1
      `,
        [result.supplierId]
      )

      await notifyOrderStatusChange(
        {
          id: result.order.id,
          total_amount: result.order.total_amount,
          restaurant_id: result.order.restaurant_id,
          supplier_id: result.supplierId,
          supplier_name: supplierInfo[0]?.name || 'Supplier',
        },
        'COMPLETED'
      )

      logger.info('Notification sent successfully')
    } catch (notifError) {
      logger.error('Failed to send completion notification', { error: notifError.message })
    }

    res.json({
      ok: true,
      data: { order: result.order },
      error: null,
      requestId: res.locals.requestId,
    })
  } catch (error) {
    logger.error('Handle order delivery error', { error: error.message })
    // Return meaningful status codes for known errors
    if (error instanceof ValidationError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: error.message },
        requestId: res.locals.requestId,
      })
    }
    if (error instanceof NotFoundError) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: error.message },
        requestId: res.locals.requestId,
      })
    }
    return res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to deliver order' },
      requestId: res.locals.requestId,
    })
  }
}

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
      whereConditions.push(`p.supplier_id = $${paramIndex}`)
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

    // Supplier filter (for admin when not impersonating)
    if (params.supplier && req.userData.role === 'ADMIN' && !tenant) {
      whereConditions.push(`p.supplier_id = $${paramIndex}`)
      queryParams.push(params.supplier)
      paramIndex++
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''

    const sql = `
      SELECT DISTINCT
        o.*,
        r.name as restaurant_name,
        r.slug as restaurant_slug
      FROM customer_order o
      JOIN restaurant r ON r.id = o.restaurant_id
      LEFT JOIN order_item oi ON oi.order_id = o.id
      LEFT JOIN product p ON p.id = oi.product_id
      ${whereClause}
      ORDER BY o.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `

    queryParams.push(params.limit, params.offset)

    const { rows } = await query(sql, queryParams)

    // Get items for each order
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
    const ordersWithItems = rows.map((order) => ({
      ...order,
      items: itemsByOrder[order.id] || [],
    }))

    // Get total count for pagination
    const countSql = `
      SELECT COUNT(DISTINCT o.id) as total
      FROM customer_order o
      LEFT JOIN order_item oi ON oi.order_id = o.id
      LEFT JOIN product p ON p.id = oi.product_id
      ${whereClause}
    `

    const countParams = queryParams.slice(0, -2) // Remove limit and offset
    const { rows: countRows } = await query(countSql, countParams)

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
router.use(ordersDriverRoutes)

async function loadOrderWarehouseAssignments(orderId) {
  const { rows } = await query(
    `SELECT owa.*, w.name AS warehouse_name, w.code AS warehouse_code,
            oi.product_id, p.name AS product_name
     FROM order_warehouse_assignment owa
     JOIN warehouse w ON w.id = owa.warehouse_id
     LEFT JOIN order_item oi ON oi.id = owa.order_item_id
     LEFT JOIN product p ON p.id = oi.product_id
     WHERE owa.order_id = $1
     ORDER BY w.name, owa.assigned_at`,
    [orderId]
  )
  return rows
}

// Order warehouse assignments (no extra feature gate — exists in single-warehouse mode too)
router.get('/:id/warehouses', requireAuth, async (req, res, next) => {
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
  requireAuth,
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
  requireAuth,
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

// Get order by ID
router.get('/:id', requireAuth, async (req, res, next) => {
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

    // Get order items
    const { rows: items } = await query(
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
    )

    const warehouseAssignments = await loadOrderWarehouseAssignments(id)

    const { rows: promotionRows } = await query(
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
    )
    const promotionUsage = promotionRows[0]
    const appliedPromotion = promotionUsage
      ? {
          promotionId: promotionUsage.promotion_id,
          promotionName: promotionUsage.promotion_name,
          promotionType: promotionUsage.promotion_type,
          discountAmount: Number(promotionUsage.discount_applied),
        }
      : null

    const { rows: replacementOrders } = await query(
      `
      SELECT id, status, placement_source, source_order_id, source_dispute_id, created_at, total_amount
      FROM customer_order
      WHERE source_order_id = $1
      ORDER BY created_at ASC
      `,
      [id]
    )

    let sourceDispute = null
    if (order.source_dispute_id) {
      const { rows: disputeRows } = await query(
        `SELECT id, status, resolution_type, order_id FROM disputes WHERE id = $1`,
        [order.source_dispute_id]
      )
      sourceDispute = disputeRows[0] || null
    }

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

// Create order (restaurant only)
router.post(
  '/',
  requireAuth,
  requireRole(['RESTAURANT']),
  requirePermission('ORDERS_CREATE'),
  async (req, res) => {
    try {
      const orderData = orderCreateSchema.parse(req.body)

      const restaurantId = await getRestaurantIdForRequest(req)
      if (!restaurantId) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: {
            name: 'FORBIDDEN',
            message: 'Restaurant workspace not found for user',
          },
          requestId: req.requestId,
        })
      }

      // Group items by supplier - split into separate orders per supplier
      const orderStatus = orderData.status || 'PLACED'

      // Batch-fetch all products and current prices (avoids N+1)
      const productIds = [...new Set(orderData.items.map((item) => item.productId))]
      const { rows: products } = await query(
        `
      SELECT p.*, pr.amount as current_price, pr.currency
      FROM product p
      LEFT JOIN LATERAL (
        SELECT amount, currency FROM price pr
        WHERE pr.product_id = p.id
          AND (pr.valid_to IS NULL OR now() BETWEEN pr.valid_from AND pr.valid_to)
        ORDER BY pr.valid_from DESC
        LIMIT 1
      ) pr ON true
      WHERE p.id = ANY($1)
      `,
        [productIds]
      )

      const productMap = new Map(products.map((p) => [p.id, p]))

      // Validate and group items by supplier
      const supplierGroups = new Map()
      for (const item of orderData.items) {
        const product = productMap.get(item.productId)
        if (!product) {
          throw new ValidationError(`Product ${item.productId} not found`)
        }
        if (!product.current_price) {
          throw new ValidationError(`No valid price found for product ${product.sku}`)
        }
        if (!supplierGroups.has(product.supplier_id)) {
          supplierGroups.set(product.supplier_id, [])
        }
        supplierGroups.get(product.supplier_id).push({
          ...item,
          product,
          unitPrice: Number(product.current_price),
        })
      }

      // Atomic check and reserve usage slots before creating orders (avoids race conditions)
      if (orderStatus === 'PLACED') {
        const ordersToCreate = supplierGroups.size
        const usageResult = await checkAndIncrementUsage(
          restaurantId,
          'RESTAURANT',
          'orders_per_day',
          ordersToCreate
        )
        if (!usageResult.allowed) {
          const [subscription, recommendedPlans] = await Promise.all([
            getTenantSubscription(restaurantId, 'RESTAURANT'),
            getRecommendedPlanNames('RESTAURANT'),
          ])
          const limitCheck = { current: usageResult.current, limit: usageResult.limit }
          const err = buildLimitExceededPayload(
            limitCheck,
            'orders_per_day',
            subscription?.plan_name || subscription?.plan_display_name,
            recommendedPlans
          )
          err.details.requested = ordersToCreate
          return res.status(403).json({
            ok: false,
            data: null,
            error: err,
            requestId: req.requestId,
          })
        }
      }

      // Create separate order for each supplier
      const createdOrders = []

      const result = await withTransaction(async (client) => {
        for (const [supplierId, items] of supplierGroups.entries()) {
          // Create order for this supplier
          const {
            rows: [order],
          } = await client.query(
            `
          INSERT INTO customer_order (restaurant_id, currency, status)
          VALUES ($1, 'USD', $2)
          RETURNING *
        `,
            [restaurantId, orderStatus]
          )

          let totalAmount = 0
          const orderItems = []

          // Process items for this supplier
          for (const item of items) {
            await assertAndDeductSupplierStock(client, item.productId, item.quantity, {
              sku: item.product.sku,
            })

            // Calculate line total
            const lineTotal = item.unitPrice * item.quantity
            totalAmount += lineTotal

            // Create order item
            const {
              rows: [orderItem],
            } = await client.query(
              `
            INSERT INTO order_item (
              order_id, product_id, supplier_id, quantity, unit_price, line_total, notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
          `,
              [
                order.id,
                item.productId,
                supplierId,
                item.quantity,
                item.unitPrice,
                lineTotal,
                item.notes,
              ]
            )

            orderItems.push(orderItem)
          }

          // Update order total and placed_at (only if status is PLACED)
          if (orderStatus === 'PLACED') {
            await client.query(
              `
            UPDATE customer_order 
            SET total_amount = $1, placed_at = now()
            WHERE id = $2
          `,
              [totalAmount, order.id]
            )
          } else {
            // For DRAFT orders, just update total_amount
            await client.query(
              `
            UPDATE customer_order 
            SET total_amount = $1
            WHERE id = $2
          `,
              [totalAmount, order.id]
            )
          }

          let appliedPromotion = null
          if (orderStatus === 'PLACED') {
            const promoLines = items.map((item) => ({
              productId: item.productId,
              categoryId: item.product.category_id,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              lineTotal: item.unitPrice * item.quantity,
            }))

            if (orderData.promotionId) {
              appliedPromotion = await applyPromotionByIdToOrder({
                client,
                promotionId: orderData.promotionId,
                orderId: order.id,
                supplierId,
                restaurantId,
                subtotal: totalAmount,
                lineItems: promoLines,
              })
            } else if (orderData.couponCode) {
              const couponMatch = await validateCouponForOrder({
                couponCode: orderData.couponCode,
                supplierId,
                restaurantId,
                subtotal: totalAmount,
                lineItems: promoLines,
              })
              if (couponMatch) {
                appliedPromotion = await applyPromotionByIdToOrder({
                  client,
                  promotionId: couponMatch.promotion.id,
                  orderId: order.id,
                  supplierId,
                  restaurantId,
                  subtotal: totalAmount,
                  lineItems: promoLines,
                })
              }
            }

            if (!appliedPromotion) {
              appliedPromotion = await applyBestPromotionToOrder({
                client,
                orderId: order.id,
                supplierId,
                restaurantId,
                subtotal: totalAmount,
                lineItems: promoLines,
              })
            }

            if (appliedPromotion) {
              totalAmount = appliedPromotion.totalAfterDiscount
            }
          }

          let finalOrder = {
            ...order,
            total_amount: totalAmount,
            items: orderItems,
            status: orderStatus,
            appliedPromotion,
          }

          const { rows: supplierRows } = await client.query(
            `SELECT * FROM supplier WHERE id = $1`,
            [supplierId]
          )
          if (supplierRows.length) {
            const multiActive = await isFeatureEnabled(supplierId, 'SUPPLIER', 'multi_warehouse')
            const fulfillment = await assignWarehousesToOrder(client, {
              order: { ...order, restaurant_id: restaurantId },
              orderItems,
              supplier: supplierRows[0],
              multiWarehouseActive: multiActive,
            })
            finalOrder = { ...finalOrder, warehouseFulfillment: fulfillment }
          }

          createdOrders.push(finalOrder)
        }

        return createdOrders
      })

      // If only one order was created, return it directly. Otherwise, return array of orders
      const singleOrder = result.length === 1 ? result[0] : null

      // Log and send notifications for each created order
      for (const order of result) {
        logger.info('Order created', {
          orderId: order.id,
          restaurantId: order.restaurant_id,
          supplierId: order.items[0]?.supplier_id,
          totalAmount: order.total_amount,
          itemCount: order.items.length,
          actor: req.userData.id,
        })

        if (order.status === 'PLACED') {
          await writeAuditLog(req, {
            action_type: 'order.created',
            tenant_type: 'RESTAURANT',
            tenant_id: order.restaurant_id,
            target_id: order.id,
            payload_json: {
              resource_type: 'order',
              total_amount: order.total_amount,
              promotion: order.appliedPromotion || null,
            },
          })
        }

        // Send notification to supplier about new order (only if PLACED, not DRAFT)
        if (order.status === 'PLACED' && order.items.length > 0) {
          try {
            const supplierId = order.items[0].supplier_id
            await notifyOrderStatusChange(
              {
                id: order.id,
                total_amount: order.total_amount,
                restaurant_id: order.restaurant_id,
                supplier_id: supplierId,
              },
              'PLACED'
            )
          } catch (notifError) {
            // Don't fail order creation if notification fails
            logger.error('Failed to send order notification', { error: notifError.message })
          }
        }
      }

      // Usage already reserved atomically in checkAndIncrementUsage above (no second increment)

      // Return single order if only one, otherwise return array
      res.status(201).json({
        ok: true,
        data: singleOrder ? { order: singleOrder } : { orders: result },
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
            message: 'Invalid order data',
            details: error.errors,
          },
          requestId: req.requestId,
        })
      }

      logger.error('Create order error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          name: 'INTERNAL_ERROR',
          message: 'Failed to create order',
        },
        requestId: req.requestId,
      })
    }
  }
)

// Create order manually by supplier (for phone orders, chat orders, etc.)
router.post(
  '/manual',
  requireAuth,
  requireRole(['SUPPLIER']),
  requirePermission('ORDERS_CREATE'),
  async (req, res) => {
    try {
      const orderData = supplierOrderCreateSchema.parse(req.body)

      const supplierId = await getSupplierIdForRequest(req)

      if (!supplierId) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'VALIDATION_ERROR',
            message: 'Supplier record not found for user',
          },
          requestId: req.requestId,
        })
      }

      // Verify restaurant exists
      const { rows: restaurants } = await query('SELECT id FROM restaurant WHERE id = $1', [
        orderData.restaurant_id,
      ])

      if (restaurants.length === 0) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'VALIDATION_ERROR',
            message: 'Restaurant not found',
          },
          requestId: req.requestId,
        })
      }

      // Create order with transaction
      const result = await withTransaction(async (client) => {
        // Create order with status PLACED
        const {
          rows: [order],
        } = await client.query(
          `
        INSERT INTO customer_order (restaurant_id, currency, status, notes)
        VALUES ($1, 'USD', 'PLACED', $2)
        RETURNING *
      `,
          [orderData.restaurant_id, orderData.notes || null]
        )

        let totalAmount = 0
        const orderItems = []

        // Process each item
        for (const item of orderData.items) {
          // Get product and current price
          const { rows: products } = await client.query(
            `
          SELECT p.*, pr.amount as current_price, pr.currency
          FROM product p
          LEFT JOIN price pr ON pr.product_id = p.id 
            AND (pr.valid_to IS NULL OR now() BETWEEN pr.valid_from AND pr.valid_to)
          WHERE p.id = $1 AND p.supplier_id = $2
        `,
            [item.productId, supplierId]
          )

          if (products.length === 0) {
            throw new ValidationError(
              `Product ${item.productId} not found or doesn't belong to supplier`
            )
          }

          const product = products[0]

          if (!product.current_price) {
            throw new ValidationError(`No valid price found for product ${product.sku}`)
          }

          await assertAndDeductSupplierStock(client, item.productId, item.quantity, {
            sku: product.sku,
            reserve: true,
          })

          // Calculate line total
          const unitPrice = Number(product.current_price)
          const lineTotal = unitPrice * item.quantity
          totalAmount += lineTotal

          // Create order item
          const {
            rows: [orderItem],
          } = await client.query(
            `
          INSERT INTO order_item (
            order_id, product_id, supplier_id, quantity, unit_price, line_total, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
        `,
            [order.id, item.productId, supplierId, item.quantity, unitPrice, lineTotal, item.notes]
          )

          orderItems.push(orderItem)
        }

        // Update order total
        await client.query(
          `
        UPDATE customer_order 
        SET total_amount = $1, placed_at = now()
        WHERE id = $2
      `,
          [totalAmount, order.id]
        )

        const { rows: supplierRows } = await client.query(`SELECT * FROM supplier WHERE id = $1`, [
          supplierId,
        ])
        let warehouseFulfillment = null
        if (supplierRows.length) {
          const multiActive = await isFeatureEnabled(supplierId, 'SUPPLIER', 'multi_warehouse')
          warehouseFulfillment = await assignWarehousesToOrder(client, {
            order: { ...order, restaurant_id: order.restaurant_id },
            orderItems,
            supplier: supplierRows[0],
            multiWarehouseActive: multiActive,
          })
        }

        return {
          ...order,
          total_amount: totalAmount,
          items: orderItems,
          warehouseFulfillment,
        }
      })

      logger.info('Manual order created by supplier', {
        orderId: result.id,
        restaurantId: result.restaurant_id,
        totalAmount: result.total_amount,
        itemCount: result.items.length,
        actor: req.userData.id,
      })

      res.status(201).json({
        ok: true,
        data: { order: result },
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
            message: 'Invalid order data',
            details: error.errors,
          },
          requestId: req.requestId,
        })
      }

      logger.error('Create manual order error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          name: 'INTERNAL_ERROR',
          message: 'Failed to create order',
        },
        requestId: req.requestId,
      })
    }
  }
)

// Update order status
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

      // If completing, update restaurant inventory
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

      if (updateData.status === 'CANCELLED' && order.status !== 'CANCELLED') {
        await restoreSupplierStockForOrder(client, id)
      }

      return updated
    })

    logger.info('Order updated', {
      orderId: rows[0].id,
      status: rows[0].status,
      actor: req.userData.id,
    })

    // Send notification if status changed
    if (updateData.status && updateData.status !== order.status) {
      try {
        // Get supplier_id from order items (order.supplier_id was set earlier in the function)
        const supplierIdForNotification = order.supplier_id

        // Get restaurant and supplier info
        const { rows: restaurantInfo } = await query(
          `
          SELECT id, name FROM restaurant WHERE id = $1
        `,
          [rows[0].restaurant_id]
        )

        const { rows: supplierInfo } = await query(
          `
          SELECT id, name FROM supplier WHERE id = $1
        `,
          [supplierIdForNotification]
        )

        // Notify both parties based on status
        if (updateData.status === 'PLACED') {
          // New order - notify supplier
          await notifyOrderStatusChange(
            {
              id: rows[0].id,
              total_amount: rows[0].total_amount,
              restaurant_id: rows[0].restaurant_id,
              restaurant_name: restaurantInfo[0]?.name || 'Restaurant',
              supplier_id: supplierIdForNotification,
            },
            updateData.status
          )
        } else if (updateData.status === 'CANCELLED') {
          await notifyOrderStatusChange(
            {
              id: rows[0].id,
              total_amount: rows[0].total_amount,
              restaurant_id: rows[0].restaurant_id,
              restaurant_name: restaurantInfo[0]?.name || 'Restaurant',
              supplier_id: supplierIdForNotification,
              supplier_name: supplierInfo[0]?.name || 'Supplier',
              cancelled_by: rows[0].cancelled_by,
              cancel_reason: rows[0].cancel_reason,
            },
            updateData.status
          )
        } else {
          // All other status changes - notify restaurant
          await notifyOrderStatusChange(
            {
              id: rows[0].id,
              total_amount: rows[0].total_amount,
              restaurant_id: rows[0].restaurant_id,
              supplier_id: supplierIdForNotification,
              supplier_name: supplierInfo[0]?.name || 'Supplier',
            },
            updateData.status
          )
        }
      } catch (notifError) {
        // Don't fail the order update if notification fails
        logger.error('Failed to send notification', { error: notifError.message })
      }
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

// Send reminder to supplier (restaurant only)
router.post('/:id/remind', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
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
    const { notifyTenantUsers } = await import('../services/notification.service.js')

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
})

// Get packing slip as PDF (must be before /:id/packing-slip so path matches)
router.get(
  '/:id/packing-slip/pdf',
  requireAuth,
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
      const buf = await buildPackingSlipPdf(packingSlip)
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
  requireAuth,
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

export { router as ordersRoutes }
