/**
 * User-facing labels for deals, boosts, coupons, and redemptions.
 * Internal API/DB keys remain unchanged (promotions, deal_promotions, coupon_code, etc.).
 */

import i18n from 'i18next'

const NS = 'deals'

function ft(key: string, options?: Record<string, unknown>): string {
  return i18n.t(key, { ns: NS, ...options })
}

const DEAL_TYPE_KEYS: Record<string, string> = {
  percentage_discount: 'labels.dealTypes.percentage_discount',
  percentage_off: 'labels.dealTypes.percentage_off',
  fixed_discount: 'labels.dealTypes.fixed_discount',
  fixed_off: 'labels.dealTypes.fixed_off',
  buy_x_get_y: 'labels.dealTypes.buy_x_get_y',
  bogo: 'labels.dealTypes.bogo',
  bundle: 'labels.dealTypes.bundle',
  free_shipping: 'labels.dealTypes.free_shipping',
  featured_listing: 'labels.dealTypes.featured_listing',
}

const DEAL_TYPE_HELPER_KEYS: Record<string, string> = {
  percentage_discount: 'labels.dealTypeHelpers.percentage_discount',
  percentage_off: 'labels.dealTypeHelpers.percentage_off',
  fixed_discount: 'labels.dealTypeHelpers.fixed_discount',
  fixed_off: 'labels.dealTypeHelpers.fixed_off',
  buy_x_get_y: 'labels.dealTypeHelpers.buy_x_get_y',
  bogo: 'labels.dealTypeHelpers.bogo',
  bundle: 'labels.dealTypeHelpers.bundle',
  free_shipping: 'labels.dealTypeHelpers.free_shipping',
  featured_listing: 'labels.dealTypeHelpers.featured_listing',
}

const SUPPLIER_CTA_KEYS: Record<string, string> = {
  order_now: 'labels.cta.supplier.order_now',
  use_coupon: 'labels.cta.supplier.use_coupon',
  message_supplier: 'labels.cta.supplier.message_supplier',
  view_products: 'labels.cta.supplier.view_products',
}

const RESTAURANT_CTA_KEYS: Record<string, string> = {
  order_now: 'labels.cta.restaurant.order_now',
  use_coupon: 'labels.cta.restaurant.use_coupon',
  message_supplier: 'labels.cta.restaurant.message_supplier',
  view_products: 'labels.cta.restaurant.view_products',
}

const CTA_HELPER_KEYS: Record<string, string> = {
  order_now: 'labels.cta.helpers.order_now',
  use_coupon: 'labels.cta.helpers.use_coupon',
  message_supplier: 'labels.cta.helpers.message_supplier',
  view_products: 'labels.cta.helpers.view_products',
}

const DEAL_STATUS_KEYS: Record<string, string> = {
  active: 'labels.dealStatus.active',
  scheduled: 'labels.dealStatus.scheduled',
  expired: 'labels.dealStatus.expired',
  paused: 'labels.dealStatus.paused',
  draft: 'labels.dealStatus.draft',
  pending_approval: 'labels.dealStatus.pending_approval',
  pending_admin_approval: 'labels.dealStatus.pending_admin_approval',
  pending_review: 'labels.dealStatus.pending_review',
  rejected: 'labels.dealStatus.rejected',
  approved_pending_payment: 'labels.dealStatus.approved_pending_payment',
  cancelled: 'labels.dealStatus.cancelled',
}

const BOOST_STATUS_KEYS: Record<string, string> = {
  active: 'labels.boostStatus.active',
  expired: 'labels.boostStatus.expired',
  scheduled: 'labels.boostStatus.scheduled',
  none: 'labels.boostStatus.none',
  sponsored: 'labels.boostStatus.sponsored',
  boosted: 'labels.boostStatus.boosted',
}

export const SUPPLIER_DEAL_TYPES = [
  'percentage_discount',
  'fixed_discount',
  'free_shipping',
  'buy_x_get_y',
] as const

