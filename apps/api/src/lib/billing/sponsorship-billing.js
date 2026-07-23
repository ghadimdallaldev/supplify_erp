/**
 * Supplier sponsorship billing — isolated from subscription checkout/pay-now.
 * Uses billing_invoice + gateway.charge but never applyPaidSubscription / markSubscriptionPastDue
 * on the supplier. PSP-agnostic behind getBillingGateway().
 */
import crypto from 'node:crypto'
import { query, withTransaction } from '../db.js'
import { getBillingGateway } from './gateway-registry.js'
import { getSubscriptionForBilling } from './billing-service.js'
import { SponsorshipError } from '../../middlewares/errorHandler.js'

export const SPONSORSHIP_INVOICE_TYPE = 'supplier_sponsorship'

function generateInvoiceNumber() {
  const ts = Date.now().toString(36).toUpperCase()
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase()
  return `SPN-${ts}-${rand}`
}

async function recordBillingEvent(
  client,
  { subscriptionId, tenantId, tenantType, eventType, payload }
) {
  await client.query(
    `INSERT INTO billing_event (subscription_id, tenant_id, tenant_type, event_type, payload)
     VALUES ($1, $2, $3, $4, $5)`,
    [subscriptionId, tenantId, tenantType, eventType, JSON.stringify(payload || {})]
  )
}

export function isSponsorshipInvoice(invoice) {
  const meta = invoice?.metadata
  const parsed = typeof meta === 'string' ? JSON.parse(meta) : meta || {}
  return parsed.type === SPONSORSHIP_INVOICE_TYPE
}

/**
 * Create an OPEN billing_invoice on the supplier subscription for a sponsorship.
 * Idempotent: returns existing invoice if sponsorship already has supplier_billing_invoice_id.
 */
export async function createSupplierSponsorshipInvoice({ sponsorship, snapshot, client = null }) {
  const run = async (db) => {
    if (sponsorship.supplier_billing_invoice_id) {
      const { rows } = await db.query(`SELECT * FROM billing_invoice WHERE id = $1`, [
        sponsorship.supplier_billing_invoice_id,
      ])
      if (rows[0]) return { invoice: rows[0], created: false }
    }

    const subscription = await getSubscriptionForBilling(sponsorship.supplier_id, 'SUPPLIER')
    if (!subscription) {
      throw new SponsorshipError(
        'SPONSORSHIP_PAYMENT_REQUIRED',
        'Supplier has no active subscription for billing',
        { statusCode: 400 }
      )
    }

    const amount = Number(snapshot.finalSponsoredAmount ?? snapshot.baseAmount ?? 0)
    if (!(amount > 0)) {
      throw new SponsorshipError(
        'SPONSORSHIP_PLAN_NOT_ELIGIBLE',
        'Sponsored plan has no monthly price configured',
        { statusCode: 400 }
      )
    }

    const periodStart = snapshot.periodStart ? new Date(snapshot.periodStart) : new Date()
    const periodEnd = snapshot.periodEnd
      ? new Date(snapshot.periodEnd)
      : new Date(periodStart.getTime() + 30 * 24 * 60 * 60 * 1000)

    const metadata = {
      type: SPONSORSHIP_INVOICE_TYPE,
      sponsorshipId: sponsorship.id,
      restaurantId: sponsorship.restaurant_id,
      prospectId: sponsorship.prospect_id,
      pricingSnapshot: snapshot,
      billingInterval: 'MONTHLY',
    }

    const dueDate = new Date()
    const { rows } = await db.query(
      `INSERT INTO billing_invoice (
        subscription_id, tenant_id, tenant_type, invoice_number, amount, currency,
        billing_cycle, plan_id, plan_name, status, period_start, period_end, due_date, metadata
      ) VALUES ($1, $2, 'SUPPLIER', $3, $4, $5, 'MONTHLY', $6, $7, 'OPEN', $8, $9, $10, $11)
      RETURNING *`,
      [
        subscription.id,
        sponsorship.supplier_id,
        generateInvoiceNumber(),
        amount,
        snapshot.currency || 'USD',
        snapshot.planId || null,
        snapshot.planName || 'Sponsored restaurant plan',
        periodStart,
        periodEnd,
        dueDate,
        JSON.stringify(metadata),
      ]
    )

    await db.query(
      `UPDATE supplier_sponsorship SET
         supplier_billing_invoice_id = $2,
         supplier_payment_status = 'invoice_open',
         updated_at = now()
       WHERE id = $1`,
      [sponsorship.id, rows[0].id]
    )

    await recordBillingEvent(db, {
      subscriptionId: subscription.id,
      tenantId: sponsorship.supplier_id,
      tenantType: 'SUPPLIER',
      eventType: 'sponsorship.invoice.created',
      payload: { invoiceId: rows[0].id, sponsorshipId: sponsorship.id, amount },
    })

    return { invoice: rows[0], created: true, subscription }
  }

  if (client) return run(client)
  return withTransaction(run)
}

