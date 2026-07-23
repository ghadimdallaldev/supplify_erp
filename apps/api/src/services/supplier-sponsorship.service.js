/**
 * Supplier-paid sponsorship domain service.
 * Lifecycle: offered → accepted → payment_pending → scheduled|active → completed
 * Supplier charge uses sponsorship-billing (billing_invoice); never activates on accept alone.
 */
import { query, withTransaction } from '../lib/db.js'
import { NotFoundError, SponsorshipError } from '../middlewares/errorHandler.js'
import { getReferralProgramConfig } from '../lib/platform-settings.js'
import { getSubscriptionForBilling } from '../lib/billing/billing-service.js'
import {
  createSupplierSponsorshipInvoice,
  chargeSupplierSponsorshipInvoice,
  markSponsorshipInvoicePaidManual,
  voidSponsorshipInvoice,
  markSponsorshipInvoiceRefunded,
  getSponsorshipInvoice,
} from '../lib/billing/sponsorship-billing.js'
import { notifyTenantUsers } from './notification/in-app.js'
import { writeAuditLog } from '../lib/audit.js'
import { assertSupplierActiveCustomerLocationCapacity } from '../lib/subscription.js'
import { resolveOrgBillingTenantId } from '../lib/org-billing-tenant.js'

const LIVE_STATUSES = [
  'offered',
  'accepted',
  'payment_pending',
  'payment_failed',
  'scheduled',
  'active',
]

const CANCELABLE_BEFORE_PAY = ['offered', 'accepted', 'payment_pending', 'payment_failed']

function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function calendarYearResetDate() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1))
}

async function getSupplierPlanCode(supplierId) {
  const sub = await getSubscriptionForBilling(supplierId, 'SUPPLIER')
  return (sub?.plan_code || 'free').toLowerCase()
}

