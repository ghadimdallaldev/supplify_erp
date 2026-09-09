/**
 * Deal boost + featured placement billing — isolated from subscription checkout.
 * Uses billing_invoice + gateway.charge (same pattern as sponsorship-billing).
 * PSP-agnostic behind getBillingGateway().
 */
import crypto from 'node:crypto'
import { query, withTransaction } from '../db.js'
import { getBillingGateway } from './gateway-registry.js'
import { getSubscriptionForBilling } from './billing-service.js'
import { PromotionAdError } from '../../middlewares/errorHandler.js'
import { config } from '../../config/env.js'

export const DEAL_BOOST_INVOICE_TYPE = 'deal_boost'
export const FEATURED_PLACEMENT_INVOICE_TYPE = 'featured_placement'

export const PROMOTION_AD_INVOICE_TYPES = new Set([
  DEAL_BOOST_INVOICE_TYPE,
  FEATURED_PLACEMENT_INVOICE_TYPE,
])

function generateInvoiceNumber(prefix) {
  const ts = Date.now().toString(36).toUpperCase()
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase()
  return `${prefix}-${ts}-${rand}`
}

function parseInvoiceMetadata(invoice) {
  const meta = invoice?.metadata
  if (!meta) return {}
  if (typeof meta === 'string') {
    try {
      return JSON.parse(meta)
    } catch {
      return {}
    }
  }
  return meta
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

/**
 * Production-safe waive gate for promotion ads.
 * Never waive when PAYMENTS_MODE=live. Dev/test may waive unless live.
 */
export function isPromotionAdPaymentWaived() {
  if (config.PAYMENTS_MODE === 'live') return false
  if (config.NODE_ENV === 'production') {
    return process.env.ALLOW_WAIVE_DEAL_PROMOTION_PAYMENT === 'true'
  }
  return true
}

export function isPromotionAdInvoice(invoice) {
  const parsed = parseInvoiceMetadata(invoice)
  return PROMOTION_AD_INVOICE_TYPES.has(parsed.type)
}

export function isDealBoostInvoice(invoice) {
  return parseInvoiceMetadata(invoice).type === DEAL_BOOST_INVOICE_TYPE
}

export function isFeaturedPlacementInvoice(invoice) {
  return parseInvoiceMetadata(invoice).type === FEATURED_PLACEMENT_INVOICE_TYPE
}

/**
 * Create OPEN billing_invoice for a deal boost. Idempotent via promotions.billing_invoice_id.
 */
export async function createDealBoostInvoice({ deal, client = null }) {
  const run = async (db) => {
    if (deal.billing_invoice_id) {
      const { rows } = await db.query(`SELECT * FROM billing_invoice WHERE id = $1`, [
        deal.billing_invoice_id,
      ])
      if (rows[0]) return { invoice: rows[0], created: false }
    }

    const amount = Number(deal.boost_price_snapshot || 0)
    if (!(amount > 0)) {
      throw new PromotionAdError(
        'PROMOTION_AD_INVALID_STATE',
        'Deal has no boost amount to invoice',
        { statusCode: 400 }
      )
    }

    const subscription = await getSubscriptionForBilling(deal.supplier_id, 'SUPPLIER')
    if (!subscription) {
      throw new PromotionAdError(
        'PROMOTION_AD_PAYMENT_REQUIRED',
        'Supplier has no subscription for billing',
        { statusCode: 400 }
      )
    }

    const metadata = {
      type: DEAL_BOOST_INVOICE_TYPE,
      promotionId: deal.id,
      pricingKey: deal.boost_pricing_key || null,
      packageId: deal.boost_package_id || null,
      durationDays: deal.boost_duration_days || null,
    }

    const dueDate = new Date()
    const periodStart = new Date()
    const periodEnd = new Date(
      periodStart.getTime() + (Number(deal.boost_duration_days) || 7) * 24 * 60 * 60 * 1000
    )

    const { rows } = await db.query(
      `INSERT INTO billing_invoice (
        subscription_id, tenant_id, tenant_type, invoice_number, amount, currency,
        billing_cycle, plan_id, plan_name, status, period_start, period_end, due_date, metadata
      ) VALUES ($1, $2, 'SUPPLIER', $3, $4, $5, 'MONTHLY', NULL, $6, 'OPEN', $7, $8, $9, $10)
      RETURNING *`,
      [
        subscription.id,
        deal.supplier_id,
        generateInvoiceNumber('BST'),
        amount,
        'USD',
        deal.boost_pricing_key || 'Deal boost',
        periodStart,
        periodEnd,
        dueDate,
        JSON.stringify(metadata),
      ]
    )

    await db.query(
      `UPDATE promotions SET billing_invoice_id = $2, updated_at = now() WHERE id = $1`,
      [deal.id, rows[0].id]
    )

    await recordBillingEvent(db, {
      subscriptionId: subscription.id,
      tenantId: deal.supplier_id,
      tenantType: 'SUPPLIER',
      eventType: 'deal_boost.invoice.created',
      payload: { invoiceId: rows[0].id, promotionId: deal.id, amount },
    })

    return { invoice: rows[0], created: true, subscription }
  }

  if (client) return run(client)
  return withTransaction(run)
}

/**
 * Create OPEN billing_invoice for featured placement. Idempotent via placement.billing_invoice_id.
 */
export async function createFeaturedPlacementInvoice({ placement, pricing, client = null }) {
  const run = async (db) => {
    if (placement.billing_invoice_id) {
      const { rows } = await db.query(`SELECT * FROM billing_invoice WHERE id = $1`, [
        placement.billing_invoice_id,
      ])
      if (rows[0]) return { invoice: rows[0], created: false }
    }

    const amount = Number(placement.amount_paid ?? pricing?.amount ?? 0)
    if (!(amount > 0)) {
      throw new PromotionAdError(
        'PROMOTION_AD_INVALID_STATE',
        'Featured placement has no amount to invoice',
        { statusCode: 400 }
      )
    }

    const subscription = await getSubscriptionForBilling(placement.supplier_id, 'SUPPLIER')
    if (!subscription) {
      throw new PromotionAdError(
        'PROMOTION_AD_PAYMENT_REQUIRED',
        'Supplier has no subscription for billing',
        { statusCode: 400 }
      )
    }

    const metadata = {
      type: FEATURED_PLACEMENT_INVOICE_TYPE,
      placementId: placement.id,
      pricingKey: placement.pricing_key || pricing?.pricing_key || null,
    }

    const dueDate = new Date()
    const periodStart = placement.starts_at ? new Date(placement.starts_at) : new Date()
    const periodEnd = placement.ends_at
      ? new Date(placement.ends_at)
      : new Date(periodStart.getTime() + 7 * 24 * 60 * 60 * 1000)

    const { rows } = await db.query(
      `INSERT INTO billing_invoice (
        subscription_id, tenant_id, tenant_type, invoice_number, amount, currency,
        billing_cycle, plan_id, plan_name, status, period_start, period_end, due_date, metadata
      ) VALUES ($1, $2, 'SUPPLIER', $3, $4, $5, 'MONTHLY', NULL, $6, 'OPEN', $7, $8, $9, $10)
      RETURNING *`,
      [
        subscription.id,
        placement.supplier_id,
        generateInvoiceNumber('FTP'),
        amount,
        placement.currency || 'USD',
        placement.pricing_key || 'Featured placement',
        periodStart,
        periodEnd,
        dueDate,
        JSON.stringify(metadata),
      ]
    )

    await db.query(
      `UPDATE supplier_featured_placements SET billing_invoice_id = $2, updated_at = now() WHERE id = $1`,
      [placement.id, rows[0].id]
    )

    await recordBillingEvent(db, {
      subscriptionId: subscription.id,
      tenantId: placement.supplier_id,
      tenantType: 'SUPPLIER',
      eventType: 'featured_placement.invoice.created',
      payload: { invoiceId: rows[0].id, placementId: placement.id, amount },
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
      throw new PromotionAdError('PROMOTION_AD_PAYMENT_REQUIRED', 'Payment method not found', {
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
    throw new PromotionAdError(
      'PROMOTION_AD_PAYMENT_REQUIRED',
      'No payment method on file for supplier',
      { statusCode: 400 }
    )
  }
  return rows[0]
}

/**
 * Charge a promotion-ad invoice via gateway. Does not change supplier subscription status.
 */
export async function chargePromotionAdInvoice({
  invoiceId,
  supplierId,
  paymentMethodId = null,
  idempotencyKey,
  provider = null,
  expectedType = null,
}) {
  if (!idempotencyKey) {
    throw new PromotionAdError(
      'PROMOTION_AD_PAYMENT_REQUIRED',
      'Idempotency key is required for promotion ad payment',
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
      throw new PromotionAdError('PROMOTION_AD_INVOICE_NOT_FOUND', 'Invoice not found', {
        statusCode: 404,
      })
    }
    if (!isPromotionAdInvoice(invoice)) {
      throw new PromotionAdError(
        'PROMOTION_AD_INVALID_STATE',
        'Invoice is not a promotion ad charge',
        { statusCode: 400 }
      )
    }
    const meta = parseInvoiceMetadata(invoice)
    if (expectedType && meta.type !== expectedType) {
      throw new PromotionAdError(
        'PROMOTION_AD_INVALID_STATE',
        `Expected invoice type ${expectedType}`,
        { statusCode: 400 }
      )
    }
    if (invoice.status === 'PAID') {
      return { success: true, invoice, duplicate: true }
    }
    if (invoice.status !== 'OPEN') {
      throw new PromotionAdError(
        'PROMOTION_AD_INVALID_STATE',
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
      throw new PromotionAdError('PROMOTION_AD_PAYMENT_REQUIRED', 'Supplier subscription missing', {
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
        JSON.stringify({ type: meta.type, ...meta }),
      ]
    )
    const payment = paymentRows[0]

    const chargeResult = await gateway.charge({
      amount,
      currency: invoice.currency || 'USD',
      providerPaymentMethodId: method.provider_payment_method_id,
      idempotencyKey,
      metadata: { invoiceId: invoice.id, type: meta.type, ...meta },
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
        eventType: `${meta.type}.payment.succeeded`,
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
      eventType: `${meta.type}.payment.failed`,
      payload: {
        paymentId: payment.id,
        invoiceId: invoice.id,
        failureCode: chargeResult.failureCode,
        failureMessage: chargeResult.failureMessage,
      },
    })

    throw new PromotionAdError(
      'PROMOTION_AD_PAYMENT_FAILED',
      chargeResult.failureMessage || 'Promotion ad payment failed',
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

export async function markPromotionAdInvoicePaidManual({
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
      throw new PromotionAdError('PROMOTION_AD_INVOICE_NOT_FOUND', 'Invoice not found', {
        statusCode: 404,
      })
    }
    if (!isPromotionAdInvoice(invoice)) {
      throw new PromotionAdError(
        'PROMOTION_AD_INVALID_STATE',
        'Invoice is not a promotion ad charge',
        { statusCode: 400 }
      )
    }
    if (invoice.status === 'PAID') {
      return { invoice, duplicate: true }
    }
    if (invoice.status !== 'OPEN') {
      throw new PromotionAdError(
        'PROMOTION_AD_INVALID_STATE',
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
      const meta = parseInvoiceMetadata(invoice)
      await recordBillingEvent(client, {
        subscriptionId: subscription.id,
        tenantId: supplierId,
        tenantType: 'SUPPLIER',
        eventType: `${meta.type}.payment.manual`,
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
 * Mark paid invoice as refunded (ledger). Invoice stays PAID; metadata + payment row mark refund.
 * Full card refunds when gateway.refund exists.
 */
export async function markPromotionAdInvoiceRefunded({
  invoiceId,
  supplierId,
  amount = null,
  reason = 'refund',
  attemptGatewayRefund = true,
}) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM billing_invoice WHERE id = $1 AND tenant_id = $2 AND tenant_type = 'SUPPLIER'
       FOR UPDATE`,
      [invoiceId, supplierId]
    )
    const invoice = rows[0]
    if (!invoice) {
      throw new PromotionAdError('PROMOTION_AD_INVOICE_NOT_FOUND', 'Invoice not found', {
        statusCode: 404,
      })
    }
    if (!isPromotionAdInvoice(invoice)) {
      throw new PromotionAdError(
        'PROMOTION_AD_INVALID_STATE',
        'Invoice is not a promotion ad charge',
        { statusCode: 400 }
      )
    }
    const existingMeta = parseInvoiceMetadata(invoice)
    if (existingMeta.refunded) {
      return { invoice, duplicate: true }
    }
    if (invoice.status !== 'PAID') {
      throw new PromotionAdError(
        'PROMOTION_AD_INVALID_STATE',
        'Only paid invoices can be refunded',
        { statusCode: 400 }
      )
    }

    const refundAmount = amount != null ? Number(amount) : Number(invoice.amount)
    let providerRefundId = null

    if (attemptGatewayRefund) {
      const { rows: payRows } = await client.query(
        `SELECT * FROM billing_payment
         WHERE invoice_id = $1 AND status = 'SUCCEEDED'
         ORDER BY created_at DESC LIMIT 1`,
        [invoice.id]
      )
      const payment = payRows[0]
      if (payment?.provider_payment_id) {
        const gateway = getBillingGateway(payment.provider)
        if (typeof gateway.refund === 'function') {
          const refundResult = await gateway.refund({
            providerPaymentId: payment.provider_payment_id,
            amount: refundAmount,
            currency: invoice.currency || 'USD',
            reason,
            idempotencyKey: `promo-ad-refund:${invoice.id}:${refundAmount}`,
          })
          providerRefundId = refundResult?.providerRefundId || null
        }
      }
    }

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
          providerRefundId,
          refundedAt: new Date().toISOString(),
        }),
      ]
    )
    await client.query(
      `UPDATE billing_payment SET status = 'REFUNDED', updated_at = now()
       WHERE invoice_id = $1 AND status = 'SUCCEEDED'`,
      [invoice.id]
    )

    const subscription = await getSubscriptionForBilling(supplierId, 'SUPPLIER')
    if (subscription) {
      const meta = parseInvoiceMetadata(invoice)
      await recordBillingEvent(client, {
        subscriptionId: subscription.id,
        tenantId: supplierId,
        tenantType: 'SUPPLIER',
        eventType: `${meta.type}.payment.refunded`,
        payload: { invoiceId: invoice.id, refundAmount, reason, providerRefundId },
      })
    }

    const { rows: updated } = await client.query(`SELECT * FROM billing_invoice WHERE id = $1`, [
      invoice.id,
    ])
    return { invoice: updated[0], refundAmount, providerRefundId, duplicate: false }
  })
}

/**
 * Handle card dispute / chargeback for a promotion-ad payment.
 * Marks invoice disputed, pauses boost deal or cancels featured placement.
 * Lookup by Stripe PaymentIntent / Charge id stored on billing_payment.
 */
export async function handlePromotionAdDisputeByProviderPaymentId({
  providerPaymentId,
  reason = 'chargeback',
  disputeId = null,
}) {
  if (!providerPaymentId) {
    throw new PromotionAdError('PROMOTION_AD_INVALID_STATE', 'providerPaymentId required', {
      statusCode: 400,
    })
  }

  return withTransaction(async (client) => {
    const { rows: payRows } = await client.query(
      `SELECT bp.*, bi.tenant_id, bi.metadata AS invoice_metadata, bi.status AS invoice_status
       FROM billing_payment bp
       JOIN billing_invoice bi ON bi.id = bp.invoice_id
       WHERE bp.provider_payment_id = $1
       ORDER BY bp.created_at DESC
       LIMIT 1
       FOR UPDATE OF bp`,
      [providerPaymentId]
    )
    const payment = payRows[0]
    if (!payment) {
      return { handled: false, reason: 'payment_not_found' }
    }

    const { rows: invRows } = await client.query(
      `SELECT * FROM billing_invoice WHERE id = $1 FOR UPDATE`,
      [payment.invoice_id]
    )
    const invoice = invRows[0]
    if (!invoice || !isPromotionAdInvoice(invoice)) {
      return { handled: false, reason: 'not_promotion_ad' }
    }

    const meta = parseInvoiceMetadata(invoice)
    if (meta.disputed) {
      return { handled: true, duplicate: true, invoiceId: invoice.id, type: meta.type }
    }

    await client.query(
      `UPDATE billing_invoice SET
         metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
         updated_at = now()
       WHERE id = $1`,
      [
        invoice.id,
        JSON.stringify({
          disputed: true,
          disputeReason: reason,
          disputeId,
          disputedAt: new Date().toISOString(),
        }),
      ]
    )
    await client.query(
      `UPDATE billing_payment SET status = 'DISPUTED', updated_at = now()
       WHERE id = $1 AND status IN ('SUCCEEDED', 'REFUNDED')`,
      [payment.id]
    )

    let pauseResult = null
    if (meta.type === DEAL_BOOST_INVOICE_TYPE && meta.promotionId) {
      const { rows: paused } = await client.query(
        `UPDATE promotions SET
           status = CASE WHEN status = 'active' THEN 'paused' ELSE status END,
           payment_status = 'disputed',
           updated_at = NOW()
         WHERE id = $1
         RETURNING id, status, payment_status`,
        [meta.promotionId]
      )
      await client.query(
        `UPDATE deal_promotions SET status = 'paused', updated_at = NOW()
         WHERE deal_id = $1 AND status = 'active'`,
        [meta.promotionId]
      )
      pauseResult = paused[0] || null
    } else if (meta.type === FEATURED_PLACEMENT_INVOICE_TYPE) {
      const placementId = meta.placementId || meta.featuredPlacementId
      if (placementId) {
        const { rows: cancelled } = await client.query(
          `UPDATE supplier_featured_placements SET
             status = 'cancelled', payment_status = 'disputed', updated_at = now()
           WHERE id = $1
           RETURNING id, status, payment_status`,
          [placementId]
        )
        pauseResult = cancelled[0] || null
      }
    }

    const subscription = await getSubscriptionForBilling(invoice.tenant_id, 'SUPPLIER')
    if (subscription) {
      await recordBillingEvent(client, {
        subscriptionId: subscription.id,
        tenantId: invoice.tenant_id,
        tenantType: 'SUPPLIER',
        eventType: `${meta.type}.payment.disputed`,
        payload: {
          invoiceId: invoice.id,
          providerPaymentId,
          disputeId,
          reason,
          pauseResult,
        },
      })
    }

    return {
      handled: true,
      duplicate: false,
      invoiceId: invoice.id,
      type: meta.type,
      pauseResult,
    }
  })
}

/**
 * Admin ad-spend rollup from paid promotion-ad invoices (boost + featured).
 */
export async function getPromotionAdSpendSummary({ windowDays = 90 } = {}) {
  const { rows } = await query(
    `
    SELECT
      COALESCE(SUM(amount) FILTER (
        WHERE status = 'PAID'
          AND (metadata->>'type') = $2
          AND COALESCE(metadata->>'refunded', 'false') <> 'true'
      ), 0)::numeric AS boost_ad_spend,
      COALESCE(SUM(amount) FILTER (
        WHERE status = 'PAID'
          AND (metadata->>'type') = $3
          AND COALESCE(metadata->>'refunded', 'false') <> 'true'
      ), 0)::numeric AS featured_ad_spend,
      COALESCE(SUM(amount) FILTER (
        WHERE status = 'PAID'
          AND (metadata->>'type') IN ($2, $3)
          AND COALESCE(metadata->>'refunded', 'false') <> 'true'
      ), 0)::numeric AS total_ad_spend,
      COUNT(*) FILTER (
        WHERE status = 'OPEN' AND (metadata->>'type') IN ($2, $3)
      )::int AS open_ad_invoices,
      COUNT(*) FILTER (
        WHERE status = 'PAID'
          AND (metadata->>'type') IN ($2, $3)
          AND COALESCE(metadata->>'refunded', 'false') = 'true'
      )::int AS refunded_ad_invoices
    FROM billing_invoice
    WHERE tenant_type = 'SUPPLIER'
      AND (metadata->>'type') IN ($2, $3)
      AND COALESCE(paid_at, created_at) >= NOW() - ($1 || ' days')::interval
    `,
    [String(windowDays), DEAL_BOOST_INVOICE_TYPE, FEATURED_PLACEMENT_INVOICE_TYPE]
  )
  return (
    rows[0] || {
      boost_ad_spend: 0,
      featured_ad_spend: 0,
      total_ad_spend: 0,
      open_ad_invoices: 0,
      refunded_ad_invoices: 0,
    }
  )
}
