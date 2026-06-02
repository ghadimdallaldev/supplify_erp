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
import { requireFullRestaurantWorkspaceUnlessReadOnly } from '../middlewares/restaurantWorkspaceAccess.js'

const router = express.Router()

router.use(requireFullRestaurantWorkspaceUnlessReadOnly())

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

      // Get invoice
      const { rows: invoices } = await query(
        `
      SELECT 
        i.*,
        s.name as supplier_name,
        s.slug as supplier_slug,
        s.address_json as supplier_address,
        s.phone as supplier_phone,
        s.contact_email as supplier_email,
        o.id as order_id,
        o.status as order_status,
        o.placed_at as order_placed_at,
        COALESCE(SUM(p.payment_amount) FILTER (WHERE p.status = 'COMPLETED'), 0) as total_paid
      FROM invoice i
      JOIN supplier s ON s.id = i.supplier_id
      LEFT JOIN customer_order o ON o.id = i.order_id
      LEFT JOIN payment p ON p.invoice_id = i.id
      WHERE i.id = $1 AND i.restaurant_id = $2
      GROUP BY i.id, s.name, s.slug, s.address_json, s.phone, s.contact_email, o.id, o.status, o.placed_at
    `,
        [id, restaurantId]
      )

      if (invoices.length === 0) {
        throw new NotFoundError('Invoice not found')
      }

      // Get line items
      const { rows: lineItems } = await query(
        `
      SELECT * FROM invoice_line_item 
      WHERE invoice_id = $1 
      ORDER BY created_at
    `,
        [id]
      )

      // Get payment history
      const { rows: payments } = await query(
        `
      SELECT 
        p.*,
        pm.name as recorded_by_name
      FROM payment p
      LEFT JOIN app_user pm ON pm.id::text = p.recorded_by
      WHERE p.invoice_id = $1
      ORDER BY p.payment_date DESC, p.created_at DESC
    `,
        [id]
      )

      res.json({
        ok: true,
        data: {
          invoice: invoices[0],
          lineItems,
          payments,
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

      logger.error({
        message: 'Get invoice error',
        error: error.message,
        stack: error.stack,
      })
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          name: 'INTERNAL_ERROR',
          message: 'Failed to get invoice',
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

      // Calculate remaining balance and available credits
      const { rows: payments } = await query(
        `
      SELECT COALESCE(SUM(payment_amount), 0) as total_paid
      FROM payment
      WHERE invoice_id = $1 AND status = 'COMPLETED'
    `,
        [id]
      )

      const totalPaid = parseFloat(payments[0].total_paid || 0)
      const remainingBalance = parseFloat(invoice.total_amount) - totalPaid

      // Get available credit notes for this restaurant-supplier relationship
      let creditAmount = parseFloat(paymentData.creditAmount || 0)
      let creditNoteId = paymentData.creditNoteId || null

      if (creditAmount > 0 && creditNoteId) {
        // Validate credit note exists and belongs to restaurant
        const { rows: creditNotes } = await query(
          `
        SELECT * FROM credit_note 
        WHERE id = $1 AND restaurant_id = $2 AND supplier_id = $3
          AND status = 'ISSUED' AND remaining_amount > 0
      `,
          [creditNoteId, restaurantId, invoice.supplier_id]
        )

        if (creditNotes.length === 0) {
          throw new ValidationError('Invalid or unavailable credit note')
        }

        const creditNote = creditNotes[0]
        const availableCredit = parseFloat(creditNote.remaining_amount || 0)

        if (creditAmount > availableCredit) {
          throw new ValidationError(
            `Credit amount (${creditAmount}) exceeds available credit (${availableCredit})`
          )
        }
      }

      // Determine payment amount
      let paymentAmount = paymentData.paymentAmount
      if (!paymentAmount || paymentAmount === 0) {
        // Default to full remaining balance
        paymentAmount = remainingBalance
      }

      // Total payment (cash + credit)
      const totalPaymentWithCredit = paymentAmount + creditAmount

      if (totalPaymentWithCredit > remainingBalance) {
        throw new ValidationError(
          `Total payment amount (${totalPaymentWithCredit}) exceeds remaining balance (${remainingBalance})`
        )
      }

      if (paymentAmount <= 0 && creditAmount <= 0) {
        throw new ValidationError('Payment amount must be greater than 0')
      }

      // Generate payment number
      const paymentNumber = `PAY-${new Date().toISOString().split('T')[0]}-${Date.now().toString().slice(-6)}`

      // Use transaction for atomicity
      const result = await withTransaction(async (client) => {
        // Create payment record (only if cash payment > 0)
        let payment = null
        if (paymentAmount > 0) {
          const { rows: paymentRows } = await client.query(
            `
          INSERT INTO payment (
            invoice_id, payment_number, payment_date, payment_amount,
            payment_method, payment_reference, currency, status,
            recorded_by, notes, bank_name, provider, provider_transaction_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING *
        `,
            [
              id,
              paymentNumber,
              paymentData.paymentDate,
              paymentAmount,
              paymentData.paymentMethod,
              paymentData.paymentReference || null,
              invoice.currency,
              'COMPLETED',
              req.userData.id,
              paymentData.notes ||
                (paymentData.paidByHQ
                  ? `Payment made by HQ${paymentData.hqNotes ? `: ${paymentData.hqNotes}` : ''}`
                  : null),
              paymentData.bankName || null,
              paymentData.provider || null,
              paymentData.providerTransactionId || null,
            ]
          )

          payment = paymentRows[0]
        }

        // Apply credit note if provided
        if (creditAmount > 0 && creditNoteId) {
          // Update credit note to mark as applied
          await client.query(
            `
          UPDATE credit_note
          SET applied_amount = applied_amount + $1,
              remaining_amount = remaining_amount - $1,
              status = CASE WHEN remaining_amount - $1 <= 0 THEN 'APPLIED' ELSE 'ISSUED' END,
              updated_at = now()
          WHERE id = $2
        `,
            [creditAmount, creditNoteId]
          )

          // Create a payment record for the credit (with special method)
          const creditPaymentNumber = `CREDIT-${new Date().toISOString().split('T')[0]}-${Date.now().toString().slice(-6)}`
          await client.query(
            `
          INSERT INTO payment (
            invoice_id, payment_number, payment_date, payment_amount,
            payment_method, currency, status,
            recorded_by, notes, payment_reference
          ) VALUES ($1, $2, $3, $4, 'OTHER', $5, 'COMPLETED', $6, $7, $8)
        `,
            [
              id,
              creditPaymentNumber,
              paymentData.paymentDate,
              creditAmount,
              invoice.currency,
              req.userData.id,
              `Credit note applied: ${creditNoteId}`,
              creditNoteId,
            ]
          )
        }

        // Get updated invoice
        const { rows: updatedInvoice } = await client.query(
          `
        SELECT * FROM invoice WHERE id = $1
      `,
          [id]
        )

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

      // Calculate summary
      const summary = {
        openingBalance: 0, // TODO: Calculate from previous period
        totalCharges: 0,
        totalPayments: 0,
        totalAdjustments: 0,
        closingBalance: 0,
        invoiceCount: invoices.length,
      }

      invoices.forEach((inv) => {
        summary.totalCharges += parseFloat(inv.total_amount || 0)
        summary.totalPayments += parseFloat(inv.total_paid || 0)
      })

      summary.closingBalance =
        summary.openingBalance +
        summary.totalCharges -
        summary.totalPayments +
        summary.totalAdjustments

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
    const { period = '30' } = req.query

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
        AND i.invoice_date >= NOW() - INTERVAL '${period} days'
      GROUP BY s.id, s.name
      ORDER BY total_spent DESC
    `,
      [restaurantId]
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
        AND i.invoice_date >= NOW() - INTERVAL '${period} days'
      GROUP BY p.category
      ORDER BY total_spent DESC
    `,
      [restaurantId]
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
        period: parseInt(period),
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