async function countSponsorshipsThisYear(supplierId, client = null) {
  const db = client || { query }
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS c FROM supplier_sponsorship
     WHERE supplier_id = $1
       AND created_at >= date_trunc('year', now())
       AND status NOT IN ('cancelled', 'expired', 'draft')`,
    [supplierId]
  )
  return rows[0]?.c ?? 0
}

export async function getSponsorshipUsage(supplierId) {
  const limit = await getSponsorshipLimitForSupplier(supplierId)
  const used = await countSponsorshipsThisYear(supplierId)
  const unlimited = limit === null
  return {
    used,
    remaining: unlimited ? null : Math.max(0, limit - used),
    limit,
    resetDate: calendarYearResetDate().toISOString(),
    unlimited,
  }
}

export async function getSponsorshipLimitForSupplier(supplierId) {
  const config = await getReferralProgramConfig()
  if (config.sponsorshipEnabled === false) return 0
  const planCode = await getSupplierPlanCode(supplierId)
  const limits = config.sponsorshipLimitsPerYear || {}
  const limit = limits[planCode]
  if (limit === null || (limit === undefined && planCode === 'enterprise')) return null
  if (limit === undefined) return 0
  return Number(limit)
}

async function loadSponsorship(id, { forUpdate = false, client = null } = {}) {
  const db = client || { query }
  const lock = forUpdate ? ' FOR UPDATE' : ''
  const { rows } = await db.query(`SELECT * FROM supplier_sponsorship WHERE id = $1${lock}`, [id])
  return rows[0] || null
}

async function audit(req, action, entityId, metadata = {}) {
  if (!req) return
  await writeAuditLog(req, {
    action,
    entityType: 'supplier_sponsorship',
    entityId,
    metadata,
  }).catch(() => {})
}

/**
 * Build immutable pricing snapshot for a restaurant plan (monthly only).
 */
export async function buildPricingSnapshot(planId, { billingInterval = 'MONTHLY' } = {}) {
  if (billingInterval !== 'MONTHLY') {
    throw new SponsorshipError(
      'SPONSORSHIP_PLAN_NOT_ELIGIBLE',
      'Only monthly billing intervals can be sponsored',
      { statusCode: 400 }
    )
  }
  const { rows } = await query(
    `SELECT id, code, name, price_per_month, price_per_year, tenant_type, is_active
     FROM subscription_plan WHERE id = $1`,
    [planId]
  )
  const plan = rows[0]
  if (!plan || plan.tenant_type !== 'RESTAURANT' || !plan.is_active) {
    throw new SponsorshipError(
      'SPONSORSHIP_PLAN_NOT_ELIGIBLE',
      'Restaurant plan not found or inactive',
      { statusCode: 400 }
    )
  }
  const config = await getReferralProgramConfig()
  const eligible = (config.eligibleSponsorPlans || []).map((p) => String(p).toLowerCase())
  if (!eligible.includes(String(plan.code).toLowerCase())) {
    throw new SponsorshipError(
      'SPONSORSHIP_PLAN_NOT_ELIGIBLE',
      `Plan ${plan.code} is not eligible for sponsorship`,
      { statusCode: 400 }
    )
  }
  const baseAmount = Number(plan.price_per_month) || 0
  if (!(baseAmount > 0)) {
    throw new SponsorshipError('SPONSORSHIP_PLAN_NOT_ELIGIBLE', 'Plan has no monthly price', {
      statusCode: 400,
    })
  }
  const maxAmount = config.maxSponsoredAmount
  if (maxAmount != null && Number(maxAmount) > 0 && baseAmount > Number(maxAmount)) {
    throw new SponsorshipError(
      'SPONSORSHIP_PLAN_NOT_ELIGIBLE',
      `Sponsored amount exceeds configured maximum (${maxAmount})`,
      { statusCode: 400 }
    )
  }
  const taxAmount = 0
  const discountAmount = 0
  const finalSponsoredAmount = Math.round((baseAmount + taxAmount - discountAmount) * 100) / 100
  return {
    planId: plan.id,
    planCode: plan.code,
    planName: plan.name,
    billingInterval: 'MONTHLY',
    baseAmount,
    discountAmount,
    taxAmount,
    currency: 'USD',
    finalSponsoredAmount,
    pricingVersion: `plan:${plan.id}:monthly`,
    pricingSource: 'subscription_plan.price_per_month',
    createdAt: new Date().toISOString(),
  }
}

export async function canCreateSponsorship(
  supplierId,
  { prospectId = null, restaurantId = null } = {}
) {
  const config = await getReferralProgramConfig()
  const reasons = []
  if (config.sponsorshipEnabled === false) {
    reasons.push('sponsorship_disabled')
  }
  const usage = await getSponsorshipUsage(supplierId)
  if (!usage.unlimited && usage.remaining <= 0) {
    reasons.push('limit_reached')
  }
  const supplierSub = await getSubscriptionForBilling(supplierId, 'SUPPLIER')
  if (!supplierSub || ['CANCELLED', 'SUSPENDED'].includes(supplierSub.status)) {
    reasons.push('supplier_not_billing_eligible')
  }
  try {
    await assertSupplierActiveCustomerLocationCapacity(supplierId, {
      action: 'growth.sponsor',
    })
  } catch (err) {
    if (err.name === 'LimitExceededError' || err.code === 'LIMIT_EXCEEDED') {
      reasons.push('customer_location_limit')
    } else throw err
  }

  let prospect = null
  if (prospectId) {
    const { rows } = await query(
      `SELECT * FROM supplier_customer_prospect WHERE id = $1 AND supplier_id = $2`,
      [prospectId, supplierId]
    )
    prospect = rows[0] || null
    if (!prospect) reasons.push('prospect_not_found')
  }

  const resolvedRestaurantId = restaurantId || prospect?.matched_restaurant_id || null
  if (resolvedRestaurantId) {
    if (resolvedRestaurantId === supplierId) reasons.push('same_tenant')
    const { rows: live } = await query(
      `SELECT id FROM supplier_sponsorship
       WHERE restaurant_id = $1 AND status = ANY($2::text[])
       LIMIT 1`,
      [resolvedRestaurantId, LIVE_STATUSES]
    )
    if (live.length) reasons.push('already_sponsored')
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    usage,
    eligibleSponsorPlans: config.eligibleSponsorPlans || [],
    offerExpiryDays: config.offerExpiryDays ?? 14,
    prospect,
    restaurantId: resolvedRestaurantId,
  }
}

export async function quoteSponsorship(supplierId, { planId, prospectId = null }) {
  const eligibility = await canCreateSponsorship(supplierId, { prospectId })
  if (!eligibility.eligible) {
    const code = eligibility.reasons.includes('limit_reached')
      ? 'SPONSORSHIP_LIMIT_REACHED'
      : eligibility.reasons.includes('customer_location_limit')
        ? 'CUSTOMER_LOCATION_LIMIT_REACHED'
        : 'SPONSORSHIP_NOT_ELIGIBLE'
    throw new SponsorshipError(code, `Not eligible to sponsor: ${eligibility.reasons.join(', ')}`, {
      statusCode: 403,
      details: eligibility,
    })
  }
  const snapshot = await buildPricingSnapshot(planId)
  return {
    snapshot,
    usage: eligibility.usage,
    disclosure:
      'You are sponsoring one month of the restaurant’s selected Supplify plan. This is a one-time payment and will not renew automatically. Future subscription charges will be paid by the restaurant.',
  }
}

export async function createSponsorshipOffer(
  supplierId,
  {
    prospectId,
    restaurantId = null,
    invitationId = null,
    suggestedPlanId = null,
    idempotencyKey = null,
    offeredByUserId = null,
    req = null,
  } = {}
) {
  const eligibility = await canCreateSponsorship(supplierId, { prospectId, restaurantId })
  if (!eligibility.eligible) {
    const code = eligibility.reasons.includes('limit_reached')
      ? 'SPONSORSHIP_LIMIT_REACHED'
      : eligibility.reasons.includes('already_sponsored')
        ? 'SPONSORSHIP_ALREADY_EXISTS'
        : eligibility.reasons.includes('customer_location_limit')
          ? 'CUSTOMER_LOCATION_LIMIT_REACHED'
          : 'SPONSORSHIP_NOT_ELIGIBLE'
    throw new SponsorshipError(
      code,
      `Cannot create sponsorship: ${eligibility.reasons.join(', ')}`,
      {
        statusCode: code === 'SPONSORSHIP_ALREADY_EXISTS' ? 409 : 403,
        details: eligibility,
      }
    )
  }

  if (idempotencyKey) {
    const { rows: existing } = await query(
      `SELECT * FROM supplier_sponsorship WHERE supplier_id = $1 AND idempotency_key = $2`,
      [supplierId, idempotencyKey]
    )
    if (existing[0]) return { sponsorship: existing[0], duplicate: true }
  }

  const config = await getReferralProgramConfig()
  const prospect = eligibility.prospect
  const resolvedRestaurantId = eligibility.restaurantId
  const offerExpiresAt = addDays(new Date(), config.offerExpiryDays ?? 14)

  let planCode = 'silver'
  if (suggestedPlanId) {
    const snap = await buildPricingSnapshot(suggestedPlanId)
    planCode = snap.planCode
  } else if ((config.eligibleSponsorPlans || []).length) {
    planCode = config.eligibleSponsorPlans[0]
  }

  const result = await withTransaction(async (client) => {
    const { rows: attrRows } = await client.query(
      `INSERT INTO supplier_referral_attribution (
         supplier_id, prospect_id, restaurant_id, invitation_id, attribution_type,
         referral_expires_at, first_paid_discount_percent
       )
       VALUES ($1, $2, $3, $4, 'sponsor', $5, $6)
       RETURNING id`,
      [
        supplierId,
        prospectId || null,
        resolvedRestaurantId,
        invitationId,
        addDays(new Date(), config.referralValidityDays || 90),
        config.firstPaidDiscountPercent ?? 20,
      ]
    )

    const { rows: sponsorRows } = await client.query(
      `INSERT INTO supplier_sponsorship (
         supplier_id, prospect_id, restaurant_id, attribution_id, invitation_id,
         plan_code, selected_plan_id, billing_interval, status,
         offered_by_user_id, offer_expires_at, idempotency_key,
         discount_behavior, payer_type
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'MONTHLY', 'offered', $8, $9, $10, $11, 'supplier')
       RETURNING *`,
      [
        supplierId,
        prospectId || null,
        resolvedRestaurantId,
        attrRows[0].id,
        invitationId,
        planCode,
        suggestedPlanId,
        offeredByUserId,
        offerExpiresAt,
        idempotencyKey,
        config.referralDiscountAppliesTo || 'first_restaurant_funded',
      ]
    )

    if (prospectId) {
      await client.query(`UPDATE supplier_customer_prospect SET updated_at = now() WHERE id = $1`, [
        prospectId,
      ])
    }

    return { sponsorship: sponsorRows[0], attributionId: attrRows[0].id }
  })

  if (resolvedRestaurantId) {
    await notifyTenantUsers({
      tenantId: resolvedRestaurantId,
      tenantType: 'RESTAURANT',
      notificationType: 'sponsorship_offer_received',
      notificationCategory: 'sponsorship_gift_received',
      title: 'Sponsorship offer from your supplier',
      message:
        'A supplier offered to pay for your first month after your free trial. Review and accept the offer.',
      metadata: {
        supplierId,
        sponsorshipId: result.sponsorship.id,
        ctaUrl: '/app/suppliers',
      },
    }).catch(() => {})
  }

  await audit(req, 'growth.sponsorship.offer_created', result.sponsorship.id, {
    prospectId,
    restaurantId: resolvedRestaurantId,
  })

  return { ...result, duplicate: false }
}

/**
 * Compat shim: old POST …/sponsor creates an offer (no immediate gift activation).
 */
export async function sponsorProspect(supplierId, prospectId, { planCode, req = null } = {}) {
  const { rows: planRows } = await query(
    `SELECT id FROM subscription_plan
     WHERE lower(code) = $1 AND tenant_type = 'RESTAURANT' AND is_active = true LIMIT 1`,
    [String(planCode || '').toLowerCase()]
  )
  if (!planRows.length) {
    throw new SponsorshipError('SPONSORSHIP_PLAN_NOT_ELIGIBLE', 'Restaurant plan not found', {
      statusCode: 400,
    })
  }
  return createSponsorshipOffer(supplierId, {
    prospectId,
    suggestedPlanId: planRows[0].id,
    offeredByUserId: req?.userData?.id || null,
    req,
  })
}

export async function listSupplierSponsorships(
  supplierId,
  { limit = 50, offset = 0, status = null } = {}
) {
  const params = [supplierId]
  let where = 'ss.supplier_id = $1'
  if (status) {
    params.push(status)
    where += ` AND ss.status = $${params.length}`
  }
  const limitIdx = params.length + 1
  const offsetIdx = params.length + 2
  params.push(Math.min(limit, 200), offset)
  const { rows } = await query(
    `SELECT ss.*, sp.name AS selected_plan_name, p.restaurant_name AS prospect_name
     FROM supplier_sponsorship ss
     LEFT JOIN subscription_plan sp ON sp.id = ss.selected_plan_id
     LEFT JOIN supplier_customer_prospect p ON p.id = ss.prospect_id
     WHERE ${where}
     ORDER BY ss.created_at DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  )
  const countParams = status ? [supplierId, status] : [supplierId]
  const countWhere = status ? 'supplier_id = $1 AND status = $2' : 'supplier_id = $1'
  const { rows: countRows } = await query(
    `SELECT COUNT(*)::int AS c FROM supplier_sponsorship WHERE ${countWhere}`,
    countParams
  )
  return { sponsorships: rows, total: countRows[0]?.c ?? 0 }
}

