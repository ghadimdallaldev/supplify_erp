import { describe, expect, it } from 'vitest'
import {
  FEATURE_KEY_LABELS,
  LIMIT_KEY_LABELS,
  RESTAURANT_FEATURE_KEYS,
  getPlanSubtitle,
} from './planComparison'

describe('planComparison', () => {
  it('includes order_calendar feature label', () => {
    expect(FEATURE_KEY_LABELS.order_calendar).toBe('Order calendar')
    expect(RESTAURANT_FEATURE_KEYS).toContain('order_calendar')
  })

  it('returns plan subtitles for known tiers', () => {
    expect(getPlanSubtitle('free')).toBe('Time-limited trial')
    expect(getPlanSubtitle('gold')).toBe('Most Popular')
  })

  it('includes deals and promotions keys for plan comparison (GATE-R19, GATE-S13)', () => {
    expect(RESTAURANT_FEATURE_KEYS).toContain('supplier_deals')
    expect(LIMIT_KEY_LABELS.deal_redemptions_per_day).toBe('Deal redemptions (today)')
    expect(FEATURE_KEY_LABELS.supplier_deals).toBe('Supplier deals')
    expect(FEATURE_KEY_LABELS.promotions).toBe('Promotions')
  })
})
