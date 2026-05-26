import express from 'express'
import PDFDocument from 'pdfkit'
import { requireAuth, requireRole, resolveTenantContext, requirePermission } from '../lib/rbac.js'
import { invoicesMutationGuard } from '../lib/route-permissions.js'
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { NotFoundError, ValidationError } from '../middlewares/errorHandler.js'
import { z } from 'zod'
import { notifyInvoiceIssued } from '../services/notification.service.js'
import { requireFeature } from '../lib/subscription.js'

const router = express.Router()

const financeInvoicesGate = requireFeature(
  'finance_invoices',
  (req) => req.tenantContext?.tenantId,
  (req) => req.tenantContext?.tenantType
)

router.use(
  requireAuth,
  resolveTenantContext,
  financeInvoicesGate,
  requirePermission('INVOICES_VIEW'),
  invoicesMutationGuard
)

/** Build PDF buffer for an invoice with line items */
async function buildInvoicePdf(invoice, lineItems) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 })
    const chunks = []
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    doc.fontSize(20).text('INVOICE', { continued: false })
    doc.fontSize(10).text(`#${invoice.invoice_number}`, { continued: false })
    doc.moveDown()
    doc.text(`Date: ${invoice.invoice_date}`)
    doc.text(`Due: ${invoice.due_date}`)
    doc.text(`Status: ${invoice.status || 'ISSUED'}`)
    doc.moveDown()
    doc.text(`Supplier: ${invoice.supplier_name || ''}`)
    doc.text(`Restaurant: ${invoice.restaurant_name || ''}`)
    doc.moveDown(1.5)

    doc.fontSize(12).text('Line items', { underline: true })
    doc.moveDown(0.5)
    doc.fontSize(10)
    lineItems.forEach((line, i) => {
      doc.text(
        `${i + 1}. ${line.description || 'Item'} | Qty: ${line.quantity} @ ${Number(line.unit_price).toFixed(2)} = ${Number(line.line_total).toFixed(2)}`
      )
    })
    doc.moveDown(1)
    doc.text(`Subtotal: $${Number(invoice.subtotal || 0).toFixed(2)}`)
    doc.text(`Tax: $${Number(invoice.tax_amount || 0).toFixed(2)}`)
    doc
      .fontSize(12)
      .text(`Total: $${Number(invoice.total_amount || 0).toFixed(2)}`, { continued: false })
    doc.end()
  })
}

// Validation schemas
const invoiceCreateSchema = z.object({
  restaurant_id: z.string().uuid(),
  order_id: z.string().uuid().optional(),
  due_date: z.string(),
  tax_rate: z.number().default(0),
  tax_included: z.boolean().default(false),
  payment_terms_days: z.number().int().default(30),
  notes: z.string().optional(),
})

// Get all invoices for current supplier
// Also allow RESTAURANT to call this endpoint safely (returns empty list)
router.get('/', requireAuth, requireRole(['SUPPLIER', 'ADMIN', 'RESTAURANT']), async (req, res) => {
  try {
    // If the caller is not a supplier/admin, return empty to avoid frontend 403 noise
    if (req.userData.role && !['SUPPLIER', 'ADMIN'].includes(req.userData.role)) {
      return res.json({
        ok: true,
        data: { invoices: [] },
        error: null,
        requestId: req.requestId,
      })
    }

    let invoicesQuery = `
      SELECT 
        i.*,
        r.name as restaurant_name,
        o.id as order_id,
        o.status as order_status,
        COALESCE(SUM(p.payment_amount) FILTER (WHERE p.status = 'COMPLETED'), 0) as total_paid
      FROM invoice i
      JOIN supplier s ON s.id = i.supplier_id
      LEFT JOIN restaurant r ON r.id = i.restaurant_id
      LEFT JOIN customer_order o ON o.id = i.order_id
      LEFT JOIN payment p ON p.invoice_id = i.id
      WHERE s.contact_email = $1
      GROUP BY i.id, r.name, o.id, o.status
      ORDER BY i.issue_date DESC, i.invoice_number DESC
    `

    const { rows } = await query(invoicesQuery, [req.userData.email])

    res.json({
      ok: true,
      data: { invoices: rows },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error({
      message: 'Get invoices error',
      error: error.message,
      stack: error.stack,
    })
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get invoices',
        details: error.message,
      },
      requestId: req.requestId,
    })
  }
})

