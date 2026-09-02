import express from 'express'
import {
  requireAuth,
  requireRole,
  resolveTenantContext,
  requirePermission,
  getRestaurantIdForRequest,
  getSupplierIdForRequest,
} from '../lib/rbac.js'
import { requireRestaurantId } from '../lib/tenant-resolve.js'
import { requireFeature } from '../lib/subscription.js'
import { query, withTransaction } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { NotFoundError, ValidationError } from '../middlewares/errorHandler.js'
import { z } from 'zod'
import {
  getRestaurantPayables,
  getRestaurantStatementOpeningBalance,
  getRestaurantStatementAdjustments,
  computeRestaurantStatementClosingBalance,
} from '../services/restaurant-payables.service.js'
import {
  applyCreditToInvoice,
  computeRemainingBalance,
  getInvoiceDetail,
  recordCashPayment,
  INVOICE_CSV_HEADER,
  invoiceToCsvRow,
} from '../services/invoice.service.js'

const router = express.Router()

const financeInvoicesGate = requireFeature(
  'finance_invoices',
  (req) => req.tenantContext?.tenantId,
  (req) => req.tenantContext?.tenantType
)

router.use(requireAuth, resolveTenantContext, financeInvoicesGate)

// Validation schemas
const markPaidSchema = z.object({
  paymentDate: z.string(),
  paymentMethod: z.enum(['CASH', 'CHECK', 'BANK_TRANSFER', 'CREDIT_CARD', 'ACH', 'OTHER']),
  paymentReference: z.string().optional(),
  notes: z.string().optional(),
})

const disputeInvoiceSchema = z.object({
  reason: z.string().min(10),
  evidence: z.string().optional(),
})

