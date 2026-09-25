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
 * Purchase featured placement. A purchase can become paid/waived, but it always
 * remains pending until a platform admin approves it. The paid placement period
 * starts at approval time so review latency never consumes the supplier's term.
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
    const status = 'pending'
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
      return { ...placement, approvalRequired: true }
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
           status = 'pending', payment_status = 'paid', updated_at = now()
         WHERE id = $1 RETURNING *`,
        [result.id]
      )
      return { ...rows[0], approvalRequired: true }
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
  if (placement.status === 'cancelled' || placement.status === 'expired') {
    throw new ValidationError('Featured placement can no longer be paid')
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
       status = 'pending', payment_status = 'paid', billing_invoice_id = $2, updated_at = now()
     WHERE id = $1 RETURNING *`,
    [placementId, invoiceId]
  )
  return {
    placement: { ...activated[0], approvalRequired: true },
    duplicate: false,
  }
}

export async function approveFeaturedPlacement({ placementId, approvedBy }) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT fp.*, COALESCE(pc.duration_days, 7) AS package_duration_days
       FROM supplier_featured_placements fp
       LEFT JOIN promotion_pricing_config pc ON pc.pricing_key = fp.pricing_key
       WHERE fp.id = $1
       FOR UPDATE`,
      [placementId]
    )
    const placement = rows[0]
    if (!placement) throw new NotFoundError('Featured placement not found')
    if (placement.status === 'active') return { placement, duplicate: true }
    if (placement.status !== 'pending') {
      throw new ValidationError('Only pending featured placements can be approved')
    }
    if (!['paid', 'waived'].includes(placement.payment_status)) {
      throw new ValidationError('Featured placement must be paid before approval')
    }

    const startsAt = new Date()
    const endsAt = new Date(startsAt)
    endsAt.setDate(endsAt.getDate() + Number(placement.package_duration_days || 7))
    const { rows: approved } = await client.query(
      `UPDATE supplier_featured_placements
       SET status = 'active', starts_at = $2, ends_at = $3,
           approved_by = $4, approved_at = now(), rejection_reason = NULL, updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [placementId, startsAt.toISOString(), endsAt.toISOString(), approvedBy]
    )
    return { placement: approved[0], duplicate: false }
  })
}

export async function rejectFeaturedPlacement({ placementId, rejectedBy, reason = null }) {
  const { rows: existing } = await query(
    `SELECT * FROM supplier_featured_placements WHERE id = $1`,
    [placementId]
  )
  if (!existing.length) throw new NotFoundError('Featured placement not found')
  const placement = existing[0]
  if (placement.status !== 'pending') {
    throw new ValidationError('Only pending featured placements can be rejected')
  }

  if (placement.payment_status === 'paid') {
    if (!placement.billing_invoice_id) {
      throw new ValidationError('Paid featured placement has no invoice to refund')
    }
    await markPromotionAdInvoiceRefunded({
      invoiceId: placement.billing_invoice_id,
      supplierId: placement.supplier_id,
      reason: 'admin_rejection',
    })
  }

  const { rows } = await query(
    `UPDATE supplier_featured_placements
     SET status = 'cancelled', rejected_by = $2, rejected_at = now(),
         rejection_reason = $3,
         payment_status = CASE WHEN payment_status = 'paid' THEN 'refunded' ELSE payment_status END,
         updated_at = now()
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [placementId, rejectedBy, reason]
  )
  if (!rows.length) {
    throw new ValidationError('Featured placement changed while it was being reviewed')
  }
  return { placement: rows[0] }
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

export async function listFeaturedPlacementsForAdmin() {
  const { rows } = await query(
    `
    SELECT fp.*, s.name AS supplier_name
    FROM supplier_featured_placements fp
    JOIN supplier s ON s.id = fp.supplier_id
    WHERE fp.status = 'pending'
       OR (fp.status = 'active' AND fp.ends_at > NOW())
    ORDER BY CASE WHEN fp.status = 'pending' THEN 0 ELSE 1 END, fp.created_at DESC
    LIMIT 100
    `
  )
  return rows
}

// Compatibility for split supplier route modules that still import the legacy name.
export const listAllActivePlacementsForAdmin = listFeaturedPlacementsForAdmin
