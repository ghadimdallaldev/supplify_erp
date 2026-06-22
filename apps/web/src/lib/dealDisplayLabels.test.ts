import { beforeAll, describe, it, expect } from 'vitest'
import i18n from 'i18next'
import enDeals from '../i18n/locales/en/deals.json'
import {
  formatBoostStatusLabel,
  formatDealStatusLabel,
  formatDealTypeLabel,
  getCouponCopiedToast,
  getCouponFieldHelper,
  getCtaHelperText,
  getCtaLabel,
  getDealScheduleEndsHelper,
  getDealScheduleSectionHelper,
  getDealTypeHelperText,
  RESTAURANT_EMPTY_STATE,
  SUPPLIER_CTA_TYPES,
  SUPPLIER_DEAL_TYPES,
  SUPPLIER_EMPTY_STATE,
} from './dealDisplayLabels'

const t = (key: string) => i18n.t(key, { ns: 'deals' })

beforeAll(async () => {
  await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    ns: ['deals'],
    resources: { en: { deals: enDeals } },
    interpolation: { escapeValue: false },
  })
})

describe('dealDisplayLabels', () => {
  it('maps supplier deal types to readable labels', () => {
    expect(formatDealTypeLabel('percentage_discount')).toBe(
      t('labels.dealTypes.percentage_discount')
    )
    expect(formatDealTypeLabel('fixed_discount')).toBe(t('labels.dealTypes.fixed_discount'))
    expect(formatDealTypeLabel('buy_x_get_y')).toBe(t('labels.dealTypes.buy_x_get_y'))
    expect(formatDealTypeLabel('free_shipping')).toBe(t('labels.dealTypes.free_shipping'))
    expect(formatDealTypeLabel('featured_listing')).toBe(t('labels.dealTypes.featured_listing'))
  })

  it('maps admin/API deal type variants', () => {
    expect(formatDealTypeLabel('percentage_off')).toBe(t('labels.dealTypes.percentage_off'))
    expect(formatDealTypeLabel('fixed_off')).toBe(t('labels.dealTypes.fixed_off'))
    expect(formatDealTypeLabel('bogo')).toBe(t('labels.dealTypes.bogo'))
  })

  it('falls back for unknown deal types', () => {
    expect(formatDealTypeLabel('custom_type')).toBe('Custom Type')
  })

  it('explains deal schedule vs boost visibility', () => {
    expect(getDealScheduleSectionHelper()).toContain('boost package')
    expect(getDealScheduleSectionHelper()).toContain('redeem')
    expect(getDealScheduleEndsHelper()).toContain('Leave blank')
    expect(getDealScheduleEndsHelper()).toContain('boost')
  })

  it('provides deal type helper text for create form', () => {
    expect(getDealTypeHelperText('percentage_discount')).toContain('percentage off')
    expect(getDealTypeHelperText('fixed_discount')).toContain('fixed amount')
    expect(getDealTypeHelperText('buy_x_get_y')).toContain('quantity')
    expect(getDealTypeHelperText('free_shipping')).toContain('shipping')
    expect(getDealTypeHelperText('featured_listing')).toContain('Visibility-only')
    expect(getDealTypeHelperText('percentage_discount')).toBe(
      t('labels.dealTypeHelpers.percentage_discount')
    )
  })

  it('maps deal status to readable labels', () => {
    expect(formatDealStatusLabel('active')).toBe(t('labels.dealStatus.active'))
    expect(formatDealStatusLabel('scheduled')).toBe(t('labels.dealStatus.scheduled'))
    expect(formatDealStatusLabel('expired')).toBe(t('labels.dealStatus.expired'))
    expect(formatDealStatusLabel('paused')).toBe(t('labels.dealStatus.paused'))
    expect(formatDealStatusLabel('draft')).toBe(t('labels.dealStatus.draft'))
    expect(formatDealStatusLabel('pending_approval')).toBe(t('labels.dealStatus.pending_approval'))
  })

  it('maps boost status to readable labels', () => {
    expect(formatBoostStatusLabel('active')).toBe(t('labels.boostStatus.active'))
    expect(formatBoostStatusLabel('expired')).toBe(t('labels.boostStatus.expired'))
    expect(formatBoostStatusLabel('sponsored')).toBe(t('labels.boostStatus.sponsored'))
    expect(formatBoostStatusLabel('boosted')).toBe(t('labels.boostStatus.boosted'))
  })

  it('uses supplier vs restaurant CTA labels', () => {
    expect(getCtaLabel('order_now', 'supplier')).toBe(t('labels.cta.supplier.order_now'))
    expect(getCtaLabel('order_now', 'restaurant')).toBe(t('labels.cta.restaurant.order_now'))
    expect(getCtaLabel('use_coupon', 'restaurant')).toBe(t('labels.cta.restaurant.use_coupon'))
    expect(getCtaLabel('message_supplier', 'restaurant')).toBe(
      t('labels.cta.restaurant.message_supplier')
    )
    expect(getCtaLabel('view_products', 'restaurant')).toBe(
      t('labels.cta.restaurant.view_products')
    )
  })

  it('provides CTA helper text', () => {
    expect(getCtaHelperText('use_coupon')).toContain('coupon code')
    expect(getCtaHelperText('order_now')).toContain('order flow')
    expect(getCtaHelperText('message_supplier')).toContain('chat')
  })

  it('exposes supplier form option arrays', () => {
    expect(SUPPLIER_DEAL_TYPES).toContain('percentage_discount')
    expect(SUPPLIER_CTA_TYPES.map((cta) => cta.value)).toContain('use_coupon')
    expect(SUPPLIER_CTA_TYPES.find((cta) => cta.value === 'use_coupon')?.label).toBe(
      t('labels.cta.supplier.use_coupon')
    )
  })

  it('includes coupon helper and toast copy', () => {
    expect(getCouponFieldHelper()).toContain('attached to this deal')
    expect(getCouponCopiedToast()).toContain('checkout when eligible')
  })

  it('includes empty state copy', () => {
    expect(SUPPLIER_EMPTY_STATE.title).toBe(t('empty.supplier.title'))
    expect(SUPPLIER_EMPTY_STATE.cta).toBe(t('empty.supplier.cta'))
    expect(RESTAURANT_EMPTY_STATE.title).toBe(t('empty.restaurant.title'))
  })

  it('covers all deal type keys for supplier types', () => {
    for (const dealType of SUPPLIER_DEAL_TYPES) {
      expect(formatDealTypeLabel(dealType)).toBeTruthy()
    }
  })
})