async function getPaymentMethodForCharge(client, tenantId, tenantType, paymentMethodId) {
  if (paymentMethodId) {
    const { rows } = await client.query(
      `SELECT * FROM billing_payment_method
       WHERE id = $1 AND tenant_id = $2 AND tenant_type = $3 AND status = 'ACTIVE'`,
      [paymentMethodId, tenantId, tenantType]
    )
    if (!rows.length) {
      throw new SponsorshipError('SPONSORSHIP_PAYMENT_REQUIRED', 'Payment method not found', {
        statusCode: 400,
      })
    }
    return rows[0]
  }
  const { rows } = await client.query(
    `SELECT * FROM billing_payment_method
     WHERE tenant_id = $1 AND tenant_type = $2 AND status = 'ACTIVE'
     ORDER BY is_default DESC, created_at DESC LIMIT 1`,
    [tenantId, tenantType]
  )
  if (!rows.length) {
    throw new SponsorshipError(
      'SPONSORSHIP_PAYMENT_REQUIRED',
      'No payment method on file for supplier',
      { statusCode: 400 }
    )
  }
  return rows[0]
}

/**
 * Charge a sponsorship invoice via gateway. Does not change supplier plan or past-due status.
 */
export async function chargeSupplierSponsorshipInvoice({
  invoiceId,
  supplierId,
  paymentMethodId = null,
  idempotencyKey,
  provider = null,
}) {
  if (!idempotencyKey) {
    throw new SponsorshipError(
      'SPONSORSHIP_PAYMENT_REQUIRED',
      'Idempotency key is required for sponsorship payment',
      { statusCode: 400 }
    )
  }

  return withTransaction(async (client) => {
    const { rows: invRows } = await client.query(
      `SELECT * FROM billing_invoice WHERE id = $1 AND tenant_id = $2 AND tenant_type = 'SUPPLIER'
       FOR UPDATE`,
      [invoiceId, supplierId]
    )
    const invoice = invRows[0]
    if (!invoice) {
      throw new SponsorshipError('SPONSORSHIP_INVALID_STATE', 'Invoice not found', {
        statusCode: 404,
      })
    }
    if (!isSponsorshipInvoice(invoice)) {
      throw new SponsorshipError(
        'SPONSORSHIP_INVALID_STATE',
        'Invoice is not a sponsorship charge',
        { statusCode: 400 }
      )
    }
    if (invoice.status === 'PAID') {
      return { success: true, invoice, duplicate: true }
    }
    if (invoice.status !== 'OPEN') {
      throw new SponsorshipError(
        'SPONSORSHIP_INVALID_STATE',
        `Invoice cannot be charged in status ${invoice.status}`,
        { statusCode: 400 }
      )
    }

    const { rows: existing } = await client.query(
      `SELECT * FROM billing_payment WHERE idempotency_key = $1`,
      [idempotencyKey]
    )
    if (existing.length > 0 && existing[0].status === 'SUCCEEDED') {
      return { success: true, payment: existing[0], invoice, duplicate: true }
    }

    const subscription = await getSubscriptionForBilling(supplierId, 'SUPPLIER')
    if (!subscription) {
      throw new SponsorshipError('SPONSORSHIP_PAYMENT_REQUIRED', 'Supplier subscription missing', {
        statusCode: 400,
      })
    }

    const method = await getPaymentMethodForCharge(client, supplierId, 'SUPPLIER', paymentMethodId)
    const gateway = getBillingGateway(provider || method.provider)
    const amount = Number(invoice.amount)

    const { rows: paymentRows } = await client.query(
      `INSERT INTO billing_payment (
        invoice_id, subscription_id, tenant_id, tenant_type, payment_method_id,
        provider, amount, currency, status, idempotency_key, metadata
      ) VALUES ($1, $2, $3, 'SUPPLIER', $4, $5, $6, $7, 'PROCESSING', $8, $9)
      ON CONFLICT (idempotency_key) DO UPDATE SET updated_at = now()
      RETURNING *`,
      [
        invoice.id,
        subscription.id,
        supplierId,
        method.id,
        gateway.id,
        amount,
        invoice.currency || 'USD',
        idempotencyKey,
        JSON.stringify({ type: SPONSORSHIP_INVOICE_TYPE }),
      ]
    )
    const payment = paymentRows[0]

    const chargeResult = await gateway.charge({
      amount,
      currency: invoice.currency || 'USD',
      providerPaymentMethodId: method.provider_payment_method_id,
      idempotencyKey,
      metadata: {
        invoiceId: invoice.id,
        sponsorshipId: invoice.metadata?.sponsorshipId,
        type: SPONSORSHIP_INVOICE_TYPE,
      },
    })

    if (chargeResult.status === 'succeeded') {
      await client.query(
        `UPDATE billing_payment SET status = 'SUCCEEDED', provider_payment_id = $1, updated_at = now()
         WHERE id = $2`,
        [chargeResult.providerPaymentId, payment.id]
      )
      await client.query(
        `UPDATE billing_invoice SET status = 'PAID', paid_at = now(), updated_at = now() WHERE id = $1`,
        [invoice.id]
      )
      await recordBillingEvent(client, {
        subscriptionId: subscription.id,
        tenantId: supplierId,
        tenantType: 'SUPPLIER',
        eventType: 'sponsorship.payment.succeeded',
        payload: {
          paymentId: payment.id,
          invoiceId: invoice.id,
          amount,
          providerPaymentId: chargeResult.providerPaymentId,
        },
      })
      const { rows: paid } = await client.query(`SELECT * FROM billing_invoice WHERE id = $1`, [
        invoice.id,
      ])
      return {
        success: true,
        invoice: paid[0],
        payment,
        providerPaymentId: chargeResult.providerPaymentId,
      }
    }

    await client.query(
      `UPDATE billing_payment SET status = 'FAILED', provider_payment_id = $1,
        failure_code = $2, failure_message = $3, updated_at = now() WHERE id = $4`,
      [
        chargeResult.providerPaymentId,
        chargeResult.failureCode,
        chargeResult.failureMessage,
        payment.id,
      ]
    )
    await recordBillingEvent(client, {
      subscriptionId: subscription.id,
      tenantId: supplierId,
      tenantType: 'SUPPLIER',
      eventType: 'sponsorship.payment.failed',
      payload: {
        paymentId: payment.id,
        invoiceId: invoice.id,
        failureCode: chargeResult.failureCode,
        failureMessage: chargeResult.failureMessage,
      },
    })

    throw new SponsorshipError(
      'SPONSORSHIP_PAYMENT_FAILED',
      chargeResult.failureMessage || 'Sponsorship payment failed',
      {
        statusCode: 402,
        details: {
          failureCode: chargeResult.failureCode,
          invoiceId: invoice.id,
        },
      }
    )
  })
}