router.get(
  '/payables',
  requireRole(['RESTAURANT', 'ADMIN']),
  requirePermission('INVOICES_VIEW'),
  async (req, res, next) => {
    try {
      const restaurantId = await requireRestaurantId(req)
      const data = await getRestaurantPayables(restaurantId)
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

// Get all invoices for the restaurant
router.get(
  '/invoices',
  requireRole(['RESTAURANT', 'ADMIN']),
  requirePermission('INVOICES_VIEW'),
  async (req, res) => {
    try {
      const { status, supplier, limit = '100', offset = '0' } = req.query

      const restaurantId = await requireRestaurantId(req)

      let invoicesQuery = `
      SELECT 
        i.*,
        s.name as supplier_name,
        s.slug as supplier_slug,
        s.contact_email as supplier_email,
        s.phone as supplier_phone,
        o.id as order_id,
        o.status as order_status,
        o.placed_at as order_placed_at,
        COALESCE(SUM(p.payment_amount) FILTER (WHERE p.status = 'COMPLETED'), 0) as total_paid,
        -- Overdue calculation
        CASE 
          WHEN i.status NOT IN ('PAID', 'VOID') 
            AND i.due_date < CURRENT_DATE 
            AND i.total_amount > COALESCE(SUM(p.payment_amount) FILTER (WHERE p.status = 'COMPLETED'), 0)
          THEN i.total_amount - COALESCE(SUM(p.payment_amount) FILTER (WHERE p.status = 'COMPLETED'), 0)
          ELSE 0
        END as overdue_amount,
        -- Days overdue
        CASE 
          WHEN i.status NOT IN ('PAID', 'VOID') 
            AND i.due_date < CURRENT_DATE 
          THEN CURRENT_DATE - i.due_date
          ELSE 0
        END as days_overdue
      FROM invoice i
      JOIN supplier s ON s.id = i.supplier_id
      LEFT JOIN customer_order o ON o.id = i.order_id
      LEFT JOIN payment p ON p.invoice_id = i.id
      WHERE i.restaurant_id = $1
    `

      const queryParams = [restaurantId]

      if (status) {
        invoicesQuery += ` AND i.status = $${queryParams.length + 1}`
        queryParams.push(status)
      }

      if (supplier) {
        invoicesQuery += ` AND s.id = $${queryParams.length + 1}`
        queryParams.push(supplier)
      }

      invoicesQuery += `
      GROUP BY i.id, s.name, s.slug, s.contact_email, s.phone, o.id, o.status, o.placed_at
      ORDER BY i.due_date ASC, i.invoice_date DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `

      queryParams.push(limit, offset)

      const { rows } = await query(invoicesQuery, queryParams)
      const invoices = rows.map((row) => ({
        ...row,
        remaining_balance: computeRemainingBalance(row, row.total_paid),
      }))

      res.json({
        ok: true,
        data: { invoices },
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
  }
)

router.get(
  '/invoices/export.csv',
  requireRole(['RESTAURANT', 'ADMIN']),
  requirePermission('INVOICES_VIEW'),
  async (req, res, next) => {
    try {
      const { status, supplier, invoiceId } = req.query
      const restaurantId = await requireRestaurantId(req)

      if (invoiceId) {
        const detail = await getInvoiceDetail(String(invoiceId), {
          tenantId: restaurantId,
          tenantType: 'RESTAURANT',
        })
        const csv = INVOICE_CSV_HEADER + invoiceToCsvRow(detail.invoice)
        const date = new Date().toISOString().slice(0, 10)
        res.setHeader('Content-Type', 'text/csv; charset=utf-8')
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="invoice-${detail.invoice.invoice_number}-${date}.csv"`
        )
        return res.send(csv)
      }

      let sql = `
        SELECT
          i.*,
          s.name AS supplier_name,
          r.name AS restaurant_name,
          b.name AS branch_name,
          COALESCE(SUM(p.payment_amount) FILTER (WHERE p.status = 'COMPLETED'), 0) AS total_paid
        FROM invoice i
        JOIN supplier s ON s.id = i.supplier_id
        JOIN restaurant r ON r.id = i.restaurant_id
        LEFT JOIN branch b ON b.id = i.branch_id
        LEFT JOIN payment p ON p.invoice_id = i.id
        WHERE i.restaurant_id = $1
      `
      const params = [restaurantId]
      if (status) {
        params.push(status)
        sql += ` AND i.status = $${params.length}`
      }
      if (supplier) {
        params.push(supplier)
        sql += ` AND i.supplier_id = $${params.length}`
      }
      sql += ` GROUP BY i.id, s.name, r.name, b.name ORDER BY i.invoice_date ASC`

      const { rows } = await query(sql, params)
      const lines = rows.map((r) =>
        invoiceToCsvRow({
          ...r,
          remaining_balance: computeRemainingBalance(r, r.total_paid),
        })
      )
      const csv = INVOICE_CSV_HEADER + lines.join('\n')
      const date = new Date().toISOString().slice(0, 10)
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="invoices-${date}.csv"`)
      res.send(csv)
    } catch (err) {
      next(err)
    }
  }
)

// Get comprehensive invoice analytics for restaurant (place BEFORE dynamic :id routes)
router.get(
  '/invoices/analytics',
  requireRole(['RESTAURANT', 'ADMIN']),
  requirePermission('INVOICES_VIEW'),
  async (req, res) => {
    try {
      const { period = '30' } = req.query

      const restaurantId = await requireRestaurantId(req)

      const periodDays = parseInt(period) || 30

      const { rows: analytics } = await query(
        `
      SELECT 
        COUNT(*) FILTER (WHERE i.status = 'ISSUED') as issued_count,
        COUNT(*) FILTER (WHERE i.status = 'PARTIALLY_PAID') as partial_count,
        COUNT(*) FILTER (WHERE i.status = 'PAID') as paid_count,
        COUNT(*) FILTER (WHERE i.status = 'OVERDUE') as overdue_count,
        COUNT(*) FILTER (WHERE i.due_date < CURRENT_DATE AND i.status NOT IN ('PAID', 'VOID')) as overdue_count_alt,
        SUM(i.total_amount) FILTER (WHERE i.status = 'ISSUED' OR i.status = 'PARTIALLY_PAID') as total_outstanding,
        SUM(i.total_amount) FILTER (WHERE i.status = 'PAID') as total_paid_amount,
        SUM(i.total_amount) FILTER (WHERE i.due_date < CURRENT_DATE AND i.status NOT IN ('PAID', 'VOID')) as total_overdue,
        AVG(
          CASE 
            WHEN i.status = 'PAID' AND i.payment_date IS NOT NULL 
            THEN i.payment_date - i.due_date 
          END
        ) as avg_days_to_pay
      FROM invoice i
      WHERE i.restaurant_id = $1
        AND i.invoice_date >= CURRENT_DATE - INTERVAL '1 day' * $2
    `,
        [restaurantId, periodDays]
      )

      // Time-series points for Spend Trend chart (daily totals by invoice_date)
      const { rows: pointsRows } = await query(
        `
      SELECT 
        invoice_date::text AS date,
        COALESCE(SUM(total_amount), 0)::numeric AS total
      FROM invoice i
      WHERE i.restaurant_id = $1
        AND i.invoice_date >= CURRENT_DATE - INTERVAL '1 day' * $2
      GROUP BY invoice_date
      ORDER BY invoice_date
    `,
        [restaurantId, periodDays]
      )
      const points = (pointsRows || []).map((r) => ({
        date: r.date,
        total: parseFloat(r.total) || 0,
      }))

      return res.json({
        ok: true,
        data: {
          analytics: analytics[0] || {},
          points,
        },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.warn('Invoice analytics unavailable, returning empty analytics:', error.message)
      return res.json({
        ok: true,
        data: { analytics: {}, points: [] },
        error: null,
        requestId: req.requestId,
      })
    }
  }
)

// Get invoices by order ID
router.get(
  '/orders/:orderId/invoices',
  requireAuth,
  requireRole(['RESTAURANT', 'SUPPLIER', 'ADMIN']),
  async (req, res) => {
    try {
      const { orderId } = req.params

      let restaurantId = null
      let supplierId = null

      if (req.userData.role === 'RESTAURANT') {
        restaurantId = await getRestaurantIdForRequest(req)
        if (!restaurantId) {
          throw new ValidationError('Restaurant not found')
        }
      } else if (req.userData.role === 'SUPPLIER') {
        supplierId = await getSupplierIdForRequest(req)
        if (!supplierId) {
          throw new ValidationError('Supplier not found')
        }
      }

      let invoicesQuery = `
      SELECT 
        i.*,
        s.name as supplier_name,
        COALESCE(SUM(p.payment_amount) FILTER (WHERE p.status = 'COMPLETED'), 0) as total_paid
      FROM invoice i
      JOIN supplier s ON s.id = i.supplier_id
      LEFT JOIN payment p ON p.invoice_id = i.id
      WHERE i.order_id = $1
    `

      const params = [orderId]

      if (restaurantId) {
        invoicesQuery += ` AND i.restaurant_id = $2`
        params.push(restaurantId)
      } else if (supplierId) {
        invoicesQuery += ` AND i.supplier_id = $2`
        params.push(supplierId)
      }

      invoicesQuery += `
      GROUP BY i.id, s.name
      ORDER BY i.invoice_date DESC
    `

      const { rows } = await query(invoicesQuery, params)

      res.json({
        ok: true,
        data: { invoices: rows },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Get invoices by order error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          name: 'INTERNAL_ERROR',
          message: 'Failed to get invoices',
        },
        requestId: req.requestId,
      })
    }
  }
)

// Get invoice by ID with line items
router.get(
  '/invoices/:id',
  requireRole(['RESTAURANT', 'ADMIN']),
  requirePermission('INVOICES_VIEW'),
  async (req, res) => {
    try {
      const { id } = req.params

      const restaurantId = await requireRestaurantId(req)
      const detail = await getInvoiceDetail(id, {
        tenantId: restaurantId,
        tenantType: 'RESTAURANT',
        includePayments: true,
      })

      res.json({
        ok: true,
        data: detail,
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      if (error instanceof NotFoundError) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: error.message },
          requestId: req.requestId,
        })
      }

      logger.error({
        message: 'Get invoice error',
        error: error.message,
        stack: error.stack,
      })
      res.status(error.statusCode || 500).json({
        ok: false,
        data: null,
        error: {
          name: error.name || 'INTERNAL_ERROR',
          message: error.message || 'Failed to get invoice',
          details: error.message,
        },
        requestId: req.requestId,
      })
    }
  }
)

// Enhanced payment schema with partial payment and credit/debit support
const paymentSchemaEnhanced = z.object({
  paymentAmount: z.number().positive().optional(), // Optional - defaults to full balance if not provided
  paymentDate: z.string(),
  paymentMethod: z.enum([
    'CASH',
    'CHECK',
    'BANK_TRANSFER',
    'CREDIT_CARD',
    'ACH',
    'STRIPE',
    'OTHER',
  ]),
  paymentReference: z.string().optional(),
  bankName: z.string().optional(),
  provider: z.string().optional(),
  providerTransactionId: z.string().optional(),
  notes: z.string().optional(),
  // Credit/Debit support
  creditAmount: z.number().nonnegative().optional().default(0), // Apply credit note to payment
  creditNoteId: z.string().uuid().optional(), // Reference to credit note if applying
  // HQ Payment support
  paidByHQ: z.boolean().optional().default(false),
  hqNotes: z.string().optional(),
})

// Mark invoice as paid (with partial payment, credits, and HQ support)
router.post(
  '/invoices/:id/pay',
  requireRole(['RESTAURANT', 'ADMIN']),
  requirePermission('PAYMENTS_MANAGE'),
  async (req, res) => {
    try {
      const { id } = req.params
      const paymentData = paymentSchemaEnhanced.parse(req.body)

      const restaurantId = await requireRestaurantId(req)

      // Get invoice and check ownership
      const { rows: invoices } = await query(
        `
      SELECT * FROM invoice 
      WHERE id = $1 AND restaurant_id = $2
    `,
        [id, restaurantId]
      )

      if (invoices.length === 0) {
        throw new NotFoundError('Invoice not found')
      }

      const invoice = invoices[0]

      const { rows: payments } = await query(
        `
      SELECT COALESCE(SUM(payment_amount), 0) as total_paid
      FROM payment
      WHERE invoice_id = $1 AND status = 'COMPLETED'
    `,
        [id]
      )

      const totalPaid = parseFloat(payments[0].total_paid || 0)
      const remainingBalance = computeRemainingBalance(invoice, totalPaid)

      let creditAmount = parseFloat(paymentData.creditAmount || 0)
      const creditNoteId = paymentData.creditNoteId || null

      let paymentAmount = paymentData.paymentAmount
      if (!paymentAmount || paymentAmount === 0) {
        paymentAmount = Math.max(0, remainingBalance - creditAmount)
      }

      const totalPaymentWithCredit = paymentAmount + creditAmount

      if (totalPaymentWithCredit > remainingBalance) {
        throw new ValidationError(
          `Total payment amount (${totalPaymentWithCredit}) exceeds remaining balance (${remainingBalance})`
        )
      }

      if (paymentAmount <= 0 && creditAmount <= 0) {
        throw new ValidationError('Payment amount must be greater than 0')
      }

      const hqNote = paymentData.paidByHQ
        ? `Payment made by HQ${paymentData.hqNotes ? `: ${paymentData.hqNotes}` : ''}`
        : paymentData.notes || null

      const result = await withTransaction(async (client) => {
        let payment = null
        if (paymentAmount > 0) {
          const cashResult = await recordCashPayment(client, {
            invoiceId: id,
            paymentAmount,
            paymentDate: paymentData.paymentDate,
            paymentMethod: paymentData.paymentMethod,
            paymentReference: paymentData.paymentReference,
            notes: hqNote,
            bankName: paymentData.bankName,
            provider: paymentData.provider,
            providerTransactionId: paymentData.providerTransactionId,
            recordedBy: req.userData.id,
            currency: invoice.currency,
          })
          payment = cashResult.payment
        }

        if (creditAmount > 0 && creditNoteId) {
          await applyCreditToInvoice(client, {
            creditNoteId,
            invoiceId: id,
            creditAmount,
            paymentDate: paymentData.paymentDate,
            recordedBy: req.userData.id,
          })
        }

        const { rows: updatedInvoice } = await client.query(`SELECT * FROM invoice WHERE id = $1`, [
          id,
        ])
        return { payment, updatedInvoice: updatedInvoice[0] }
      })

      logger.info('Enhanced payment recorded', {
        invoiceId: id,
        paymentId: result.payment?.id || 'credit-only',
        cashAmount: paymentAmount,
        creditAmount: creditAmount,
        totalPayment: totalPaymentWithCredit,
        paidByHQ: paymentData.paidByHQ,
        actor: req.userData.id,
      })

      res.json({
        ok: true,
        data: {
          payment: result.payment,
          creditApplied: creditAmount > 0 ? { amount: creditAmount, creditNoteId } : null,
          invoice: result.updatedInvoice,
        },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      if (error instanceof NotFoundError) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: error.message },
          requestId: req.requestId,
        })
      }

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'VALIDATION_ERROR',
            message: 'Invalid payment data',
            details: error.errors,
          },
          requestId: req.requestId,
        })
      }

      logger.error({
        message: 'Enhanced payment error',
        error: error.message,
        stack: error.stack,
      })
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          name: 'INTERNAL_ERROR',
          message: 'Failed to record payment',
          details: error.message,
        },
        requestId: req.requestId,
      })
    }
  }
)

