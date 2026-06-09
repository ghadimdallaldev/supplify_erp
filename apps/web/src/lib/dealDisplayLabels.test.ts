import { describe, expect, it } from 'vitest'
import {
  COUPON_COPIED_TOAST,
  COUPON_FIELD_HELPER,
  CTA_TYPE_HELPER_TEXT,
  DEAL_TYPE_HELPER_TEXT,
  DEAL_TYPE_LABELS,
  formatBoostStatusLabel,
  formatDealStatusLabel,
  formatDealTypeLabel,
  getCtaLabel,
  getCtaHelperText,
  getDealTypeHelperText,
  RESTAURANT_EMPTY_STATE,
  SUPPLIER_CTA_TYPES,
  SUPPLIER_DEAL_TYPES,
  SUPPLIER_EMPTY_STATE,
} from './dealDisplayLabels'

describe('dealDisplayLabels', () => {
  it('maps supplier deal types to readable labels', () => {
    expect(formatDealTypeLabel('percentage_discount')).toBe('Percentage off')
    expect(formatDealTypeLabel('fixed_discount')).toBe('Fixed amount off')
    expect(formatDealTypeLabel('buy_x_get_y')).toBe('Buy X Get Y')
    expect(formatDealTypeLabel('free_shipping')).toBe('Free shipping')
    expect(formatDealTypeLabel('featured_listing')).toBe('Visibility only')
  })

  it('maps admin/API deal type variants', () => {
    expect(formatDealTypeLabel('percentage_off')).toBe('Percentage off')
    expect(formatDealTypeLabel('fixed_off')).toBe('Fixed amount off')
    expect(formatDealTypeLabel('bogo')).toBe('Buy X Get Y')
  })

  it('falls back for unknown deal types', () => {
    expect(formatDealTypeLabel('custom_type')).toBe('Custom Type')
  })

  it('provides deal type helper text for create form', () => {
    expect(DEAL_TYPE_HELPER_TEXT.percentage_discount).toContain('percentage off')
    expect(DEAL_TYPE_HELPER_TEXT.fixed_discount).toContain('fixed amount')
    expect(DEAL_TYPE_HELPER_TEXT.buy_x_get_y).toContain('quantity')
    expect(DEAL_TYPE_HELPER_TEXT.free_shipping).toContain('shipping')
    expect(DEAL_TYPE_HELPER_TEXT.featured_listing).toContain('Visibility-only')
    expect(getDealTypeHelperText('percentage_discount')).toBe(
      DEAL_TYPE_HELPER_TEXT.percentage_discount
    )
  })

  it('maps deal status to readable labels', () => {
    expect(formatDealStatusLabel('active')).toBe('Active')
    expect(formatDealStatusLabel('scheduled')).toBe('Scheduled')
    expect(formatDealStatusLabel('expired')).toBe('Expired')
    expect(formatDealStatusLabel('paused')).toBe('Paused')
    expect(formatDealStatusLabel('draft')).toBe('Draft')
    expect(formatDealStatusLabel('pending_approval')).toBe('Pending approval')
  })

  it('maps boost status to readable labels', () => {
    expect(formatBoostStatusLabel('active')).toBe('Active boost')
    expect(formatBoostStatusLabel('expired')).toBe('Expired boost')
    expect(formatBoostStatusLabel('sponsored')).toBe('Sponsored')
    expect(formatBoostStatusLabel('boosted')).toBe('Boosted')
  })

  it('uses supplier vs restaurant CTA labels', () => {
    expect(getCtaLabel('order_now', 'supplier')).toBe('Order now')
    expect(getCtaLabel('order_now', 'restaurant')).toBe('Order with deal')
    expect(getCtaLabel('use_coupon', 'restaurant')).toBe('Use coupon')
    expect(getCtaLabel('message_supplier', 'restaurant')).toBe('Message supplier')
    expect(getCtaLabel('view_products', 'restaurant')).toBe('View products')
  })

  it('provides CTA helper text', () => {
    expect(CTA_TYPE_HELPER_TEXT.use_coupon).toContain('coupon code')
    expect(getCtaHelperText('order_now')).toContain('order flow')
    expect(getCtaHelperText('message_supplier')).toContain('chat')
  })

  it('exposes supplier form option arrays', () => {
    expect(SUPPLIER_DEAL_TYPES).toContain('percentage_discount')
    expect(SUPPLIER_CTA_TYPES.map((t) => t.value)).toContain('use_coupon')
    expect(SUPPLIER_CTA_TYPES.find((t) => t.value === 'use_coupon')?.label).toBe('Use coupon')
  })

  it('includes coupon helper and toast copy', () => {
    expect(COUPON_FIELD_HELPER).toContain('attached to this deal')
    expect(COUPON_COPIED_TOAST).toContain('checkout when eligible')
  })

  it('includes empty state copy', () => {
    expect(SUPPLIER_EMPTY_STATE.title).toBe('No deals yet')
    expect(SUPPLIER_EMPTY_STATE.cta).toBe('Create deal')
    expect(RESTAURANT_EMPTY_STATE.title).toBe('No active deals right now')
  })

  it('covers all deal type keys in DEAL_TYPE_LABELS for supplier types', () => {
    for (const t of SUPPLIER_DEAL_TYPES) {
      expect(DEAL_TYPE_LABELS[t]).toBeTruthy()
    }
  })
})
