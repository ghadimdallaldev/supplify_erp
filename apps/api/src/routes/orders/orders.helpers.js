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
  hasActiveSupplierOrderPromotionsBatch,
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
import { getEffectiveTenant } from '../../lib/impersonation.js'
import { t, toIntlLocale, resolveLocale } from '../../i18n/index.js'

function elapsedMsSince(startMs) {
  return Math.round(performance.now() - startMs)
}

/** Fire-and-forget order status notification; logs completion or failure without blocking HTTP. */
function scheduleOrderStatusNotification(orderRow, status, supplierId) {
  void Promise.resolve()
    .then(async () => {
      if (status === 'PLACED') {
        return notifyOrderStatusChange(
          {
            id: orderRow.id,
            total_amount: orderRow.total_amount,
            restaurant_id: orderRow.restaurant_id,
            supplier_id: supplierId,
          },
          status
        )
      }

      let restaurantName = orderRow.restaurant_name
      let supplierName = orderRow.supplier_name

      if (!restaurantName && orderRow.restaurant_id) {
        const { rows: restaurantInfo } = await query(
          `SELECT id, name FROM restaurant WHERE id = $1`,
          [orderRow.restaurant_id]
        )
        restaurantName = restaurantInfo[0]?.name || 'Restaurant'
      }

      if (!supplierName && supplierId) {
        const { rows: supplierInfo } = await query(`SELECT id, name FROM supplier WHERE id = $1`, [
          supplierId,
        ])
        supplierName = supplierInfo[0]?.name || 'Supplier'
      }

      return notifyOrderStatusChange(
        {
          id: orderRow.id,
          total_amount: orderRow.total_amount,
          restaurant_id: orderRow.restaurant_id,
          restaurant_name: restaurantName,
          supplier_id: supplierId,
          supplier_name: supplierName,
          cancelled_by: orderRow.cancelled_by,
          cancel_reason: orderRow.cancel_reason,
        },
        status
      )
    })
    .then((sent) => {
      logger.info({
        event: 'order.notification.background_complete',
        orderId: orderRow.id,
        status,
        supplierId,
        recipientCount: sent?.recipientCount ?? sent?.length ?? 0,
        failedRecipientCount: sent?.failedCount ?? 0,
        notificationDurationMs: sent?.durationMs ?? 0,
      })
    })
    .catch((error) => {
      logger.warn({
        event: 'order.notification.background_failed',
        orderId: orderRow.id,
        status,
        supplierId,
        error: error?.message,
        stack: error?.stack,
      })
    })
}

function scheduleOrderPlacedNotification(order, supplierId) {
  scheduleOrderStatusNotification(order, 'PLACED', supplierId)
}

/** Build PDF buffer for a packing slip */
function buildPackingSlipPdf(packingSlip, locale = 'en') {
  const lng = resolveLocale(locale)
  const intlLocale = toIntlLocale(lng)

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 })
    const chunks = []
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    doc.fontSize(20).text(t('orders.packingSlip.title', lng), { continued: false })
    doc
      .fontSize(10)
      .text(t('orders.packingSlip.orderNumber', lng, { number: packingSlip.orderNumber }), {
        continued: false,
      })
    doc.moveDown()
    doc.text(
      `${t('orders.packingSlip.date', lng)} ${
        packingSlip.orderDate
          ? new Date(packingSlip.orderDate).toLocaleDateString(intlLocale)
          : t('orders.packingSlip.na', lng)
      }`
    )
    doc.moveDown()
    doc.text(`${t('orders.packingSlip.shipTo', lng)} ${packingSlip.restaurantName || ''}`)
    if (packingSlip.restaurantAddress && typeof packingSlip.restaurantAddress === 'object') {
      const addr = packingSlip.restaurantAddress
      doc.text([addr.street, addr.city, addr.region, addr.country].filter(Boolean).join(', '))
    } else if (typeof packingSlip.restaurantAddress === 'string') {
      doc.text(packingSlip.restaurantAddress)
    }
    doc.moveDown(1.5)

    doc.fontSize(12).text(t('orders.packingSlip.items', lng), { underline: true })
    doc.moveDown(0.5)
    doc.fontSize(10)
    packingSlip.items.forEach((line, i) => {
      doc.text(
        `${i + 1}. ${line.sku || '-'} | ${line.name || t('orders.packingSlip.itemFallback', lng)} | ${t('orders.packingSlip.qty', lng)} ${line.quantity} ${line.unit || ''}`.trim()
      )
    })
    doc.moveDown(1)
    doc.text(
      `${t('orders.packingSlip.total', lng)} ${packingSlip.currency || 'USD'} ${Number(packingSlip.totalAmount || 0).toFixed(2)}`
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
  loyaltyRedeem: z
    .array(
      z.object({
        supplierId: z.string().uuid(),
        points: z.number().int().positive(),
      })
    )
    .optional(),
  quoteLocks: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quoteRequestSupplierId: z.string().uuid(),
        quoteResponseItemId: z.string().uuid(),
      })
    )
    .optional(),
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
  q: z.string().max(200).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z
    .string()
    .transform((val) => Math.min(Math.max(parseInt(val, 10) || 20, 1), 100))
    .default('20'),
  offset: z
    .string()
    .transform((val) => Math.max(parseInt(val, 10) || 0, 0))
    .default('0'),
  includeItems: z
    .string()
    .transform((val) => val === 'true')
    .default('false'),
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

