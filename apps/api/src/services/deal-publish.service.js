import { query, withTransaction } from '../lib/db.js'
import { config } from '../config/env.js'
import {
  DEAL_STATUSES,
  PAYMENT_STATUSES,
  resolveScheduledOrActive,
} from './deal-lifecycle.service.js'

const BOOST_PACKAGE_WHERE = `(package_type = 'boost' OR pricing_key LIKE 'boost_%')`

export async function loadActiveBoostPackage(pricingKey, dbQuery = query) {
  if (!pricingKey) return null
  const { rows } = await dbQuery(
    `
    SELECT * FROM promotion_pricing_config
    WHERE pricing_key = $1
      AND is_active = TRUE
      AND ${BOOST_PACKAGE_WHERE}
    `,
    [pricingKey]
  )
  return rows[0] || null
}

export function snapshotBoostFieldsFromPackage(pkg) {
  if (!pkg) return null
  return {
    boost_package_id: pkg.id,
    boost_pricing_key: pkg.pricing_key,
    boost_price_snapshot: Number(pkg.amount) || 0,
    boost_duration_days: pkg.duration_days != null ? Number(pkg.duration_days) : null,
  }
}

export function computeBoostWindow(deal, { now = new Date() } = {}) {
  const start = now instanceof Date ? now : new Date(now)
  const durationDays = Math.max(1, Number(deal.boost_duration_days) || 1)
  const end = new Date(start)
  end.setDate(end.getDate() + durationDays)
  return {
    boost_start_at: start.toISOString(),
    boost_end_at: end.toISOString(),
  }
}

export function isDealBoostLive(deal, now = new Date()) {
  if (!deal?.boost_start_at || !deal?.boost_end_at) return false
  const ts = now instanceof Date ? now : new Date(now)
  return new Date(deal.boost_start_at) <= ts && new Date(deal.boost_end_at) > ts
}

export function resolveStatusAfterBoostApproval(
  deal,
  { boostAmount = 0, waivePayment = true, now = new Date() } = {}
) {
  const paymentRequired = Number(boostAmount) > 0 && !waivePayment
  if (paymentRequired) {
    return {
      status: DEAL_STATUSES.APPROVED_PENDING_PAYMENT,
      payment_status: PAYMENT_STATUSES.PENDING,
    }
  }
  return resolveScheduledOrActive(deal, {
    payment_status: PAYMENT_STATUSES.NOT_REQUIRED,
    now,
  })
}

export function buildBoostApprovalPreview(deal, { now = new Date() } = {}) {
  const window = computeBoostWindow(deal, { now })
  return {
    packageKey: deal.boost_pricing_key,
    priceSnapshot: deal.boost_price_snapshot,
    durationDays: deal.boost_duration_days,
    boostStartAt: window.boost_start_at,
    boostEndAt: window.boost_end_at,
  }
}

/**
 * Apply supplier-selected boost package to a draft/rejected deal (submit for review).
 */
export async function applyBoostSelectionToDeal(dealId, supplierId, pricingKey, dbQuery = query) {
  const pkg = await loadActiveBoostPackage(pricingKey, dbQuery)
  if (!pkg) {
    throw new Error('Boost package is not available')
  }
  const snap = snapshotBoostFieldsFromPackage(pkg)
  const { rows } = await dbQuery(
    `
    UPDATE promotions SET
      boost_package_id = $3,
      boost_pricing_key = $4,
      boost_price_snapshot = $5,
      boost_duration_days = $6,
      boost_start_at = NULL,
      boost_end_at = NULL,
      updated_at = NOW()
    WHERE id = $1 AND supplier_id = $2
    RETURNING *
    `,
    [
      dealId,
      supplierId,
      snap.boost_package_id,
      snap.boost_pricing_key,
      snap.boost_price_snapshot,
      snap.boost_duration_days,
    ]
  )
  if (!rows.length) throw new Error('Deal not found')
  return { deal: rows[0], package: pkg }
}

/**
 * Activate boost campaign after admin approval (or payment confirmation).
 */
export async function publishDealAfterApproval(
  deal,
  { targetAudience = { all: true }, waivePayment = true } = {}
) {
  if (!deal.boost_pricing_key && !deal.boost_package_id) {
    throw new Error('Deal has no boost package selected')
  }

  const now = new Date()
  const window = computeBoostWindow(deal, { now })
  const budget = Number(deal.boost_price_snapshot) || 0
  const billingStatus = waivePayment ? 'waived' : 'pending'
  const campaignStatus = waivePayment ? 'active' : 'draft'

  return withTransaction(async (client) => {
    const { rows: pkgRows } = await client.query(
      `SELECT * FROM promotion_pricing_config WHERE id = $1 OR pricing_key = $2 LIMIT 1`,
      [deal.boost_package_id, deal.boost_pricing_key]
    )
    const pkg = pkgRows[0] || null

    const { rows: campaignRows } = await client.query(
      `
      INSERT INTO deal_promotions (
        deal_id, supplier_id, budget, starts_at, ends_at, target_audience,
        billing_type, billing_status, status,
        pricing_package_id, pricing_key, price_paid, duration_days, package_display_name
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
      `,
      [
        deal.id,
        deal.supplier_id,
        budget,
        window.boost_start_at,
        window.boost_end_at,
        JSON.stringify(targetAudience),
        pkg?.billing_type || 'flat_fee',
        billingStatus,
        campaignStatus,
        deal.boost_package_id || pkg?.id || null,
        deal.boost_pricing_key,
        budget,
        deal.boost_duration_days,
        pkg?.display_name || null,
      ]
    )

    const { rows: updatedDealRows } = await client.query(
      `
      UPDATE promotions SET
        boost_start_at = $2,
        boost_end_at = $3,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [deal.id, window.boost_start_at, window.boost_end_at]
    )

    return {
      deal: updatedDealRows[0],
      campaign: campaignRows[0],
      boostWindow: window,
    }
  })
}

export function isBoostPaymentWaived() {
  return (
    config.NODE_ENV !== 'production' || process.env.ALLOW_WAIVE_DEAL_PROMOTION_PAYMENT === 'true'
  )
}
