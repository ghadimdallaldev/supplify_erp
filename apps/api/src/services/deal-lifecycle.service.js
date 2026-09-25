import { query } from '../lib/db.js'

/** Statuses stored on promotions.status */
export const DEAL_STATUSES = {
  DRAFT: 'draft',
  PENDING_APPROVAL: 'pending_approval',
  PENDING_ADMIN_APPROVAL: 'pending_admin_approval',
  REJECTED: 'rejected',
  APPROVED_PENDING_PAYMENT: 'approved_pending_payment',
  SCHEDULED: 'scheduled',
  ACTIVE: 'active',
  PAUSED: 'paused',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
}

export const PAYMENT_STATUSES = {
  NOT_REQUIRED: 'not_required',
  PENDING: 'pending',
  PAID: 'paid',
  FAILED: 'failed',
  REFUNDED: 'refunded',
  CANCELLED: 'cancelled',
}

export const PENDING_REVIEW_STATUSES = new Set([
  DEAL_STATUSES.PENDING_APPROVAL,
  DEAL_STATUSES.PENDING_ADMIN_APPROVAL,
])

export const RESTAURANT_VISIBLE_STATUSES = new Set([DEAL_STATUSES.ACTIVE])

export const PAID_PAYMENT_STATUSES = new Set([PAYMENT_STATUSES.NOT_REQUIRED, PAYMENT_STATUSES.PAID])

export const IMPORTANT_DEAL_FIELDS = new Set([
  'type',
  'discount_value',
  'min_order_amount',
  'max_discount_cap',
  'buy_quantity',
  'get_quantity',
  'applies_to',
  'starts_at',
  'ends_at',
  'usage_limit',
  'stock_quantity',
  'coupon_code',
  'min_order_quantity',
])

export const EXTENDED_INTERACTION_TYPES = new Set([
  'view',
  'click',
  'add_to_cart',
  'apply_to_cart',
  'remove_from_cart',
  'order',
  'order_created',
  'order_completed',
  'coupon_used',
  'message',
  'message_supplier',
  'banner_dismiss',
])

export function normalizeDealStatus(status) {
  const s = String(status || '').toLowerCase()
  if (s === DEAL_STATUSES.PENDING_APPROVAL) return DEAL_STATUSES.PENDING_ADMIN_APPROVAL
  return s
}

export function isPendingAdminReview(deal) {
  const s = normalizeDealStatus(deal?.status)
  return PENDING_REVIEW_STATUSES.has(s) || s === DEAL_STATUSES.PENDING_APPROVAL
}

export async function getActivationPricing(dbQuery = query) {
  const { rows } = await dbQuery(
    `SELECT * FROM promotion_pricing_config
     WHERE pricing_key = 'deal_activation' AND is_active = TRUE
     LIMIT 1`
  )
  return rows[0] || { amount: 0, pricing_key: 'deal_activation' }
}

export function isActivationPaymentRequired(activationPricing) {
  return Number(activationPricing?.amount || 0) > 0
}