// Get available credit notes for a supplier (for invoice payment)
router.get(
  '/invoices/:id/credits',
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  async (req, res) => {
    try {
      const { id } = req.params

      const restaurantId = await requireRestaurantId(req)

      // Get invoice to get supplier_id
      const { rows: invoices } = await query(
        `
      SELECT supplier_id FROM invoice 
      WHERE id = $1 AND restaurant_id = $2
    `,
        [id, restaurantId]
      )

      if (invoices.length === 0) {
        throw new NotFoundError('Invoice not found')
      }

      const supplierId = invoices[0].supplier_id

      // Get available credit notes
      const { rows: creditNotes } = await query(
        `
      SELECT 
        id, credit_note_number, issue_date, credit_amount,
        applied_amount, remaining_amount, reason, description,
        expires_at
      FROM credit_note
      WHERE restaurant_id = $1 AND supplier_id = $2
        AND status = 'ISSUED' AND remaining_amount > 0
        AND (expires_at IS NULL OR expires_at >= CURRENT_DATE)
      ORDER BY issue_date DESC
    `,
        [restaurantId, supplierId]
      )

      res.json({
        ok: true,
        data: { creditNotes },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Get credit notes error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          name: 'INTERNAL_ERROR',
          message: 'Failed to get credit notes',
        },
        requestId: req.requestId,
      })
    }
  }
)