// Get invoice PDF (must be before GET /:id so /:id/pdf is matched)
router.get('/:id/pdf', requireAuth, async (req, res) => {
  try {
    const { id } = req.params

    const { rows } = await query(
      `
      SELECT 
        i.*,
        r.name as restaurant_name,
        s.name as supplier_name
      FROM invoice i
      LEFT JOIN restaurant r ON r.id = i.restaurant_id
      LEFT JOIN supplier s ON s.id = i.supplier_id
      WHERE i.id = $1
    `,
      [id]
    )

    if (rows.length === 0) {
      throw new NotFoundError('Invoice not found')
    }

    const invoice = rows[0]
    const role = req.userData?.role

    if (role === 'SUPPLIER') {
      const { rows: suppliers } = await query('SELECT id FROM supplier WHERE contact_email = $1', [
        req.userData.email,
      ])
      if (suppliers.length === 0 || suppliers[0].id !== invoice.supplier_id) {
        throw new NotFoundError('Invoice not found')
      }
    } else if (role === 'RESTAURANT') {
      const { rows: restaurants } = await query(
        'SELECT id FROM restaurant WHERE contact_email = $1',
        [req.userData.email]
      )
      if (restaurants.length === 0 || restaurants[0].id !== invoice.restaurant_id) {
        throw new NotFoundError('Invoice not found')
      }
    } else if (role !== 'ADMIN') {
      throw new NotFoundError('Invoice not found')
    }

    const { rows: lineItems } = await query(
      'SELECT * FROM invoice_line_item WHERE invoice_id = $1 ORDER BY created_at',
      [id]
    )

    const pdfBuffer = await buildInvoicePdf(invoice, lineItems)
    const filename = `invoice-${(invoice.invoice_number || id).replace(/[^a-zA-Z0-9-_]/g, '-')}.pdf`

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Type', 'application/pdf')
    res.send(pdfBuffer)
  } catch (error) {
    logger.error('Invoice PDF error:', error)
    res.status(error.statusCode || 500).json({
      ok: false,
      data: null,
      error: {
        name: error.name || 'INTERNAL_ERROR',
        message: error.message || 'Failed to generate invoice PDF',
      },
      requestId: req.requestId,
    })
  }
})

// Get invoice by ID
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params

    const { rows } = await query(
      `
      SELECT 
        i.*,
        r.name as restaurant_name,
        r.contact_name as restaurant_contact,
        r.email as restaurant_email,
        r.phone as restaurant_phone,
        s.name as supplier_name,
        s.contact_email as supplier_email,
        s.phone as supplier_phone
      FROM invoice i
      LEFT JOIN restaurant r ON r.id = i.restaurant_id
      LEFT JOIN supplier s ON s.id = i.supplier_id
      WHERE i.id = $1
    `,
      [id]
    )

    if (rows.length === 0) {
      throw new NotFoundError('Invoice not found')
    }

    const invoice = rows[0]
    const role = req.userData?.role

    // Tenant scoping: only the invoice's supplier, restaurant, or admin may read it
    if (role === 'SUPPLIER') {
      const { rows: suppliers } = await query('SELECT id FROM supplier WHERE contact_email = $1', [
        req.userData.email,
      ])
      if (suppliers.length === 0 || suppliers[0].id !== invoice.supplier_id) {
        throw new NotFoundError('Invoice not found')
      }
    } else if (role === 'RESTAURANT') {
      const { rows: restaurants } = await query(
        'SELECT id FROM restaurant WHERE contact_email = $1',
        [req.userData.email]
      )
      if (restaurants.length === 0 || restaurants[0].id !== invoice.restaurant_id) {
        throw new NotFoundError('Invoice not found')
      }
    } else if (role !== 'ADMIN') {
      throw new NotFoundError('Invoice not found')
    }

    // Get line items
    const { rows: lineItems } = await query(
      `
      SELECT * FROM invoice_line_item WHERE invoice_id = $1 ORDER BY created_at
    `,
      [id]
    )

    res.json({
      ok: true,
      data: {
        invoice,
        lineItems,
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Get invoice error:', error)
    res.status(error.statusCode || 500).json({
      ok: false,
      data: null,
      error: {
        name: error.name || 'INTERNAL_ERROR',
        message: error.message || 'Failed to get invoice',
      },
      requestId: req.requestId,
    })
  }
})