export async function getSupplierSponsorship(supplierId, sponsorshipId) {
  const { rows } = await query(
    `SELECT ss.*, sp.name AS selected_plan_name, sp.price_per_month
     FROM supplier_sponsorship ss
     LEFT JOIN subscription_plan sp ON sp.id = ss.selected_plan_id
     WHERE ss.id = $1 AND ss.supplier_id = $2`,
    [sponsorshipId, supplierId]
  )
  if (!rows[0]) throw new NotFoundError('Sponsorship not found')
  return rows[0]
}

export async function listRestaurantSponsorshipOffers(restaurantId) {
  const { rows } = await query(
    `SELECT ss.*, s.name AS supplier_name, sp.name AS selected_plan_name, sp.price_per_month,
            sp.code AS selected_plan_code
     FROM supplier_sponsorship ss
     JOIN supplier s ON s.id = ss.supplier_id
     LEFT JOIN subscription_plan sp ON sp.id = ss.selected_plan_id
     WHERE ss.restaurant_id = $1
       AND ss.status IN ('offered', 'accepted', 'payment_pending', 'payment_failed', 'scheduled', 'active', 'completed')
     ORDER BY ss.created_at DESC`,
    [restaurantId]
  )
  return { offers: rows }
}

export async function getRestaurantSponsorshipOffer(restaurantId, sponsorshipId) {
  const { rows } = await query(
    `SELECT ss.*, s.name AS supplier_name, sp.name AS selected_plan_name, sp.price_per_month,
            sp.code AS selected_plan_code
     FROM supplier_sponsorship ss
     JOIN supplier s ON s.id = ss.supplier_id
     LEFT JOIN subscription_plan sp ON sp.id = ss.selected_plan_id
     WHERE ss.id = $1 AND ss.restaurant_id = $2`,
    [sponsorshipId, restaurantId]
  )
  if (!rows[0]) throw new NotFoundError('Sponsorship offer not found')
  return rows[0]
}

/**
 * Restaurant selects plan and accepts. Creates pricing snapshot + supplier invoice → payment_pending.
 */
