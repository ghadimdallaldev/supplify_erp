/**
 * User-facing labels for deals, boosts, coupons, and redemptions.
 * Internal API/DB keys remain unchanged (promotions, deal_promotions, coupon_code, etc.).
 */

export const DEAL_TYPE_LABELS: Record<string, string> = {
  percentage_discount: 'Percentage off',
  percentage_off: 'Percentage off',
  fixed_discount: 'Fixed amount off',
  fixed_off: 'Fixed amount off',
  buy_x_get_y: 'Buy X Get Y',
  bogo: 'Buy X Get Y',
  bundle: 'Bundle',
  free_shipping: 'Free shipping',
  featured_listing: 'Visibility only',
}

export const DEAL_TYPE_HELPER_TEXT: Record<string, string> = {
  percentage_discount: 'Give restaurants a percentage off eligible products.',
  percentage_off: 'Give restaurants a percentage off eligible products.',
  fixed_discount: 'Give restaurants a fixed amount off eligible orders.',
  fixed_off: 'Give restaurants a fixed amount off eligible orders.',
  buy_x_get_y: 'Reward restaurants for buying a quantity of selected products.',
  bogo: 'Reward restaurants for buying a quantity of selected products.',
  bundle: 'Bundle selected products at a special price.',
  free_shipping: 'Remove shipping cost for eligible orders.',
  featured_listing: 'Visibility-only deal. This does not discount the order.',
}

export const SUPPLIER_CTA_LABELS: Record<string, string> = {
  order_now: 'Order now',
  use_coupon: 'Use coupon',
  message_supplier: 'Message supplier',
  view_products: 'View products',
}

export const RESTAURANT_CTA_LABELS: Record<string, string> = {
  order_now: 'Order with deal',
  use_coupon: 'Use coupon',
  message_supplier: 'Message supplier',
  view_products: 'View products',
}

export const CTA_TYPE_HELPER_TEXT: Record<string, string> = {
  order_now: 'Send restaurants directly to the order flow with this deal context.',
  use_coupon: 'Reveal a coupon code and apply it during checkout.',
  message_supplier: 'Start a chat with a prefilled message about this deal.',
  view_products: 'Show restaurants the eligible products for this deal.',
}

export const COUPON_FIELD_HELPER =
  'Coupon codes are attached to this deal. They are not standalone vouchers.'

export const COUPON_LINKED_HELPER = 'This code is linked to this supplier deal.'

export const COUPON_COPIED_TOAST = "Coupon copied. We'll apply it at checkout when eligible."

export const SUPPLIER_DEAL_TYPES = [
  'percentage_discount',
  'fixed_discount',
  'free_shipping',
  'buy_x_get_y',
] as const

export const SUPPLIER_CTA_TYPES = [
  { value: 'order_now', label: SUPPLIER_CTA_LABELS.order_now },
  { value: 'use_coupon', label: SUPPLIER_CTA_LABELS.use_coupon },
  { value: 'message_supplier', label: SUPPLIER_CTA_LABELS.message_supplier },
  { value: 'view_products', label: SUPPLIER_CTA_LABELS.view_products },
] as const

const DEAL_STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  scheduled: 'Scheduled',
  expired: 'Expired',
  paused: 'Paused',
  draft: 'Draft',
  pending_approval: 'Pending approval',
  pending_admin_approval: 'Pending approval',
  pending_review: 'Pending review',
  rejected: 'Rejected',
  approved_pending_payment: 'Awaiting boost payment',
  cancelled: 'Cancelled',
}

const BOOST_STATUS_LABELS: Record<string, string> = {
  active: 'Active boost',
  expired: 'Expired boost',
  scheduled: 'Scheduled boost',
  none: 'No boost',
  sponsored: 'Sponsored',
  boosted: 'Boosted',
}

export const SUPPLIER_EMPTY_STATE = {
  title: 'No deals yet',
  description:
    'Create your first supplier deal to offer discounts, coupons, or visibility-based offers to restaurants.',
  cta: 'Create deal',
} as const

export const RESTAURANT_EMPTY_STATE = {
  title: 'No active deals right now',
  description: "When your suppliers publish offers, they'll appear here.",
} as const

export const ADMIN_EMPTY_STATE = {
  title: 'No deals found',
  description: 'Supplier-created deals and sponsored boosts will appear here.',
} as const

export const BOOST_EMPTY_STATE = {
  title: 'No boosted deals yet',
  description:
    'Boosts are optional paid campaigns that increase deal visibility in the restaurant deals feed.',
} as const

export const ADMIN_BOOST_PACKAGES_EMPTY = {
  title: 'No boost packages configured',
  description:
    'Boost packages define paid sponsored placement pricing suppliers see when boosting deals.',
} as const

function titleCaseFromKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function formatDealTypeLabel(type: unknown): string {
  const key = String(type || '')
  if (!key) return '—'
  return DEAL_TYPE_LABELS[key] || titleCaseFromKey(key)
}

export function formatDealStatusLabel(status: unknown): string {
  const key = String(status || '')
  if (!key) return '—'
  return DEAL_STATUS_LABELS[key] || titleCaseFromKey(key)
}

export function formatBoostStatusLabel(status: unknown): string {
  const key = String(status || '')
  if (!key) return '—'
  return BOOST_STATUS_LABELS[key] || titleCaseFromKey(key)
}

export function getCtaLabel(
  cta: unknown,
  audience: 'supplier' | 'restaurant' = 'restaurant'
): string {
  const key = String(cta || 'order_now')
  const map = audience === 'supplier' ? SUPPLIER_CTA_LABELS : RESTAURANT_CTA_LABELS
  return map[key] || SUPPLIER_CTA_LABELS.order_now
}

export function getDealTypeHelperText(type: unknown): string | undefined {
  const key = String(type || '')
  return DEAL_TYPE_HELPER_TEXT[key]
}

export function getCtaHelperText(cta: unknown): string | undefined {
  const key = String(cta || '')
  return CTA_TYPE_HELPER_TEXT[key]
}