// Legacy COMPLETED status: mark DELIVERED only. Restaurant inventory and invoices
// are applied exclusively via receiving (prevents double-count if receive also runs).
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

      // Mark order as DELIVERED; restaurant inventory updates only on receiving
      await client.query(
        `
        UPDATE customer_order 
        SET status = 'DELIVERED', updated_at = now()
        WHERE id = $1
      `,
        [orderId]
      )
      order.status = 'DELIVERED'

      logger.info('Order marked DELIVERED; inventory deferred to receiving', {
        orderId: order.id,
        restaurantId: order.restaurant_id,
        supplierId,
        itemCount: orderItems.length,
        actor: userData.id,
      })

      return { order, supplierId }
    })

    // Notify restaurant that goods are ready to receive
    try {
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
        'DELIVERED'
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

/**
 * Enforce tenant-scoped read access for GET order detail (and similar read paths).
 * Prefers req.tenantContext (set by resolveTenantContext) over a fresh getRequestTenant lookup.
 * Admin without impersonation may read any order (matches order list behavior).
 */
export async function assertOrderReadAccess(req, order, orderId) {
  if (req.userData?.role === 'ADMIN' && !getEffectiveTenant(req)) {
    return true
  }

  const tenant = req.tenantContext
    ? {
        tenantId: req.tenantContext.tenantId,
        tenantType: req.tenantContext.tenantType,
      }
    : await getRequestTenant(req)

  if (tenant?.tenantType === 'RESTAURANT') {
    return order.restaurant_id === tenant.tenantId
  }

  if (tenant?.tenantType === 'SUPPLIER') {
    const { rows: supplierItems } = await query(
      `SELECT 1 FROM order_item WHERE order_id = $1 AND supplier_id = $2 LIMIT 1`,
      [orderId, tenant.tenantId]
    )
    return supplierItems.length > 0
  }

  if (req.userData?.role === 'RESTAURANT') {
    const restaurantId = await getRestaurantIdForRequest(req)
    return Boolean(restaurantId && restaurantId === order.restaurant_id)
  }

  if (req.userData?.role === 'SUPPLIER') {
    const { rows: supplierItems } = await query(
      `SELECT 1 FROM order_item oi JOIN supplier s ON s.id = oi.supplier_id WHERE oi.order_id = $1 AND s.contact_email = $2 LIMIT 1`,
      [orderId, req.userData.email]
    )
    return supplierItems.length > 0
  }

  return false
}

export async function loadOrderWarehouseAssignments(orderId) {
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

export {
  elapsedMsSince,
  scheduleOrderStatusNotification,
  scheduleOrderPlacedNotification,
  handleOrderDelivery,
  buildPackingSlipPdf,
  orderCreateSchema,
  supplierOrderCreateSchema,
  deliveryStatusSchema,
  orderUpdateSchema,
  orderListSchema,
}