export async function acceptSponsorship(
  restaurantId,
  sponsorshipId,
  { planId, acceptedByUserId = null, req = null } = {}
) {
  if (!planId) {
    throw new SponsorshipError('SPONSORSHIP_PLAN_NOT_ELIGIBLE', 'planId is required', {
      statusCode: 400,
    })
  }

  const snapshot = await buildPricingSnapshot(planId)
  const config = await getReferralProgramConfig()

  const result = await withTransaction(async (client) => {
    const sponsorship = await loadSponsorship(sponsorshipId, { forUpdate: true, client })
    if (!sponsorship || sponsorship.restaurant_id !== restaurantId) {
      throw new NotFoundError('Sponsorship offer not found')
    }
    if (sponsorship.status === 'accepted' || sponsorship.status === 'payment_pending') {
      if (sponsorship.selected_plan_id === planId && sponsorship.supplier_billing_invoice_id) {
        return { sponsorship, duplicate: true }
      }
    }
    if (sponsorship.status !== 'offered') {
      throw new SponsorshipError(
        'SPONSORSHIP_INVALID_STATE',
        `Cannot accept sponsorship in status ${sponsorship.status}`,
        { statusCode: 400 }
      )
    }
    if (sponsorship.offer_expires_at && new Date(sponsorship.offer_expires_at) < new Date()) {
      await client.query(
        `UPDATE supplier_sponsorship SET status = 'expired', updated_at = now() WHERE id = $1`,
        [sponsorshipId]
      )
      throw new SponsorshipError(
        'SPONSORSHIP_OFFER_EXPIRED',
        'This sponsorship offer has expired',
        {
          statusCode: 400,
        }
      )
    }

    await client.query(
      `UPDATE supplier_sponsorship SET
         status = 'accepted',
         selected_plan_id = $2,
         plan_code = $3,
         pricing_snapshot = $4::jsonb,
         currency = $5,
         sponsored_amount = $6,
         tax_amount = $7,
         discount_behavior = $8,
         accepted_by_user_id = $9,
         accepted_at = now(),
         updated_at = now()
       WHERE id = $1`,
      [
        sponsorshipId,
        snapshot.planId,
        snapshot.planCode,
        JSON.stringify(snapshot),
        snapshot.currency,
        snapshot.finalSponsoredAmount,
        snapshot.taxAmount,
        config.referralDiscountAppliesTo || 'first_restaurant_funded',
        acceptedByUserId,
      ]
    )

    if (sponsorship.attribution_id) {
      await client.query(
        `UPDATE supplier_referral_attribution SET restaurant_id = $2, updated_at = now()
         WHERE id = $1 AND restaurant_id IS NULL`,
        [sponsorship.attribution_id, restaurantId]
      )
    }

    const { rows: updated } = await client.query(
      `SELECT * FROM supplier_sponsorship WHERE id = $1`,
      [sponsorshipId]
    )
    const { invoice } = await createSupplierSponsorshipInvoice({
      sponsorship: updated[0],
      snapshot,
      client,
    })

    await client.query(
      `UPDATE supplier_sponsorship SET status = 'payment_pending', updated_at = now() WHERE id = $1`,
      [sponsorshipId]
    )

    const { rows: finalRows } = await client.query(
      `SELECT * FROM supplier_sponsorship WHERE id = $1`,
      [sponsorshipId]
    )
    return { sponsorship: finalRows[0], invoice, duplicate: false }
  })

  await notifyTenantUsers({
    tenantId: result.sponsorship.supplier_id,
    tenantType: 'SUPPLIER',
    notificationType: 'sponsorship_accepted',
    notificationCategory: 'sponsorship_gift_received',
    title: 'Sponsorship accepted',
    message: 'A restaurant accepted your sponsorship offer. Pay the one-time invoice to continue.',
    metadata: {
      sponsorshipId,
      restaurantId,
      ctaUrl: '/app/customer-growth',
    },
  }).catch(() => {})

  await audit(req, 'growth.sponsorship.accepted', sponsorshipId, {
    restaurantId,
    planId,
    amount: snapshot.finalSponsoredAmount,
  })

  return result
}

export async function declineSponsorship(
  restaurantId,
  sponsorshipId,
  { reason = 'declined_by_restaurant', req = null } = {}
) {
  const result = await withTransaction(async (client) => {
    const sponsorship = await loadSponsorship(sponsorshipId, { forUpdate: true, client })
    if (!sponsorship || sponsorship.restaurant_id !== restaurantId) {
      throw new NotFoundError('Sponsorship offer not found')
    }
    if (sponsorship.status !== 'offered') {
      throw new SponsorshipError(
        'SPONSORSHIP_INVALID_STATE',
        `Cannot decline sponsorship in status ${sponsorship.status}`,
        { statusCode: 400 }
      )
    }
    await client.query(
      `UPDATE supplier_sponsorship SET
         status = 'cancelled', cancelled_at = now(), cancellation_reason = $2, updated_at = now()
       WHERE id = $1`,
      [sponsorshipId, reason]
    )
    const { rows } = await client.query(`SELECT * FROM supplier_sponsorship WHERE id = $1`, [
      sponsorshipId,
    ])
    return rows[0]
  })

  await notifyTenantUsers({
    tenantId: result.supplier_id,
    tenantType: 'SUPPLIER',
    notificationType: 'sponsorship_declined',
    notificationCategory: 'sponsorship_gift_received',
    title: 'Sponsorship declined',
    message: 'A restaurant declined your sponsorship offer.',
    metadata: { sponsorshipId, restaurantId },
  }).catch(() => {})

  await audit(req, 'growth.sponsorship.declined', sponsorshipId, { restaurantId, reason })
  return { sponsorship: result }
}

export async function cancelSponsorship(
  supplierId,
  sponsorshipId,
  { reason = 'cancelled_by_supplier', req = null } = {}
) {
  const result = await withTransaction(async (client) => {
    const sponsorship = await loadSponsorship(sponsorshipId, { forUpdate: true, client })
    if (!sponsorship || sponsorship.supplier_id !== supplierId) {
      throw new NotFoundError('Sponsorship not found')
    }
    if (!CANCELABLE_BEFORE_PAY.includes(sponsorship.status)) {
      if (['scheduled', 'active'].includes(sponsorship.status)) {
        throw new SponsorshipError(
          'SPONSORSHIP_INVALID_STATE',
          'Active or scheduled sponsorships cannot be cancelled; use admin refund/reversal',
          { statusCode: 400 }
        )
      }
      throw new SponsorshipError(
        'SPONSORSHIP_INVALID_STATE',
        `Cannot cancel sponsorship in status ${sponsorship.status}`,
        { statusCode: 400 }
      )
    }

    if (sponsorship.supplier_billing_invoice_id) {
      const inv = await getSponsorshipInvoice(sponsorship.supplier_billing_invoice_id, supplierId)
      if (inv?.status === 'PAID') {
        throw new SponsorshipError(
          'SPONSORSHIP_INVALID_STATE',
          'Invoice already paid; use refund workflow',
          { statusCode: 400 }
        )
      }
      if (inv && inv.status === 'OPEN') {
        await voidSponsorshipInvoice({
          invoiceId: inv.id,
          supplierId,
          reason,
        })
      }
    }

    await client.query(
      `UPDATE supplier_sponsorship SET
         status = 'cancelled', cancelled_at = now(), cancellation_reason = $2, updated_at = now()
       WHERE id = $1`,
      [sponsorshipId, reason]
    )
    const { rows } = await client.query(`SELECT * FROM supplier_sponsorship WHERE id = $1`, [
      sponsorshipId,
    ])
    return rows[0]
  })

  if (result.restaurant_id) {
    await notifyTenantUsers({
      tenantId: result.restaurant_id,
      tenantType: 'RESTAURANT',
      notificationType: 'sponsorship_cancelled',
      notificationCategory: 'sponsorship_gift_received',
      title: 'Sponsorship cancelled',
      message: 'The supplier cancelled the sponsorship offer.',
      metadata: { sponsorshipId },
    }).catch(() => {})
  }

  await audit(req, 'growth.sponsorship.cancelled', sponsorshipId, { reason })
  return { sponsorship: result }
}