// Get account statement for a supplier
router.get(
  '/suppliers/:supplierId/statement',
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  async (req, res) => {
    try {
      const { supplierId } = req.params
      const { startDate, endDate } = req.query

      const restaurantId = await requireRestaurantId(req)

      // Get statement data
      const { rows: invoices } = await query(
        `
      SELECT 
        i.*,
        s.name as supplier_name,
        COALESCE(SUM(p.payment_amount) FILTER (WHERE p.status = 'COMPLETED'), 0) as total_paid
      FROM invoice i
      JOIN supplier s ON s.id = i.supplier_id
      LEFT JOIN payment p ON p.invoice_id = i.id
      WHERE i.restaurant_id = $1 AND i.supplier_id = $2
        ${startDate ? `AND i.invoice_date >= $3` : ''}
        ${endDate ? `AND i.invoice_date <= $${startDate ? 4 : 3}` : ''}
      GROUP BY i.id, s.name
      ORDER BY i.invoice_date ASC
    `,
        [restaurantId, supplierId, startDate, endDate].filter(Boolean)
      )

      const [openingBalance, totalAdjustments] = await Promise.all([
        startDate
          ? getRestaurantStatementOpeningBalance(restaurantId, supplierId, startDate)
          : Promise.resolve(0),
        getRestaurantStatementAdjustments(restaurantId, supplierId, startDate, endDate),
      ])

      const summary = {
        openingBalance,
        totalCharges: 0,
        totalPayments: 0,
        totalAdjustments,
        closingBalance: 0,
        invoiceCount: invoices.length,
      }

      invoices.forEach((inv) => {
        summary.totalCharges += parseFloat(inv.total_amount || 0)
        summary.totalPayments += parseFloat(inv.total_paid || 0)
      })

      summary.closingBalance = computeRestaurantStatementClosingBalance(summary)

      res.json({
        ok: true,
        data: {
          invoices,
          summary,
        },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error({
        message: 'Get statement error',
        error: error.message,
        stack: error.stack,
      })
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          name: 'INTERNAL_ERROR',
          message: 'Failed to get statement',
          details: error.message,
        },
        requestId: req.requestId,
      })
    }
  }
)