// Create invoice from order
router.post('/', requireAuth, requireRole(['SUPPLIER', 'ADMIN']), async (req, res) => {
  try {
    const invoiceData = invoiceCreateSchema.parse(req.body)

    // Get supplier ID
    const { rows: suppliers } = await query('SELECT id FROM supplier WHERE contact_email = $1', [
      req.userData.email,
    ])

    if (suppliers.length === 0) {
      throw new ValidationError('Supplier record not found for user')
    }

    const supplierId = suppliers[0].id

    await query('BEGIN')

    try {
      // Generate invoice number
      const { rows: invoiceNum } = await query(
        'SELECT generate_invoice_number($1) as invoice_number',
        [supplierId]
      )
      const invoiceNumber = invoiceNum[0].invoice_number

      // Calculate dates
      const invoiceDate = new Date()
      const dueDate = new Date(invoiceData.due_date)

      // Get order if provided
      let orderItems = []
      if (invoiceData.order_id) {
        const { rows: items } = await query(
          `
          SELECT oi.*, p.name as product_name, p.sku
          FROM order_item oi
          JOIN product p ON p.id = oi.product_id
          WHERE oi.order_id = $1
        `,
          [invoiceData.order_id]
        )
        orderItems = items
      }

      // Calculate totals
      let subtotal = 0
      orderItems.forEach((item) => {
        subtotal += parseFloat(item.unit_price || 0) * parseFloat(item.quantity || 0)
      })

      const taxAmount = invoiceData.tax_included
        ? (subtotal * invoiceData.tax_rate) / (100 + invoiceData.tax_rate)
        : (subtotal * invoiceData.tax_rate) / 100

      const totalAmount = invoiceData.tax_included ? subtotal : subtotal + taxAmount

      // Create invoice
      const { rows: invoice } = await query(
        `
        INSERT INTO invoice (
          invoice_number, supplier_id, restaurant_id, order_id,
          invoice_date, due_date, issue_date,
          subtotal, tax_amount, total_amount, balance_due,
          status, currency, tax_rate, tax_included, payment_terms_days,
          notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        RETURNING *
      `,
        [
          invoiceNumber,
          supplierId,
          invoiceData.restaurant_id,
          invoiceData.order_id || null,
          invoiceDate,
          dueDate,
          invoiceDate,
          subtotal,
          taxAmount,
          totalAmount,
          totalAmount, // balance_due initially equals total
          'ISSUED',
          'USD',
          invoiceData.tax_rate,
          invoiceData.tax_included,
          invoiceData.payment_terms_days,
          invoiceData.notes,
          req.userData.id,
        ]
      )

      // Create line items
      for (const item of orderItems) {
        await query(
          `
          INSERT INTO invoice_line_item (
            invoice_id, product_id, description, sku,
            quantity, unit_price, line_total, tax_rate, tax_amount
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `,
          [
            invoice[0].id,
            item.product_id,
            item.product_name || 'Product',
            item.sku,
            item.quantity,
            item.unit_price,
            parseFloat(item.unit_price) * parseFloat(item.quantity),
            invoiceData.tax_rate,
            (invoiceData.tax_rate * parseFloat(item.unit_price) * parseFloat(item.quantity)) / 100,
          ]
        )
      }

      await query('COMMIT')

      logger.info('Invoice created', {
        invoiceId: invoice[0].id,
        invoiceNumber: invoice[0].invoice_number,
        actor: req.userData.id,
      })

      // Send notification to restaurant
      try {
        await notifyInvoiceIssued(invoice[0])
      } catch (notifError) {
        // Don't fail invoice creation if notification fails
        logger.error('Failed to send invoice notification', { error: notifError.message })
      }

      res.status(201).json({
        ok: true,
        data: { invoice: invoice[0] },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      await query('ROLLBACK')
      throw error
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'Invalid invoice data',
          details: error.errors,
        },
        requestId: req.requestId,
      })
    }

    logger.error('Create invoice error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to create invoice',
      },
      requestId: req.requestId,
    })
  }
})

// Update invoice status
router.patch('/:id', requireAuth, requireRole(['SUPPLIER', 'ADMIN']), async (req, res) => {
  try {
    const { id } = req.params
    const { status, notes } = req.body

    const validStatuses = ['ISSUED', 'PAID', 'VOID']
    if (!validStatuses.includes(status)) {
      throw new ValidationError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`)
    }

    // Only allow void if not already paid
    if (status === 'VOID') {
      const { rows: current } = await query('SELECT status FROM invoice WHERE id = $1', [id])

      if (current[0].status === 'PAID') {
        throw new ValidationError('Cannot void a paid invoice')
      }
    }

    const updateData = { status, notes }
    if (status === 'VOID') {
      updateData.voided_by = req.userData.id
      updateData.voided_at = new Date()
    }

    const { rows } = await query(
      `
      UPDATE invoice 
      SET 
        status = $1,
        notes = $2,
        voided_by = $3,
        voided_at = $4,
        updated_at = now()
      WHERE id = $5
      RETURNING *
    `,
      [status, notes, updateData.voided_by, updateData.voided_at, id]
    )

    res.json({
      ok: true,
      data: { invoice: rows[0] },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Update invoice error:', error)
    res.status(error.statusCode || 500).json({
      ok: false,
      data: null,
      error: {
        name: error.name || 'INTERNAL_ERROR',
        message: error.message || 'Failed to update invoice',
      },
      requestId: req.requestId,
    })
  }
})

export { router as invoicesRoutes }