export const SUPPLIER_CTA_TYPES = [
  {
    value: 'order_now',
    get label() {
      return ft(SUPPLIER_CTA_KEYS.order_now)
    },
  },
  {
    value: 'use_coupon',
    get label() {
      return ft(SUPPLIER_CTA_KEYS.use_coupon)
    },
  },
  {
    value: 'message_supplier',
    get label() {
      return ft(SUPPLIER_CTA_KEYS.message_supplier)
    },
  },
  {
    value: 'view_products',
    get label() {
      return ft(SUPPLIER_CTA_KEYS.view_products)
    },
  },
] as const

export function getCouponFieldHelper(): string {
  return ft('labels.coupon.fieldHelper')
}

export function getDealScheduleSectionHelper(): string {
  return ft('labels.schedule.sectionHelper')
}

export function getDealScheduleEndsHelper(): string {
  return ft('labels.schedule.endsHelper')
}

export function getCouponLinkedHelper(): string {
  return ft('labels.coupon.linkedHelper')
}

export function getCouponCopiedToast(): string {
  return ft('labels.coupon.copiedToast')
}

export const SUPPLIER_EMPTY_STATE = {
  get title() {
    return ft('empty.supplier.title')
  },
  get description() {
    return ft('empty.supplier.description')
  },
  get cta() {
    return ft('empty.supplier.cta')
  },
} as const

export const RESTAURANT_EMPTY_STATE = {
  get title() {
    return ft('empty.restaurant.title')
  },
  get description() {
    return ft('empty.restaurant.description')
  },
} as const

export const ADMIN_EMPTY_STATE = {
  get title() {
    return ft('empty.admin.title')
  },
  get description() {
    return ft('empty.admin.description')
  },
} as const

export const BOOST_EMPTY_STATE = {
  get title() {
    return ft('empty.boost.title')
  },
  get description() {
    return ft('empty.boost.description')
  },
} as const

export const ADMIN_BOOST_PACKAGES_EMPTY = {
  get title() {
    return ft('empty.adminBoostPackages.title')
  },
  get description() {
    return ft('empty.adminBoostPackages.description')
  },
} as const

function titleCaseFromKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function formatDealTypeLabel(type: unknown): string {
  const key = String(type || '')
  if (!key) return ft('labels.emDash')
  const i18nKey = DEAL_TYPE_KEYS[key]
  if (i18nKey) return ft(i18nKey)
  return titleCaseFromKey(key)
}

export function formatDealStatusLabel(status: unknown): string {
  const key = String(status || '')
  if (!key) return ft('labels.emDash')
  const i18nKey = DEAL_STATUS_KEYS[key]
  if (i18nKey) return ft(i18nKey)
  return titleCaseFromKey(key)
}

export function formatBoostStatusLabel(status: unknown): string {
  const key = String(status || '')
  if (!key) return ft('labels.emDash')
  const i18nKey = BOOST_STATUS_KEYS[key]
  if (i18nKey) return ft(i18nKey)
  return titleCaseFromKey(key)
}

export function getCtaLabel(
  cta: unknown,
  audience: 'supplier' | 'restaurant' = 'restaurant'
): string {
  const key = String(cta || 'order_now')
  const map = audience === 'supplier' ? SUPPLIER_CTA_KEYS : RESTAURANT_CTA_KEYS
  const i18nKey = map[key]
  return i18nKey ? ft(i18nKey) : ft(SUPPLIER_CTA_KEYS.order_now)
}

export function getDealTypeHelperText(type: unknown): string | undefined {
  const key = String(type || '')
  const i18nKey = DEAL_TYPE_HELPER_KEYS[key]
  return i18nKey ? ft(i18nKey) : undefined
}

export function getCtaHelperText(cta: unknown): string | undefined {
  const key = String(cta || '')
  const i18nKey = CTA_HELPER_KEYS[key]
  return i18nKey ? ft(i18nKey) : undefined
}