// Get monthly expense breakdown
router.get('/expenses', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const rawPeriod = Number.parseInt(String(req.query.period ?? '30'), 10)
    const periodDays = Number.isFinite(rawPeriod) ? Math.min(365, Math.max(1, rawPeriod)) : 30

    const restaurantId = await requireRestaurantId(req)

    // Get expense breakdown by supplier
    const { rows: bySupplier } = await query(
      `
      SELECT 
        s.id as supplier_id,
        s.name as supplier_name,
        COUNT(i.id) as invoice_count,
        SUM(i.total_amount) as total_spent,
        SUM(COALESCE(p.payment_amount, 0)) as total_paid,
        SUM(i.balance_due) as outstanding
      FROM invoice i
      JOIN supplier s ON s.id = i.supplier_id
      LEFT JOIN payment p ON p.invoice_id = i.id AND p.status = 'COMPLETED'
      WHERE i.restaurant_id = $1
        AND i.invoice_date >= NOW() - INTERVAL '1 day' * $2
      GROUP BY s.id, s.name
      ORDER BY total_spent DESC
    `,
      [restaurantId, periodDays]
    )

    // Get expense breakdown by category (from products)
    const { rows: byCategory } = await query(
      `
      SELECT 
        COALESCE(p.category, 'Uncategorized') as category,
        SUM(ili.quantity * ili.unit_price) as total_spent
      FROM invoice i
      JOIN invoice_line_item ili ON ili.invoice_id = i.id
      LEFT JOIN product p ON p.id = ili.product_id
      WHERE i.restaurant_id = $1
        AND i.invoice_date >= NOW() - INTERVAL '1 day' * $2
      GROUP BY p.category
      ORDER BY total_spent DESC
    `,
      [restaurantId, periodDays]
    )

    // Get monthly trend
    const { rows: monthlyTrend } = await query(
      `
      SELECT 
        DATE_TRUNC('month', i.invoice_date) as month,
        COUNT(i.id) as invoice_count,
        SUM(i.total_amount) as total_spent
      FROM invoice i
      WHERE i.restaurant_id = $1
        AND i.invoice_date >= NOW() - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', i.invoice_date)
      ORDER BY month ASC
    `,
      [restaurantId]
    )

    res.json({
      ok: true,
      data: {
        bySupplier,
        byCategory,
        monthlyTrend,
        period: periodDays,
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error({
      message: 'Get expenses error',
      error: error.message,
      stack: error.stack,
    })
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get expenses',
        details: error.message,
      },
      requestId: req.requestId,
    })
  }
})