/**
 * Admin/manual approval: mark sponsorship invoice PAID without gateway charge.
 */
export async function markSponsorshipInvoicePaidManual({
  invoiceId,
  supplierId,
  adminUserId = null,
  reason = 'manual_approval',
}) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM billing_invoice WHERE id = $1 AND tenant_id = $2 AND tenant_type = 'SUPPLIER'
       FOR UPDATE`,
      [invoiceId, supplierId]
    )
    const invoice = rows[0]
    if (!invoice) {
      throw new SponsorshipError('SPONSORSHIP_INVALID_STATE', 'Invoice not found', {
        statusCode: 404,
      })
    }
    if (!isSponsorshipInvoice(invoice)) {
      throw new SponsorshipError(
        'SPONSORSHIP_INVALID_STATE',
        'Invoice is not a sponsorship charge',
        { statusCode: 400 }
      )
    }
    if (invoice.status === 'PAID') {
      return { invoice, duplicate: true }
    }
    if (invoice.status !== 'OPEN') {
      throw new SponsorshipError(
        'SPONSORSHIP_INVALID_STATE',
        `Cannot manually pay invoice in status ${invoice.status}`,
        { statusCode: 400 }
      )
    }

    await client.query(
      `UPDATE billing_invoice SET
         status = 'PAID', paid_at = now(), updated_at = now(),
         metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
       WHERE id = $1`,
      [
        invoice.id,
        JSON.stringify({
          manualPaid: true,
          manualPaidBy: adminUserId,
          manualPaidReason: reason,
        }),
      ]
    )

    const subscription = await getSubscriptionForBilling(supplierId, 'SUPPLIER')
    if (subscription) {
      await recordBillingEvent(client, {
        subscriptionId: subscription.id,
        tenantId: supplierId,
        tenantType: 'SUPPLIER',
        eventType: 'sponsorship.payment.manual',
        payload: { invoiceId: invoice.id, adminUserId, reason },
      })
    }

    const { rows: paid } = await client.query(`SELECT * FROM billing_invoice WHERE id = $1`, [
      invoice.id,
    ])
    return { invoice: paid[0], duplicate: false }
  })
}

/**
 * Void an unpaid sponsorship invoice (cancel path).
 */
export async function voidSponsorshipInvoice({ invoiceId, supplierId, reason = 'cancelled' }) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM billing_invoice WHERE id = $1 AND tenant_id = $2 AND tenant_type = 'SUPPLIER'
       FOR UPDATE`,
      [invoiceId, supplierId]
    )
    const invoice = rows[0]
    if (!invoice) return { voided: false }
    if (invoice.status === 'PAID') {
      throw new SponsorshipError(
        'SPONSORSHIP_INVALID_STATE',
        'Cannot void a paid sponsorship invoice; use refund flow',
        { statusCode: 400 }
      )
    }
    if (invoice.status === 'VOID') return { voided: true, duplicate: true, invoice }
    await client.query(
      `UPDATE billing_invoice SET status = 'VOID', updated_at = now(),
         metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
       WHERE id = $1`,
      [invoice.id, JSON.stringify({ voidReason: reason })]
    )
    const { rows: updated } = await client.query(`SELECT * FROM billing_invoice WHERE id = $1`, [
      invoice.id,
    ])
    return { voided: true, invoice: updated[0] }
  })
}

