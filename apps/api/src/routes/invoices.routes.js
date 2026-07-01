import express from 'express'
import {
  requireAuth,
  requireRole,
  resolveTenantContext,
  requirePermission,
  getSupplierIdForRequest,
} from '../lib/rbac.js'
import { invoicesMutationGuard } from '../lib/route-permissions.js'
import { query, withTransaction } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { NotFoundError, ValidationError } from '../middlewares/errorHandler.js'
import { z } from 'zod'
import { notifyInvoiceIssued } from '../services/notification.service.js'
import { requireFeature } from '../lib/subscription.js'
import { requireRestaurantId, requireSupplierId } from '../lib/tenant-resolve.js'
import { assertInvoiceTenantAccess } from '../lib/invoice-access.js'
import {
  buildInvoicePdfBuffer,
  computeRemainingBalance,
  createInvoiceManual,
  getInvoiceDetail,
  updateInvoiceStatus,
} from '../services/invoice.service.js'

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

async function resolveInvoiceDetailContext(req) {
  const role = req.userData?.role
  if (role === 'ADMIN') {
    return { adminBypass: true }
  }
  if (role === 'SUPPLIER') {
    return { tenantId: await requireSupplierId(req), tenantType: 'SUPPLIER' }
  }
  if (role === 'RESTAURANT') {
    return { tenantId: await requireRestaurantId(req), tenantType: 'RESTAURANT' }
  }
  throw new NotFoundError('Invoice not found')
}

function enrichInvoiceRows(rows) {
  return rows.map((row) => ({
    ...row,
    remaining_balance: computeRemainingBalance(row, row.total_paid),
  }))
}

// Validation schemas
const invoiceListSchema = z.object({
  limit: z.coerce.number().min(1).max(200).default(50),
  offset: z.coerce.number().min(0).default(0),
})

const invoiceCreateSchema = z.object({
  restaurant_id: z.string().uuid(),
  order_id: z.string().uuid().optional(),
  due_date: z.string(),
  tax_rate: z.number().default(0),
  tax_included: z.boolean().default(false),
  payment_terms_days: z.number().int().default(30),
  notes: z.string().optional(),
})

