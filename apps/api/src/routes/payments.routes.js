import express from 'express';
import { requireAuth, requireRole } from '../lib/rbac.js';
import { query } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { ValidationError } from '../middlewares/errorHandler.js';
import { z } from 'zod';
import { notifyPaymentReceived } from '../services/notification.service.js';

const router = express.Router();

const paymentSchema = z.object({
  invoice_id: z.string().uuid(),
  payment_amount: z.number().positive(),
  payment_date: z.string(),
  payment_method: z.enum(['CASH', 'CHECK', 'BANK_TRANSFER', 'STRIPE', 'CREDIT_CARD', 'ACH', 'OTHER']),
  payment_reference: z.string().optional(),
  provider: z.string().optional(),
  provider_transaction_id: z.string().optional(),
  bank_name: z.string().optional(),
  notes: z.string().optional(),
});

// Record a payment
router.post('/', requireAuth, requireRole(['SUPPLIER', 'ADMIN']), async (req, res) => {
  try {
    const paymentData = paymentSchema.parse(req.body);
    
    // Validate invoice exists and belongs to supplier
    const { rows: invoices } = await query(`
      SELECT i.*, s.contact_email 
      FROM invoice i
      JOIN supplier s ON s.id = i.supplier_id
      WHERE i.id = $1
    `, [paymentData.invoice_id]);
    
    if (invoices.length === 0) {
      throw new ValidationError('Invoice not found');
    }
    
    if (req.userData.role === 'SUPPLIER' && invoices[0].contact_email !== req.userData.email) {
      throw new ValidationError('Invoice does not belong to your supplier account');
    }
    
    const invoice = invoices[0];
    
    // Check if payment exceeds balance
    if (paymentData.payment_amount > invoice.balance_due) {
      throw new ValidationError(`Payment amount (${paymentData.payment_amount}) exceeds balance due (${invoice.balance_due})`);
    }
    
    // Generate payment number
    const paymentNumber = `PAY-${Date.now()}`;
    
    const { rows } = await query(`
      INSERT INTO payment (
        invoice_id, payment_number, payment_date, payment_amount,
        payment_method, payment_reference, provider, provider_transaction_id,
        bank_name, notes, recorded_by, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      paymentData.invoice_id,
      paymentNumber,
      paymentData.payment_date,
      paymentData.payment_amount,
      paymentData.payment_method,
      paymentData.payment_reference,
      paymentData.provider,
      paymentData.provider_transaction_id,
      paymentData.bank_name,
      paymentData.notes,
      req.userData.id,
      'COMPLETED'
    ]);
    
    // Trigger will update invoice balance and status
    
    logger.info('Payment recorded', { 
      paymentId: rows[0].id,
      invoiceId: paymentData.invoice_id,
      amount: paymentData.payment_amount,
      actor: req.userData.id 
    });
    
    // Send notification to supplier about payment received
    try {
      await notifyPaymentReceived({
        id: rows[0].id,
        payment_amount: paymentData.payment_amount,
        invoice_id: paymentData.invoice_id,
        invoice: invoice,
      });
    } catch (notifError) {
      // Don't fail payment recording if notification fails
      logger.error('Failed to send payment notification', { error: notifError.message });
    }
    
    res.status(201).json({
      ok: true,
      data: { payment: rows[0] },
      error: null,
      requestId: req.requestId,
    });
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
      });
    }
    
    logger.error('Record payment error:', error);
    res.status(error.statusCode || 500).json({
      ok: false,
      data: null,
      error: {
        name: error.name || 'INTERNAL_ERROR',
        message: error.message || 'Failed to record payment',
      },
      requestId: req.requestId,
    });
  }
});

// Get payments for an invoice
router.get('/invoice/:invoiceId', requireAuth, async (req, res) => {
  try {
    const { invoiceId } = req.params;
    
    const { rows } = await query(`
      SELECT * FROM payment WHERE invoice_id = $1 ORDER BY payment_date DESC
    `, [invoiceId]);
    
    res.json({
      ok: true,
      data: { payments: rows },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Get payments error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get payments',
      },
      requestId: req.requestId,
    });
  }
});

export { router as paymentsRoutes };
