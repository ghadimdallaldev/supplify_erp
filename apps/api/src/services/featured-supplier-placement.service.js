import { query, withTransaction } from '../lib/db.js'
import { ValidationError, NotFoundError, PromotionAdError } from '../middlewares/errorHandler.js'
import {
  createFeaturedPlacementInvoice,
  chargePromotionAdInvoice,
  FEATURED_PLACEMENT_INVOICE_TYPE,
  isPromotionAdPaymentWaived,
  markPromotionAdInvoiceRefunded,
} from '../lib/billing/promotion-ad-billing.js'

export async function listFeaturedPackages() {
  const { rows } = await query(
    `
    SELECT * FROM promotion_pricing_config
    WHERE is_active = TRUE
      AND (package_type = 'featured_listing' OR pricing_key LIKE 'featured_supplier_%')
    ORDER BY amount ASC
    `
  )
  return rows
}

export async function listActiveFeaturedSupplierIds() {
  const { rows } = await query(
    `
    SELECT DISTINCT supplier_id
    FROM supplier_featured_placements
    WHERE status = 'active'
      AND starts_at <= NOW()
      AND ends_at > NOW()
    `
  )
  return rows.map((r) => r.supplier_id)
}

/**
 * Purchase featured placement. In live/payments mode: creates pending + invoice,
 * optionally charges immediately when a payment method exists.
 * Dev/non-live: may waive and activate immediately.
 */
export async function purchaseAndActivateFeaturedPlacement({
  supplierId,
  pricingKey,
  createdBy,
  waivePayment = null,
  paymentMethodId = null,
  idempotencyKey = null,
  chargeNow = true,
}) {
  const waive = waivePayment == null ? isPromotionAdPaymentWaived() : waivePayment !== false

  return withTransaction(async (client) => {
    const { rows: pricingRows } = await client.query(
      `SELECT * FROM promotion_pricing_config WHERE pricing_key = $1 AND is_active = TRUE`,
      [pricingKey]
    )
    const pricing = pricingRows[0]
    if (!pricing) throw new ValidationError('Featured placement package is not available')

    const startsAt = new Date()
    const endsAt = new Date(startsAt)
    endsAt.setDate(endsAt.getDate() + (pricing.duration_days || 7))
    const amount = parseFloat(pricing.amount) || 0
    const status = waive ? 'active' : 'pending'
    const paymentStatus = waive ? 'waived' : 'pending'

    const { rows } = await client.query(
      `
      INSERT INTO supplier_featured_placements (
        supplier_id, pricing_key, status, starts_at, ends_at,
        amount_paid, payment_status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
      `,
      [
        supplierId,
        pricingKey,
        status,
        startsAt.toISOString(),
        endsAt.toISOString(),
        amount,
        paymentStatus,
        createdBy,
      ]
    )
    let placement = rows[0]

    if (waive || !(amount > 0)) {
      return placement
    }

    const { invoice } = await createFeaturedPlacementInvoice({
      placement,
      pricing,
      client,
    })
    const { rows: withInv } = await client.query(
      `SELECT * FROM supplier_featured_placements WHERE id = $1`,
      [placement.id]
    )
    placement = withInv[0] || { ...placement, billing_invoice_id: invoice.id }

    return {
      ...placement,
      _invoice: invoice,
      _chargeNow: chargeNow,
      _paymentMethodId: paymentMethodId,
      _idempotencyKey: idempotencyKey,
    }
  }).then(async (result) => {
    if (!result?._invoice || !result._chargeNow) {
      const { _invoice, _chargeNow, _paymentMethodId, _idempotencyKey, ...placement } = result || {}
      return placement
    }
    try {
      await chargePromotionAdInvoice({
        invoiceId: result._invoice.id,
        supplierId,
        paymentMethodId: result._paymentMethodId,
        idempotencyKey:
          result._idempotencyKey || `featured-placement:${result.id}:${result.amount_paid}`,
        expectedType: FEATURED_PLACEMENT_INVOICE_TYPE,
      })
      const { rows } = await query(
        `UPDATE supplier_featured_placements SET
           status = 'active', payment_status = 'paid', updated_at = now()
         WHERE id = $1 RETURNING *`,
        [result.id]
      )
      return rows[0]
    } catch (err) {
      if (err instanceof PromotionAdError && err.code === 'PROMOTION_AD_PAYMENT_REQUIRED') {
        const { _invoice, _chargeNow, _paymentMethodId, _idempotencyKey, ...placement } = result
        return { ...placement, paymentRequired: true, invoiceId: result._invoice.id }
      }
      throw err
    }
  })
}