// Get overdue payments and alerts
router.get(
  '/overdue',
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN', 'SUPPLIER']),
  async (req, res) => {
    try {
      // If the caller is not a restaurant/admin, return empty (avoid UI 403s)
      if (req.userData.role && !['RESTAURANT', 'ADMIN'].includes(req.userData.role)) {
        return res.json({
          ok: true,
          data: { invoices: [], summary: { count: 0, totalOverdue: 0 } },
          error: null,
          requestId: req.requestId,
        })
      }

      const restaurantId = await requireRestaurantId(req)

      const { rows: overdue } = await query(
        `
      SELECT 
        i.*,
        s.name as supplier_name,
        s.contact_email as supplier_email,
        o.id as order_id,
        CURRENT_DATE - i.due_date as days_overdue,
        i.total_amount - i.paid_amount as amount_due
      FROM invoice i
      JOIN supplier s ON s.id = i.supplier_id
      LEFT JOIN customer_order o ON o.id = i.order_id
      WHERE i.restaurant_id = $1
        AND i.status NOT IN ('PAID', 'VOID')
        AND i.due_date < CURRENT_DATE
        AND i.total_amount > i.paid_amount
      ORDER BY days_overdue DESC, amount_due DESC
    `,
        [restaurantId]
      )

      // Calculate total overdue amount
      const totalOverdue = overdue.reduce((sum, inv) => sum + parseFloat(inv.amount_due || 0), 0)

      res.json({
        ok: true,
        data: {
          invoices: overdue,
          summary: {
            count: overdue.length,
            totalOverdue,
          },
        },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error({
        message: 'Get overdue error',
        error: error.message,
        stack: error.stack,
      })
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          name: 'INTERNAL_ERROR',
          message: 'Failed to get overdue invoices',
          details: error.message,
        },
        requestId: req.requestId,
      })
    }
  }
)

export { router as restaurantFinanceRoutes }