/**
 * After payment confirmed: schedule if trial ongoing, else activate immediately.
 */
export async function confirmSupplierPayment(
  sponsorshipId,
  { providerPaymentRef = null, client = null } = {}
) {
  const run = async (db) => {
    const sponsorship = await loadSponsorship(sponsorshipId, { forUpdate: true, client: db })
    if (!sponsorship) throw new NotFoundError('Sponsorship not found')
    if (!['payment_pending', 'payment_failed'].includes(sponsorship.status)) {
      if (['scheduled', 'active'].includes(sponsorship.status)) {
        return { sponsorship, duplicate: true }
      }
      throw new SponsorshipError(
        'SPONSORSHIP_INVALID_STATE',
        `Cannot confirm payment in status ${sponsorship.status}`,
        { statusCode: 400 }
      )
    }

    const billingTenantId = sponsorship.restaurant_id
      ? await resolveOrgBillingTenantId(sponsorship.restaurant_id, 'RESTAURANT')
      : null
    const restaurantSub = billingTenantId
      ? await getSubscriptionForBilling(billingTenantId, 'RESTAURANT')
      : null

    const trialEndsAt = restaurantSub?.free_sandbox_expires_at
      ? new Date(restaurantSub.free_sandbox_expires_at)
      : null
    const now = new Date()
    const stillOnTrial =
      restaurantSub &&
      String(restaurantSub.plan_code || '').toLowerCase() === 'free' &&
      trialEndsAt &&
      trialEndsAt > now

    if (stillOnTrial) {
      await db.query(
        `UPDATE supplier_sponsorship SET
           status = 'scheduled',
           supplier_payment_status = 'paid',
           provider_payment_ref = COALESCE($2, provider_payment_ref),
           scheduled_activation_at = $3,
           updated_at = now()
         WHERE id = $1`,
        [sponsorshipId, providerPaymentRef, trialEndsAt]
      )
    } else {
      await db.query(
        `UPDATE supplier_sponsorship SET
           supplier_payment_status = 'paid',
           provider_payment_ref = COALESCE($2, provider_payment_ref),
           updated_at = now()
         WHERE id = $1`,
        [sponsorshipId, providerPaymentRef]
      )
      await activateSponsorship(sponsorshipId, { client: db })
      const { rows } = await db.query(`SELECT * FROM supplier_sponsorship WHERE id = $1`, [
        sponsorshipId,
      ])
      return { sponsorship: rows[0], duplicate: false }
    }

    const { rows } = await db.query(`SELECT * FROM supplier_sponsorship WHERE id = $1`, [
      sponsorshipId,
    ])
    if (rows[0]?.restaurant_id) {
      await notifyTenantUsers({
        tenantId: rows[0].restaurant_id,
        tenantType: 'RESTAURANT',
        notificationType: 'sponsorship_scheduled',
        notificationCategory: 'sponsorship_gift_received',
        title: 'Sponsored month scheduled',
        message:
          'Your supplier paid for your first month. It will start when your free trial ends.',
        metadata: { sponsorshipId, ctaUrl: '/app/suppliers' },
      }).catch(() => {})
    }
    return { sponsorship: rows[0], duplicate: false }
  }

  if (client) return run(client)
  return withTransaction(run)
}

export async function initiateSupplierPayment(
  supplierId,
  sponsorshipId,
  { paymentMethodId = null, idempotencyKey, provider = null, req = null } = {}
) {
  const sponsorship = await getSupplierSponsorship(supplierId, sponsorshipId)
  if (!['payment_pending', 'payment_failed'].includes(sponsorship.status)) {
    throw new SponsorshipError(
      'SPONSORSHIP_INVALID_STATE',
      `Cannot pay sponsorship in status ${sponsorship.status}`,
      { statusCode: 400 }
    )
  }
  if (!sponsorship.supplier_billing_invoice_id) {
    throw new SponsorshipError(
      'SPONSORSHIP_PAYMENT_REQUIRED',
      'No invoice exists for this sponsorship',
      { statusCode: 400 }
    )
  }

  const key = idempotencyKey || `sponsor_pay_${sponsorshipId}`
  try {
    const charge = await chargeSupplierSponsorshipInvoice({
      invoiceId: sponsorship.supplier_billing_invoice_id,
      supplierId,
      paymentMethodId,
      idempotencyKey: key,
      provider,
    })
    const confirmed = await confirmSupplierPayment(sponsorshipId, {
      providerPaymentRef: charge.providerPaymentId || null,
    })
    await audit(req, 'growth.sponsorship.payment_succeeded', sponsorshipId, {
      invoiceId: sponsorship.supplier_billing_invoice_id,
      amount: sponsorship.sponsored_amount,
    })
    return { ...confirmed, payment: charge.payment, invoice: charge.invoice }
  } catch (err) {
    if (err.code === 'SPONSORSHIP_PAYMENT_FAILED') {
      await query(
        `UPDATE supplier_sponsorship SET
           status = 'payment_failed',
           supplier_payment_status = 'failed',
           failure_code = $2,
           failure_reason = $3,
           updated_at = now()
         WHERE id = $1`,
        [sponsorshipId, err.details?.failureCode || 'charge_failed', err.message]
      )
      await audit(req, 'growth.sponsorship.payment_failed', sponsorshipId, {
        failure: err.message,
      })
    }
    throw err
  }
}