/**
 * Mark paid invoice as refunded (ledger state). Full PSP refunds require a live gateway.
 */
export async function markSponsorshipInvoiceRefunded({
  invoiceId,
  supplierId,
  amount = null,
  reason = 'refund',
}) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM billing_invoice WHERE id = $1 AND tenant_id = $2 AND tenant_type = 'SUPPLIER'
       FOR UPDATE`,
      [invoiceId, supplierId]
    )
    const invoice = rows[0]
    if (!invoice) {
      throw new SponsorshipError('SPONSORSHIP_INVALID_STATE', 'Invoice not found', {
        statusCode: 404,
      })
    }
    if (invoice.status !== 'PAID') {
      throw new SponsorshipError(
        'SPONSORSHIP_INVALID_STATE',
        'Only paid invoices can be refunded',
        { statusCode: 400 }
      )
    }
    const refundAmount = amount != null ? Number(amount) : Number(invoice.amount)
    await client.query(
      `UPDATE billing_invoice SET
         metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
         updated_at = now()
       WHERE id = $1`,
      [
        invoice.id,
        JSON.stringify({
          refunded: true,
          refundAmount,
          refundReason: reason,
          refundedAt: new Date().toISOString(),
        }),
      ]
    )
    await client.query(
      `UPDATE billing_payment SET status = 'REFUNDED', updated_at = now()
       WHERE invoice_id = $1 AND status = 'SUCCEEDED'`,
      [invoice.id]
    )
    return { invoiceId, refundAmount }
  })
}

/** Load invoice by id for a supplier. */
export async function getSponsorshipInvoice(invoiceId, supplierId) {
  const { rows } = await query(
    `SELECT * FROM billing_invoice WHERE id = $1 AND tenant_id = $2 AND tenant_type = 'SUPPLIER'`,
    [invoiceId, supplierId]
  )
  return rows[0] || null
}
