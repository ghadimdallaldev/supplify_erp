import express from 'express';
import { requireAuth, requireRole } from '../lib/rbac.js';
import { query } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { NotFoundError, ValidationError } from '../middlewares/errorHandler.js';
import { z } from 'zod';

const router = express.Router();

// Validation schemas
const markPaidSchema = z.object({
  paymentDate: z.string(),
  paymentMethod: z.enum(['CASH', 'CHECK', 'BANK_TRANSFER', 'CREDIT_CARD', 'ACH', 'OTHER']),
  paymentReference: z.string().optional(),
  notes: z.string().optional(),
});

const disputeInvoiceSchema = z.object({
  reason: z.string().min(10),
  evidence: z.string().optional(),
});

// Get all invoices for the restaurant
router.get('/invoices', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const { status, supplier, limit = '100', offset = '0' } = req.query;

    const { rows: restaurants } = await query(
      'SELECT id FROM restaurant WHERE contact_email = $1',
      [req.userData.email]
    );

    if (restaurants.length === 0) {
      throw new ValidationError('Restaurant not found');
    }

    const restaurantId = restaurants[0].id;

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
    `;

    const queryParams = [restaurantId];

    if (status) {
      invoicesQuery += ` AND i.status = $${queryParams.length + 1}`;
      queryParams.push(status);
    }

    if (supplier) {
      invoicesQuery += ` AND s.id = $${queryParams.length + 1}`;
      queryParams.push(supplier);
    }

    invoicesQuery += `
      GROUP BY i.id, s.name, s.slug, s.contact_email, s.phone, o.id, o.status, o.placed_at
      ORDER BY i.due_date ASC, i.invoice_date DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;

    queryParams.push(limit, offset);

    const { rows } = await query(invoicesQuery, queryParams);

    res.json({
      ok: true,
      data: { invoices: rows },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error({
      message: 'Get invoices error',
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get invoices',
        details: error.message,
      },
      requestId: req.requestId,
    });
  }
});

// Get invoice by ID with line items
router.get('/invoices/:id', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const { id } = req.params;

    const { rows: restaurants } = await query(
      'SELECT id FROM restaurant WHERE contact_email = $1',
      [req.userData.email]
    );

    if (restaurants.length === 0) {
      throw new ValidationError('Restaurant not found');
    }

    const restaurantId = restaurants[0].id;

    // Get invoice
    const { rows: invoices } = await query(`
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
    `, [id, restaurantId]);

    if (invoices.length === 0) {
      throw new NotFoundError('Invoice not found');
    }

    // Get line items
    const { rows: lineItems } = await query(`
      SELECT * FROM invoice_line_item 
      WHERE invoice_id = $1 
      ORDER BY created_at
    `, [id]);

    // Get payment history
    const { rows: payments } = await query(`
      SELECT 
        p.*,
        pm.name as recorded_by_name
      FROM payment p
      LEFT JOIN app_user pm ON pm.id::text = p.recorded_by
      WHERE p.invoice_id = $1
      ORDER BY p.payment_date DESC, p.created_at DESC
    `, [id]);

    res.json({
      ok: true,
      data: {
        invoice: invoices[0],
        lineItems,
        payments,
      },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: error.message },
        requestId: req.requestId,
      });
    }

    logger.error({
      message: 'Get invoice error',
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get invoice',
        details: error.message,
      },
      requestId: req.requestId,
    });
  }
});

