import express from 'express'
import {
  requireAuth,
  requireRole,
  resolveTenantContext,
  requirePermission,
  getSupplierIdForRequest,
} from '../lib/rbac.js'
import { query, withTransaction } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { ValidationError } from '../middlewares/errorHandler.js'
import { z } from 'zod'
import { notifyPaymentReceived } from '../services/notification.service.js'
import { invoicesMutationGuard } from '../lib/route-permissions.js'
import { recordCashPayment, computeRemainingBalance } from '../services/invoice.service.js'

const router = express.Router()

const paymentSchema = z.object({
  invoice_id: z.string().uuid(),
  payment_amount: z.number().positive(),
  payment_date: z.string(),
  payment_method: z.enum([
    'CASH',
    'CHECK',
    'BANK_TRANSFER',
    'STRIPE',
    'CREDIT_CARD',
    'ACH',
    'OTHER',
  ]),
  payment_reference: z.string().optional(),
  provider: z.string().optional(),
  provider_transaction_id: z.string().optional(),
  bank_name: z.string().optional(),
  notes: z.string().optional(),
})

router.use(
  requireAuth,
  resolveTenantContext,
  requirePermission('INVOICES_VIEW'),
  invoicesMutationGuard
)

// Record a payment (supplier records receivable payment from restaurant)
router.post('/', requireRole(['SUPPLIER', 'ADMIN']), async (req, res) => {
  try {
    const paymentData = paymentSchema.parse(req.body)

    const { rows: invoices } = await query(
      `
      SELECT i.*
      FROM invoice i
      WHERE i.id = $1
    `,
      [paymentData.invoice_id]
    )

    if (invoices.length === 0) {
      throw new ValidationError('Invoice not found')
    }

    const invoice = invoices[0]

    if (req.userData.role === 'SUPPLIER') {
      const supplierId = await getSupplierIdForRequest(req)
      if (!supplierId || invoice.supplier_id !== supplierId) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: {
            name: 'FORBIDDEN',
            message: 'Invoice does not belong to your supplier account',
          },
          requestId: req.requestId,
        })
      }
    }

    const balanceDue = computeRemainingBalance(invoice)
    if (paymentData.payment_amount > balanceDue) {
      throw new ValidationError(
        `Payment amount (${paymentData.payment_amount}) exceeds balance due (${balanceDue})`
      )
    }

    const result = await withTransaction((client) =>
      recordCashPayment(client, {
        invoiceId: paymentData.invoice_id,
        paymentAmount: paymentData.payment_amount,
        paymentDate: paymentData.payment_date,
        paymentMethod: paymentData.payment_method,
        paymentReference: paymentData.payment_reference,
        notes: paymentData.notes,
        bankName: paymentData.bank_name,
        provider: paymentData.provider,
        providerTransactionId: paymentData.provider_transaction_id,
        recordedBy: req.userData.id,
      })
    )

    const payment = result.payment

    logger.info('Payment recorded', {
      paymentId: payment.id,
      invoiceId: paymentData.invoice_id,
      amount: paymentData.payment_amount,
      actor: req.userData.id,
    })

    try {
      await notifyPaymentReceived({
        id: payment.id,
        payment_amount: paymentData.payment_amount,
        invoice_id: paymentData.invoice_id,
        invoice: result.invoice,
      })
    } catch (notifError) {
      logger.error('Failed to send payment notification', { error: notifError.message })
    }

    res.status(201).json({
      ok: true,
      data: { payment },
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
          message: 'Invalid payment data',
          details: error.errors,
        },
        requestId: req.requestId,
      })
    }

    logger.error('Record payment error:', error)
    res.status(error.statusCode || 500).json({
      ok: false,
      data: null,
      error: {
        name: error.name || 'INTERNAL_ERROR',
        message: error.message || 'Failed to record payment',
      },
      requestId: req.requestId,
    })
  }
})

// Get payments for an invoice
router.get('/invoice/:invoiceId', async (req, res) => {
  try {
    const { invoiceId } = req.params

    if (req.userData.role === 'SUPPLIER') {
      const supplierId = await getSupplierIdForRequest(req)
      const { rows: inv } = await query(`SELECT supplier_id FROM invoice WHERE id = $1`, [
        invoiceId,
      ])
      if (!inv.length || inv[0].supplier_id !== supplierId) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: { name: 'FORBIDDEN', message: 'Access denied' },
          requestId: req.requestId,
        })
      }
    }

    const { rows } = await query(
      `SELECT * FROM payment WHERE invoice_id = $1 ORDER BY payment_date DESC`,
      [invoiceId]
    )

    res.json({
      ok: true,
      data: { payments: rows },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Get payments error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get payments',
      },
      requestId: req.requestId,
    })
  }
})

export { router as paymentsRoutes }