export function resolveStatusAfterApproval(deal, { activationAmount = 0, now = new Date() } = {}) {
  if (isActivationPaymentRequired({ amount: activationAmount })) {
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

/** Draft stays a draft until the supplier submits it. Approval is a later step. */
export function resolveInitialDealStatus(submitForReview) {
  return submitForReview ? DEAL_STATUSES.PENDING_APPROVAL : DEAL_STATUSES.DRAFT
}

/**
 * Supplier create/edit rules shared by web and mobile.
 * @returns {string|null} user-facing error, or null when the offer is valid
 */
export function getDealFieldError(fields, { requireDescription = true } = {}) {
  const description = fields.description == null ? '' : String(fields.description).trim()
  if (requireDescription && !description) return 'Describe what this deal is about'
  if (fields.description != null && !description) return 'Describe what this deal is about'
  if (description.length > 1000) return 'Deal description must be 1000 characters or fewer'

  const type = fields.type
  const rawDiscount = fields.discountValue
  const hasDiscount = rawDiscount != null && rawDiscount !== ''
  const discount = hasDiscount ? Number(rawDiscount) : null

  if (type === 'percentage_discount') {
    if (discount == null || !Number.isFinite(discount) || discount <= 0 || discount > 100) {
      return 'Percentage discounts must be greater than 0 and at most 100'
    }
  } else if (type === 'fixed_discount') {
    if (discount == null || !Number.isFinite(discount) || discount <= 0) {
      return 'Fixed discounts must be greater than zero'
    }
  } else if (type === 'buy_x_get_y') {
    const buy = Number(fields.buyQuantity)
    const get = Number(fields.getQuantity)
    if (!Number.isInteger(buy) || buy <= 0 || !Number.isInteger(get) || get <= 0) {
      return 'Buy X Get Y deals need a buy quantity and a free quantity'
    }
  } else if (type === 'free_shipping' && hasDiscount) {
    if (!Number.isFinite(discount) || discount < 0) return 'Free delivery amount cannot be negative'
  }

  if (fields.startsAt && fields.endsAt) {
    const start = new Date(fields.startsAt)
    const end = new Date(fields.endsAt)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return 'Deal end must be after the start'
    }
  }

  if (fields.ctaType === 'use_coupon') {
    const code = fields.couponCode == null ? '' : String(fields.couponCode).trim()
    if (!code) return 'Coupon deals need a coupon code'
  }

  return null
}

/** Resume a paused deal, or expire it when the boost or offer window has already ended. */
export function resolveResumeStatus(deal, now = new Date()) {
  const ts = now instanceof Date ? now : new Date(now)
  if (deal?.boost_end_at && new Date(deal.boost_end_at) <= ts) return DEAL_STATUSES.EXPIRED
  if (deal?.ends_at && new Date(deal.ends_at) <= ts) return DEAL_STATUSES.EXPIRED
  return resolveScheduledOrActive(deal, {
    payment_status: deal?.payment_status || PAYMENT_STATUSES.NOT_REQUIRED,
    now: ts,
  }).status
}

export function resolveScheduledOrActive(
  deal,
  { payment_status = PAYMENT_STATUSES.PAID, now = new Date() } = {}
) {
  const ts = now instanceof Date ? now : new Date(now)
  const start = deal?.starts_at ? new Date(deal.starts_at) : null
  if (start && start > ts) {
    return { status: DEAL_STATUSES.SCHEDULED, payment_status }
  }
  return { status: DEAL_STATUSES.ACTIVE, payment_status }
}

export function isWithinActiveDateRange(deal, now = new Date()) {
  const ts = now instanceof Date ? now : new Date(now)
  if (deal?.starts_at && new Date(deal.starts_at) > ts) return false
  if (deal?.ends_at && new Date(deal.ends_at) <= ts) return false
  return true
}

export function isDealBoostWindowLive(deal, now = new Date()) {
  if (!deal?.boost_start_at || !deal?.boost_end_at) return false
  const ts = now instanceof Date ? now : new Date(now)
  return new Date(deal.boost_start_at) <= ts && new Date(deal.boost_end_at) > ts
}

export function isRestaurantVisibleDeal(deal, { now = new Date(), restaurantId } = {}) {
  if (!deal) return false
  const status = normalizeDealStatus(deal.status)
  if (!RESTAURANT_VISIBLE_STATUSES.has(status)) return false

  const paymentStatus = deal.payment_status || PAYMENT_STATUSES.NOT_REQUIRED
  if (!PAID_PAYMENT_STATUSES.has(paymentStatus)) return false

  if (!isDealBoostWindowLive(deal, now)) return false

  if (!isWithinActiveDateRange(deal, now)) return false

  if (deal.usage_limit != null && Number(deal.usage_count) >= Number(deal.usage_limit)) {
    return false
  }
  if (deal.stock_quantity != null && Number(deal.usage_count) >= Number(deal.stock_quantity)) {
    return false
  }

  if (deal.restaurant_ids?.length) {
    if (!restaurantId || !deal.restaurant_ids.includes(restaurantId)) return false
  }

  return true
}

export function getRestaurantIneligibilityMessage(deal, { now = new Date(), restaurantId } = {}) {
  if (!deal) return 'Deal not found'
  const status = normalizeDealStatus(deal.status)

  if (status === DEAL_STATUSES.DRAFT) return 'This deal is awaiting admin approval'
  if (isPendingAdminReview(deal)) return 'This deal is awaiting admin approval'
  if (status === DEAL_STATUSES.REJECTED) return 'This deal was rejected by admin'
  if (status === DEAL_STATUSES.APPROVED_PENDING_PAYMENT) return 'This deal is pending boost payment'
  if (deal.payment_status === PAYMENT_STATUSES.PENDING) return 'This deal is pending boost payment'
  if (status === DEAL_STATUSES.ACTIVE && !isDealBoostWindowLive(deal, now)) {
    if (deal.boost_end_at && new Date(deal.boost_end_at) <= now) {
      return 'This deal boost has ended'
    }
    return 'This deal is not currently boosted'
  }
  if (status === DEAL_STATUSES.PAUSED) return 'This deal is currently paused'
  if (status === DEAL_STATUSES.CANCELLED) return 'This deal was cancelled'
  if (status === DEAL_STATUSES.EXPIRED) return 'This deal has expired'
  if (status === DEAL_STATUSES.SCHEDULED) return 'This deal is not active yet'
  if (deal.starts_at && new Date(deal.starts_at) > now) {
    return `This deal is only valid from ${new Date(deal.starts_at).toLocaleDateString()}`
  }
  if (deal.ends_at && new Date(deal.ends_at) <= now) return 'This deal has expired'
  if (deal.ends_at && deal.starts_at) {
    return `This deal is only valid from ${new Date(deal.starts_at).toLocaleDateString()} to ${new Date(deal.ends_at).toLocaleDateString()}`
  }
  if (deal.restaurant_ids?.length && restaurantId && !deal.restaurant_ids.includes(restaurantId)) {
    return 'This deal is only valid for selected restaurants'
  }
  if (status !== DEAL_STATUSES.ACTIVE) return 'This deal is not available'
  return 'This deal cannot be applied'
}

export function getDealTypeLabel(type) {
  const labels = {
    percentage_discount: 'Percentage discount',
    fixed_discount: 'Fixed amount discount',
    free_shipping: 'Free delivery',
    buy_x_get_y: 'Buy X Get Y',
    featured_listing: 'Featured listing',
    bundle_deal: 'Bundle deal',
    tiered_quantity_discount: 'Tiered quantity discount',
  }
  return labels[type] || String(type || '').replace(/_/g, ' ')
}

export function getDealDiscountDisplayLabel(deal, discountAmount = 0) {
  if (!deal) return 'Discount applied'
  const value = Number(deal.discount_value) || 0
  switch (deal.type) {
    case 'percentage_discount':
      return `${value}% discount applied`
    case 'fixed_discount':
      return `$${Number(discountAmount || value).toFixed(2)} discount applied`
    case 'free_shipping':
      return 'Free delivery applied'
    case 'buy_x_get_y':
      return `Buy ${deal.buy_quantity || 'X'} Get ${deal.get_quantity || 'Y'} applied`
    case 'bundle_deal':
      return 'Bundle deal applied'
    case 'tiered_quantity_discount':
      return `Tier discount applied: ${value}% off`
    default:
      return discountAmount > 0
        ? `$${Number(discountAmount).toFixed(2)} discount applied`
        : 'Deal applied'
  }
}

export function shouldResetApprovalOnEdit(existing, body) {
  const postApprovalStatuses = new Set([
    DEAL_STATUSES.APPROVED_PENDING_PAYMENT,
    DEAL_STATUSES.SCHEDULED,
    DEAL_STATUSES.ACTIVE,
    DEAL_STATUSES.PAUSED,
  ])
  if (!postApprovalStatuses.has(normalizeDealStatus(existing.status))) return false

  const fieldMap = {
    type: 'type',
    discountValue: 'discount_value',
    minOrderAmount: 'min_order_amount',
    maxDiscountCap: 'max_discount_cap',
    buyQuantity: 'buy_quantity',
    getQuantity: 'get_quantity',
    appliesTo: 'applies_to',
    startsAt: 'starts_at',
    endsAt: 'ends_at',
    usageLimit: 'usage_limit',
    stockQuantity: 'stock_quantity',
    couponCode: 'coupon_code',
    minOrderQuantity: 'min_order_quantity',
  }

  for (const [bodyKey, dbKey] of Object.entries(fieldMap)) {
    if (body[bodyKey] === undefined) continue
    const nextVal = body[bodyKey]
    const prevVal = existing[dbKey]
    if (String(nextVal ?? '') !== String(prevVal ?? '')) return true
  }
  if (body.productIds || body.categoryIds || body.restaurantIds) return true
  return false
}

export function buildDealConfigSnapshot(deal) {
  return {
    id: deal.id,
    name: deal.name,
    type: deal.type,
    discount_value: deal.discount_value,
    min_order_amount: deal.min_order_amount,
    max_discount_cap: deal.max_discount_cap,
    buy_quantity: deal.buy_quantity,
    get_quantity: deal.get_quantity,
    applies_to: deal.applies_to,
    starts_at: deal.starts_at,
    ends_at: deal.ends_at,
    coupon_code: deal.coupon_code,
    min_order_quantity: deal.min_order_quantity,
  }
}

export function supplierCanSetStatusDirectly(targetStatus) {
  return targetStatus === DEAL_STATUSES.DRAFT || targetStatus === DEAL_STATUSES.CANCELLED
}