export async function payFeaturedPlacement({
  placementId,
  supplierId,
  paymentMethodId = null,
  idempotencyKey = null,
}) {
  const { rows } = await query(
    `SELECT * FROM supplier_featured_placements WHERE id = $1 AND supplier_id = $2`,
    [placementId, supplierId]
  )
  if (!rows.length) throw new NotFoundError('Featured placement not found')
  const placement = rows[0]
  if (placement.status === 'active' && placement.payment_status === 'paid') {
    return { placement, duplicate: true }
  }
  if (placement.payment_status === 'waived') {
    return { placement, duplicate: true }
  }

  let invoiceId = placement.billing_invoice_id
  if (!invoiceId) {
    const { rows: pricingRows } = await query(
      `SELECT * FROM promotion_pricing_config WHERE pricing_key = $1`,
      [placement.pricing_key]
    )
    const created = await createFeaturedPlacementInvoice({
      placement,
      pricing: pricingRows[0] || { amount: placement.amount_paid },
    })
    invoiceId = created.invoice.id
  }

  await chargePromotionAdInvoice({
    invoiceId,
    supplierId,
    paymentMethodId,
    idempotencyKey: idempotencyKey || `featured-placement:${placementId}:${placement.amount_paid}`,
    expectedType: FEATURED_PLACEMENT_INVOICE_TYPE,
  })

  const { rows: activated } = await query(
    `UPDATE supplier_featured_placements SET
       status = 'active', payment_status = 'paid', billing_invoice_id = $2, updated_at = now()
     WHERE id = $1 RETURNING *`,
    [placementId, invoiceId]
  )
  return { placement: activated[0], duplicate: false }
}

export async function refundFeaturedPlacement({
  placementId,
  amount = null,
  reason = 'admin_refund',
}) {
  const { rows } = await query(`SELECT * FROM supplier_featured_placements WHERE id = $1`, [
    placementId,
  ])
  if (!rows.length) throw new NotFoundError('Featured placement not found')
  const placement = rows[0]
  if (!placement.billing_invoice_id) {
    throw new ValidationError('Placement has no invoice to refund')
  }
  const refund = await markPromotionAdInvoiceRefunded({
    invoiceId: placement.billing_invoice_id,
    supplierId: placement.supplier_id,
    amount,
    reason,
  })
  const { rows: cancelled } = await query(
    `UPDATE supplier_featured_placements SET
       status = 'cancelled', payment_status = 'refunded', updated_at = now()
     WHERE id = $1 RETURNING *`,
    [placementId]
  )
  return { placement: cancelled[0], refund }
}

export async function listPlacementsForSupplier(supplierId) {
  const { rows } = await query(
    `SELECT * FROM supplier_featured_placements WHERE supplier_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [supplierId]
  )
  return rows
}

export async function listAllActivePlacementsForAdmin() {
  const { rows } = await query(
    `
    SELECT fp.*, s.name AS supplier_name
    FROM supplier_featured_placements fp
    JOIN supplier s ON s.id = fp.supplier_id
    WHERE fp.status = 'active' AND fp.ends_at > NOW()
    ORDER BY fp.starts_at DESC
    LIMIT 100
    `
  )
  return rows
}