router.get('/', requireAuth, requireRole(['SUPPLIER', 'ADMIN', 'RESTAURANT']), async (req, res) => {
  try {
    const params = invoiceListSchema.parse(req.query)

    if (req.userData.role && !['SUPPLIER', 'ADMIN'].includes(req.userData.role)) {
      return res.json({
        ok: true,
        data: {
          invoices: [],
          pagination: { total: 0, limit: params.limit, offset: params.offset },
        },
        error: null,
        requestId: req.requestId,
      })
    }

    const invoiceSelect = `
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
    `

    if (req.userData.role === 'ADMIN') {
      const countSql = `SELECT COUNT(*)::int AS total FROM invoice i`
      const listSql = `
        ${invoiceSelect}
        GROUP BY i.id, r.name, o.id, o.status
        ORDER BY i.issue_date DESC, i.invoice_number DESC
        LIMIT $1 OFFSET $2
      `
      const [{ rows }, { rows: countRows }] = await Promise.all([
        query(listSql, [params.limit, params.offset]),
        query(countSql),
      ])
      return res.json({
        ok: true,
        data: {
          invoices: enrichInvoiceRows(rows),
          pagination: {
            total: parseInt(countRows[0].total, 10),
            limit: params.limit,
            offset: params.offset,
          },
        },
        error: null,
        requestId: req.requestId,
      })
    }

    const supplierId = await getSupplierIdForRequest(req)
    if (!supplierId) {
      return res.json({
        ok: true,
        data: {
          invoices: [],
          pagination: { total: 0, limit: params.limit, offset: params.offset },
        },
        error: null,
        requestId: req.requestId,
      })
    }

    const countSql = `SELECT COUNT(*)::int AS total FROM invoice i WHERE i.supplier_id = $1`
    const listSql = `
      ${invoiceSelect}
      WHERE i.supplier_id = $1
      GROUP BY i.id, r.name, o.id, o.status
      ORDER BY i.issue_date DESC, i.invoice_number DESC
      LIMIT $2 OFFSET $3
    `

    const [{ rows }, { rows: countRows }] = await Promise.all([
      query(listSql, [supplierId, params.limit, params.offset]),
      query(countSql, [supplierId]),
    ])

    res.json({
      ok: true,
      data: {
        invoices: enrichInvoiceRows(rows),
        pagination: {
          total: parseInt(countRows[0].total, 10),
          limit: params.limit,
          offset: params.offset,
        },
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error({ message: 'Get invoices error', error: error.message, stack: error.stack })
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to get invoices', details: error.message },
      requestId: req.requestId,
    })
  }
})

router.get('/:id/pdf', requireAuth, async (req, res) => {
  try {
    const { id } = req.params
    const ctx = await resolveInvoiceDetailContext(req)
    const detail = await getInvoiceDetail(id, { ...ctx, includePayments: true })
    await assertInvoiceTenantAccess(req, detail.invoice)

    const pdfBuffer = await buildInvoicePdfBuffer(detail)
    const filename = `invoice-${(detail.invoice.invoice_number || id).replace(/[^a-zA-Z0-9-_]/g, '-')}.pdf`

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

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params
    const ctx = await resolveInvoiceDetailContext(req)
    const detail = await getInvoiceDetail(id, { ...ctx, includePayments: true })
    if (!ctx.adminBypass) {
      await assertInvoiceTenantAccess(req, detail.invoice)
    }

    res.json({
      ok: true,
      data: detail,
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

router.post('/', requireAuth, requireRole(['SUPPLIER', 'ADMIN']), async (req, res) => {
  try {
    const invoiceData = invoiceCreateSchema.parse(req.body)

    const supplierId =
      req.userData.role === 'ADMIN' ? req.body.supplier_id : await getSupplierIdForRequest(req)

    if (!supplierId) {
      throw new ValidationError('Supplier record not found for user')
    }

    let orderItems = []
    if (invoiceData.order_id) {
      const { rows: items } = await query(
        `
        SELECT oi.*, p.name as product_name, p.sku
        FROM order_item oi
        JOIN product p ON p.id = oi.product_id
        WHERE oi.order_id = $1 AND oi.supplier_id = $2
        `,
        [invoiceData.order_id, supplierId]
      )
      orderItems = items
    }

    const invoice = await withTransaction((client) =>
      createInvoiceManual(client, {
        invoiceData,
        supplierId,
        orderItems,
        userId: req.userData.id,
      })
    )

    logger.info('Invoice created', {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      actor: req.userData.id,
    })

    notifyInvoiceIssued(invoice).catch((notifError) => {
      logger.error('Failed to send invoice notification', { error: notifError.message })
    })

    res.status(201).json({
      ok: true,
      data: { invoice },
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
          message: 'Invalid invoice data',
          details: error.errors,
        },
        requestId: req.requestId,
      })
    }

    logger.error('Create invoice error:', error)
    res.status(error.statusCode || 500).json({
      ok: false,
      data: null,
      error: {
        name: error.name || 'INTERNAL_ERROR',
        message: error.message || 'Failed to create invoice',
      },
      requestId: req.requestId,
    })
  }
})

router.patch('/:id', requireAuth, requireRole(['SUPPLIER', 'ADMIN']), async (req, res) => {
  try {
    const { id } = req.params
    const { status, notes } = req.body

    const validStatuses = ['ISSUED', 'VOID']
    if (!validStatuses.includes(status)) {
      throw new ValidationError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`)
    }

    const { rows: existing } = await query(`SELECT * FROM invoice WHERE id = $1`, [id])
    if (existing.length === 0) {
      throw new NotFoundError('Invoice not found')
    }
    await assertInvoiceTenantAccess(req, existing[0])

    const invoice = await withTransaction((client) =>
      updateInvoiceStatus(client, id, {
        status,
        notes,
        userId: req.userData.id,
      })
    )

    res.json({
      ok: true,
      data: { invoice },
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