export async function retrySupplierPayment(supplierId, sponsorshipId, opts = {}) {
  const sponsorship = await getSupplierSponsorship(supplierId, sponsorshipId)
  if (sponsorship.status !== 'payment_failed' && sponsorship.status !== 'payment_pending') {
    throw new SponsorshipError(
      'SPONSORSHIP_INVALID_STATE',
      'Retry is only allowed for payment_pending or payment_failed',
      { statusCode: 400 }
    )
  }
  if (sponsorship.status === 'payment_failed') {
    await query(
      `UPDATE supplier_sponsorship SET status = 'payment_pending', updated_at = now() WHERE id = $1`,
      [sponsorshipId]
    )
  }
  const retryKey = opts.idempotencyKey || `sponsor_pay_retry_${sponsorshipId}_${Date.now()}`
  return initiateSupplierPayment(supplierId, sponsorshipId, {
    ...opts,
    idempotencyKey: retryKey,
  })
}

export async function activateSponsorship(sponsorshipId, { client = null } = {}) {
  const run = async (db) => {
    const sponsorship = await loadSponsorship(sponsorshipId, { forUpdate: true, client: db })
    if (!sponsorship) throw new NotFoundError('Sponsorship not found')
    if (sponsorship.status === 'active') return { sponsorship, duplicate: true }
    if (!['scheduled', 'payment_pending', 'accepted'].includes(sponsorship.status)) {
      if (sponsorship.supplier_payment_status !== 'paid' && sponsorship.status !== 'scheduled') {
        throw new SponsorshipError(
          'SPONSORSHIP_PAYMENT_REQUIRED',
          'Supplier payment must be confirmed before activation',
          { statusCode: 400 }
        )
      }
    }
    if (sponsorship.supplier_payment_status !== 'paid' && sponsorship.status !== 'scheduled') {
      const inv = sponsorship.supplier_billing_invoice_id
        ? await getSponsorshipInvoice(
            sponsorship.supplier_billing_invoice_id,
            sponsorship.supplier_id
          )
        : null
      if (!inv || inv.status !== 'PAID') {
        throw new SponsorshipError('SPONSORSHIP_PAYMENT_REQUIRED', 'Supplier invoice is not paid', {
          statusCode: 400,
        })
      }
    }

    const config = await getReferralProgramConfig()
    if (config.requireRestaurantPaymentMethodBeforeActivation) {
      const billingTenantId = await resolveOrgBillingTenantId(
        sponsorship.restaurant_id,
        'RESTAURANT'
      )
      const { rows: methods } = await db.query(
        `SELECT id FROM billing_payment_method
         WHERE tenant_id = $1 AND tenant_type = 'RESTAURANT' AND status = 'ACTIVE' LIMIT 1`,
        [billingTenantId]
      )
      if (!methods.length) {
        throw new SponsorshipError(
          'SPONSORSHIP_RESTAURANT_PAYMENT_METHOD_REQUIRED',
          'Restaurant must add a payment method before sponsored month activates',
          { statusCode: 400 }
        )
      }
    }

    const planId = sponsorship.selected_plan_id
    const { rows: planRows } = await db.query(`SELECT * FROM subscription_plan WHERE id = $1`, [
      planId,
    ])
    if (!planRows.length) {
      throw new SponsorshipError('SPONSORSHIP_PLAN_NOT_ELIGIBLE', 'Selected plan missing', {
        statusCode: 400,
      })
    }
    const plan = planRows[0]
    const periodStart = new Date()
    const periodEnd = addDays(periodStart, 30)
    const billingTenantId = await resolveOrgBillingTenantId(sponsorship.restaurant_id, 'RESTAURANT')

    const { rows: subRows } = await db.query(
      `SELECT id, plan_id FROM subscription
       WHERE tenant_id = $1 AND tenant_type = 'RESTAURANT' AND status NOT IN ('CANCELLED')
       ORDER BY created_at DESC LIMIT 1
       FOR UPDATE`,
      [billingTenantId]
    )
    if (!subRows.length) {
      throw new SponsorshipError('SPONSORSHIP_INVALID_STATE', 'Restaurant subscription not found', {
        statusCode: 400,
      })
    }

    const subscriptionId = subRows[0].id
    const fromPlanId = subRows[0].plan_id
    await db.query(
      `UPDATE subscription SET
         plan_id = $2, plan_name = $3, status = 'ACTIVE', billing_cycle = 'MONTHLY',
         current_period_start = $4, current_period_end = $5,
         next_billing_date = $5, auto_renew = true,
         account_locked_at = NULL, lock_reason = NULL,
         free_sandbox_expires_at = NULL, updated_at = now()
       WHERE id = $1`,
      [subscriptionId, plan.id, plan.name, periodStart, periodEnd]
    )
    try {
      await db.query(
        `INSERT INTO subscription_change_log (subscription_id, from_plan_id, to_plan_id, changed_by_admin_id, reason)
         VALUES ($1, $2, $3, NULL, $4)`,
        [subscriptionId, fromPlanId, plan.id, 'supplier_sponsorship']
      )
    } catch (e) {
      if (e.code !== '42P01') throw e
    }

    await db.query(
      `INSERT INTO supplier_follow (supplier_id, restaurant_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [sponsorship.supplier_id, sponsorship.restaurant_id]
    )

    if (sponsorship.prospect_id) {
      await db.query(
        `UPDATE supplier_customer_prospect SET lifecycle_status = 'sponsored', updated_at = now()
         WHERE id = $1`,
        [sponsorship.prospect_id]
      )
    }

    await db.query(
      `UPDATE supplier_sponsorship SET
         status = 'active',
         period_start = $2,
         period_end = $3,
         activated_at = now(),
         payer_type = 'supplier',
         updated_at = now()
       WHERE id = $1`,
      [sponsorshipId, periodStart, periodEnd]
    )

    // If configured to consume discount on sponsored cycle, mark used now
    if (
      (sponsorship.discount_behavior || config.referralDiscountAppliesTo) === 'sponsored_cycle' &&
      sponsorship.attribution_id
    ) {
      await db.query(
        `UPDATE supplier_referral_attribution SET first_paid_discount_used = true, updated_at = now()
         WHERE id = $1`,
        [sponsorship.attribution_id]
      )
    }

    const { rows } = await db.query(`SELECT * FROM supplier_sponsorship WHERE id = $1`, [
      sponsorshipId,
    ])
    return { sponsorship: rows[0], duplicate: false }
  }

  const out = client ? await run(client) : await withTransaction(run)
  if (!out.duplicate && out.sponsorship?.restaurant_id) {
    await notifyTenantUsers({
      tenantId: out.sponsorship.restaurant_id,
      tenantType: 'RESTAURANT',
      notificationType: 'sponsorship_activated',
      notificationCategory: 'sponsorship_gift_received',
      title: 'Sponsored month started',
      message: `Your supplier is paying for this month on the ${out.sponsorship.plan_code} plan.`,
      metadata: { sponsorshipId, ctaUrl: '/app/suppliers' },
    }).catch(() => {})
  }
  return out
}

/**
 * End sponsored period; hand billing responsibility to restaurant.
 * Does not lock the account if auto_renew can proceed — sets next_billing_date and payer restaurant.
 */
export async function completeSponsorship(sponsorshipId, { client = null } = {}) {
  const run = async (db) => {
    const sponsorship = await loadSponsorship(sponsorshipId, { forUpdate: true, client: db })
    if (!sponsorship) throw new NotFoundError('Sponsorship not found')
    if (sponsorship.status === 'completed') return { sponsorship, duplicate: true }
    if (sponsorship.status !== 'active') {
      throw new SponsorshipError(
        'SPONSORSHIP_INVALID_STATE',
        `Cannot complete sponsorship in status ${sponsorship.status}`,
        { statusCode: 400 }
      )
    }

    const billingTenantId = await resolveOrgBillingTenantId(sponsorship.restaurant_id, 'RESTAURANT')
    const { rows: methods } = await db.query(
      `SELECT id FROM billing_payment_method
       WHERE tenant_id = $1 AND tenant_type = 'RESTAURANT' AND status = 'ACTIVE' LIMIT 1`,
      [billingTenantId]
    )
    const hasPaymentMethod = methods.length > 0

    await db.query(
      `UPDATE supplier_sponsorship SET
         status = 'completed', completed_at = now(), payer_type = 'restaurant', updated_at = now()
       WHERE id = $1`,
      [sponsorshipId]
    )

    if (hasPaymentMethod) {
      await db.query(
        `UPDATE subscription SET
           next_billing_date = COALESCE(current_period_end, now()),
           auto_renew = true,
           updated_at = now()
         WHERE tenant_id = $1 AND tenant_type = 'RESTAURANT' AND status NOT IN ('CANCELLED')`,
        [billingTenantId]
      )
    } else {
      const { rows: freePlan } = await db.query(
        `SELECT id FROM subscription_plan WHERE lower(code) = 'free' AND tenant_type = 'RESTAURANT' LIMIT 1`
      )
      if (freePlan.length) {
        await db.query(
          `UPDATE subscription SET
             plan_id = $2, status = 'ACTIVE',
             lock_reason = 'payment_method_required',
             account_locked_at = now(),
             auto_renew = false,
             updated_at = now()
           WHERE tenant_id = $1 AND tenant_type = 'RESTAURANT' AND status NOT IN ('CANCELLED')`,
          [billingTenantId, freePlan[0].id]
        )
      }
    }

    if (sponsorship.prospect_id) {
      await db.query(
        `UPDATE supplier_customer_prospect SET lifecycle_status = 'converted', updated_at = now()
         WHERE id = $1 AND lifecycle_status = 'sponsored'`,
        [sponsorship.prospect_id]
      )
    }

    const { rows } = await db.query(`SELECT * FROM supplier_sponsorship WHERE id = $1`, [
      sponsorshipId,
    ])
    return { sponsorship: rows[0], hasPaymentMethod, duplicate: false }
  }

  const out = client ? await run(client) : await withTransaction(run)
  if (!out.duplicate && out.sponsorship?.restaurant_id) {
    await notifyTenantUsers({
      tenantId: out.sponsorship.restaurant_id,
      tenantType: 'RESTAURANT',
      notificationType: 'sponsorship_completed',
      notificationCategory: 'sponsorship_expired',
      title: 'Sponsored month ended',
      message: out.hasPaymentMethod
        ? 'Your sponsored month ended. Your subscription will renew on your payment method. Referral discount may apply to this first self-funded cycle.'
        : 'Your sponsored month ended. Add a payment method to continue on your selected plan.',
      metadata: {
        sponsorshipId,
        ctaUrl: '/app/settings',
      },
    }).catch(() => {})
  }
  return out
}

export async function adminMarkSponsorshipPaid(
  sponsorshipId,
  { adminUserId = null, reason = 'manual_approval', req = null } = {}
) {
  const sponsorship = await loadSponsorship(sponsorshipId)
  if (!sponsorship) throw new NotFoundError('Sponsorship not found')
  if (!sponsorship.supplier_billing_invoice_id) {
    throw new SponsorshipError('SPONSORSHIP_PAYMENT_REQUIRED', 'No invoice to approve', {
      statusCode: 400,
    })
  }
  await markSponsorshipInvoicePaidManual({
    invoiceId: sponsorship.supplier_billing_invoice_id,
    supplierId: sponsorship.supplier_id,
    adminUserId,
    reason,
  })
  const confirmed = await confirmSupplierPayment(sponsorshipId)
  await audit(req, 'growth.sponsorship.admin_manual_pay', sponsorshipId, { reason })
  return confirmed
}

export async function refundSponsorship(
  sponsorshipId,
  { amount = null, reason = 'refund', req = null } = {}
) {
  const result = await withTransaction(async (client) => {
    const sponsorship = await loadSponsorship(sponsorshipId, { forUpdate: true, client })
    if (!sponsorship) throw new NotFoundError('Sponsorship not found')
    if (!['active', 'scheduled', 'completed', 'payment_pending'].includes(sponsorship.status)) {
      if (sponsorship.status === 'refunded') return { sponsorship, duplicate: true }
    }
    if (sponsorship.supplier_billing_invoice_id) {
      await markSponsorshipInvoiceRefunded({
        invoiceId: sponsorship.supplier_billing_invoice_id,
        supplierId: sponsorship.supplier_id,
        amount: amount ?? sponsorship.sponsored_amount,
        reason,
      })
    }
    await client.query(
      `UPDATE supplier_sponsorship SET
         status = 'refunded',
         refunded_at = now(),
         refund_amount = $2,
         cancellation_reason = $3,
         updated_at = now()
       WHERE id = $1`,
      [sponsorshipId, amount ?? sponsorship.sponsored_amount, reason]
    )
    const { rows } = await client.query(`SELECT * FROM supplier_sponsorship WHERE id = $1`, [
      sponsorshipId,
    ])
    return { sponsorship: rows[0], duplicate: false }
  })
  await audit(req, 'growth.sponsorship.refunded', sponsorshipId, { reason, amount })
  return result
}

/**
 * Hourly maintenance: expire offers, stale payments, activate scheduled, complete active.
 */
export async function runSponsorshipMaintenanceJob() {
  const started = Date.now()
  const summary = {
    checked: 0,
    expiredOffers: 0,
    stalePayments: 0,
    activated: 0,
    completed: 0,
    failed: 0,
    endingSoonNotified: 0,
  }

  const config = await getReferralProgramConfig()
  const staleDays = config.paymentPendingStaleDays ?? 7

  // Expire unaccepted offers
  const { rows: expiredOffers } = await query(
    `UPDATE supplier_sponsorship SET status = 'expired', updated_at = now()
     WHERE status = 'offered' AND offer_expires_at IS NOT NULL AND offer_expires_at < now()
     RETURNING id`
  )
  summary.expiredOffers = expiredOffers.length
  summary.checked += expiredOffers.length

  // Stale payment_pending
  const { rows: stale } = await query(
    `UPDATE supplier_sponsorship SET
       status = 'expired',
       failure_reason = 'payment_pending_stale',
       updated_at = now()
     WHERE status IN ('payment_pending', 'payment_failed')
       AND updated_at < now() - ($1 || ' days')::interval
     RETURNING id, supplier_billing_invoice_id, supplier_id`,
    [String(staleDays)]
  )
  for (const row of stale) {
    if (row.supplier_billing_invoice_id) {
      await voidSponsorshipInvoice({
        invoiceId: row.supplier_billing_invoice_id,
        supplierId: row.supplier_id,
        reason: 'payment_pending_stale',
      }).catch(() => {})
    }
  }
  summary.stalePayments = stale.length
  summary.checked += stale.length

  // Activate scheduled
  const { rows: toActivate } = await query(
    `SELECT id FROM supplier_sponsorship
     WHERE status = 'scheduled'
       AND (scheduled_activation_at IS NULL OR scheduled_activation_at <= now())
     ORDER BY scheduled_activation_at ASC NULLS FIRST
     LIMIT 100`
  )
  for (const row of toActivate) {
    summary.checked += 1
    try {
      await activateSponsorship(row.id)
      summary.activated += 1
    } catch (err) {
      summary.failed += 1
      await query(
        `UPDATE supplier_sponsorship SET failure_code = $2, failure_reason = $3, updated_at = now()
         WHERE id = $1`,
        [row.id, 'activation_failed', err.message?.slice(0, 500)]
      ).catch(() => {})
    }
  }

  // Complete active past period_end
  const { rows: toComplete } = await query(
    `SELECT id FROM supplier_sponsorship
     WHERE status = 'active' AND period_end IS NOT NULL AND period_end < now()
     ORDER BY period_end ASC
     LIMIT 100`
  )
  for (const row of toComplete) {
    summary.checked += 1
    try {
      await completeSponsorship(row.id)
      summary.completed += 1
    } catch (err) {
      summary.failed += 1
      await query(
        `UPDATE supplier_sponsorship SET failure_code = $2, failure_reason = $3, updated_at = now()
         WHERE id = $1`,
        [row.id, 'completion_failed', err.message?.slice(0, 500)]
      ).catch(() => {})
    }
  }

  // Ending-soon notifications (7d / 3d)
  for (const days of [7, 3]) {
    const { rows: ending } = await query(
      `SELECT id, restaurant_id, period_end FROM supplier_sponsorship
       WHERE status = 'active'
         AND period_end IS NOT NULL
         AND period_end::date = (now() + ($1 || ' days')::interval)::date
         AND restaurant_id IS NOT NULL`,
      [String(days)]
    )
    for (const row of ending) {
      await notifyTenantUsers({
        tenantId: row.restaurant_id,
        tenantType: 'RESTAURANT',
        notificationType: 'sponsorship_ending_soon',
        notificationCategory: 'sponsorship_expired',
        title: `Sponsored month ends in ${days} days`,
        message:
          'After the sponsored month, you are responsible for subscription charges. Ensure a payment method is on file.',
        metadata: { sponsorshipId: row.id, days, ctaUrl: '/app/settings' },
      }).catch(() => {})
      summary.endingSoonNotified += 1
    }
  }

  summary.durationMs = Date.now() - started
  return summary
}

/** @deprecated Prefer runSponsorshipMaintenanceJob — kept for job import compat. */
export async function runSponsorshipExpiryJob() {
  const summary = await runSponsorshipMaintenanceJob()
  return { expired: summary.completed + summary.expiredOffers, ...summary }
}

/**
 * Bind restaurant_id onto open sponsorship offers when prospect registers.
 */
export async function linkSponsorshipsOnRestaurantRegistration({
  prospectId,
  restaurantId,
  invitationId = null,
  client = null,
}) {
  const db = client || { query }
  await db.query(
    `UPDATE supplier_sponsorship SET restaurant_id = $2, updated_at = now()
     WHERE prospect_id = $1 AND restaurant_id IS NULL AND status = ANY($3::text[])`,
    [prospectId, restaurantId, LIVE_STATUSES]
  )
  if (invitationId) {
    await db.query(
      `UPDATE supplier_sponsorship SET restaurant_id = $2, invitation_id = COALESCE(invitation_id, $3), updated_at = now()
       WHERE invitation_id = $3 AND restaurant_id IS NULL`,
      [prospectId, restaurantId, invitationId]
    )
  }
}