// Mark invoice as paid (manual payment recording)
router.post('/invoices/:id/pay', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const { id } = req.params;
    const paymentData = markPaidSchema.parse(req.body);

    const { rows: restaurants } = await query(
      'SELECT id FROM restaurant WHERE contact_email = $1',
      [req.userData.email]
    );

    if (restaurants.length === 0) {
      throw new ValidationError('Restaurant not found');
    }

    const restaurantId = restaurants[0].id;

    // Get invoice and check ownership
    const { rows: invoices } = await query(`
      SELECT * FROM invoice 
      WHERE id = $1 AND restaurant_id = $2
    `, [id, restaurantId]);

    if (invoices.length === 0) {
      throw new NotFoundError('Invoice not found');
    }

    const invoice = invoices[0];

    // Calculate remaining balance
    const { rows: payments } = await query(`
      SELECT COALESCE(SUM(payment_amount), 0) as total_paid
      FROM payment
      WHERE invoice_id = $1 AND status = 'COMPLETED'
    `, [id]);

    const totalPaid = parseFloat(payments[0].total_paid || 0);
    const remainingBalance = parseFloat(invoice.total_amount) - totalPaid;

    // Generate payment number
    const paymentNumber = `PAY-${new Date().toISOString().split('T')[0]}-${Date.now().toString().slice(-6)}`;

    // Create payment record
    const { rows: payment } = await query(`
      INSERT INTO payment (
        invoice_id, payment_number, payment_date, payment_amount,
        payment_method, payment_reference, currency, status,
        recorded_by, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      id,
      paymentNumber,
      paymentData.paymentDate,
      remainingBalance, // Pay full remaining balance
      paymentData.paymentMethod,
      paymentData.paymentReference || null,
      invoice.currency,
      'COMPLETED',
      req.userData.id,
      paymentData.notes || null,
    ]);

    logger.info('Invoice payment recorded', {
      invoiceId: id,
      paymentId: payment[0].id,
      actor: req.userData.id,
    });

    res.json({
      ok: true,
      data: { payment: payment[0] },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: error.message },
        requestId: req.requestId,
      });
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
      });
    }

    logger.error({
      message: 'Mark invoice paid error',
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to record payment',
        details: error.message,
      },
      requestId: req.requestId,
    });
  }
});

// Get account statement for a supplier
router.get('/suppliers/:supplierId/statement', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const { supplierId } = req.params;
    const { startDate, endDate } = req.query;

    const { rows: restaurants } = await query(
      'SELECT id FROM restaurant WHERE contact_email = $1',
      [req.userData.email]
    );

    if (restaurants.length === 0) {
      throw new ValidationError('Restaurant not found');
    }

    const restaurantId = restaurants[0].id;

    // Get statement data
    const { rows: invoices } = await query(`
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
    `, [restaurantId, supplierId, startDate, endDate].filter(Boolean));

    // Calculate summary
    const summary = {
      openingBalance: 0, // TODO: Calculate from previous period
      totalCharges: 0,
      totalPayments: 0,
      totalAdjustments: 0,
      closingBalance: 0,
      invoiceCount: invoices.length,
    };

    invoices.forEach(inv => {
      summary.totalCharges += parseFloat(inv.total_amount || 0);
      summary.totalPayments += parseFloat(inv.total_paid || 0);
    });

    summary.closingBalance = summary.openingBalance + summary.totalCharges - summary.totalPayments + summary.totalAdjustments;

    res.json({
      ok: true,
      data: {
        invoices,
        summary,
      },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error({
      message: 'Get statement error',
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get statement',
        details: error.message,
      },
      requestId: req.requestId,
    });
  }
});

// Get monthly expense breakdown
router.get('/expenses', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const { period = '30' } = req.query;

    const { rows: restaurants } = await query(
      'SELECT id FROM restaurant WHERE contact_email = $1',
      [req.userData.email]
    );

    if (restaurants.length === 0) {
      throw new ValidationError('Restaurant not found');
    }

    const restaurantId = restaurants[0].id;

    // Get expense breakdown by supplier
    const { rows: bySupplier } = await query(`
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
    `, [restaurantId]);

    // Get expense breakdown by category (from products)
    const { rows: byCategory } = await query(`
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
    `, [restaurantId]);

    // Get monthly trend
    const { rows: monthlyTrend } = await query(`
      SELECT 
        DATE_TRUNC('month', i.invoice_date) as month,
        COUNT(i.id) as invoice_count,
        SUM(i.total_amount) as total_spent
      FROM invoice i
      WHERE i.restaurant_id = $1
        AND i.invoice_date >= NOW() - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', i.invoice_date)
      ORDER BY month ASC
    `, [restaurantId]);

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
    });
  } catch (error) {
    logger.error({
      message: 'Get expenses error',
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get expenses',
        details: error.message,
      },
      requestId: req.requestId,
    });
  }
});

// Get overdue payments and alerts
router.get('/overdue', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const { rows: restaurants } = await query(
      'SELECT id FROM restaurant WHERE contact_email = $1',
      [req.userData.email]
    );

    if (restaurants.length === 0) {
      throw new ValidationError('Restaurant not found');
    }

    const restaurantId = restaurants[0].id;

    const { rows: overdue } = await query(`
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
    `, [restaurantId]);

    // Calculate total overdue amount
    const totalOverdue = overdue.reduce((sum, inv) => 
      sum + parseFloat(inv.amount_due || 0), 0
    );

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
    });
  } catch (error) {
    logger.error({
      message: 'Get overdue error',
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get overdue invoices',
        details: error.message,
      },
      requestId: req.requestId,
    });
  }
});

export { router as restaurantFinanceRoutes };

