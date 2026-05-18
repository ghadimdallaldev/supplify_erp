import { describe, expect, it } from 'vitest'
import { FEATURE_KEY_LABELS, RESTAURANT_FEATURE_KEYS, getPlanSubtitle } from './planComparison'

describe('planComparison', () => {
  it('includes order_calendar feature label', () => {
    expect(FEATURE_KEY_LABELS.order_calendar).toBe('Order calendar')
    expect(RESTAURANT_FEATURE_KEYS).toContain('order_calendar')
  })

  it('returns plan subtitles for known tiers', () => {
    expect(getPlanSubtitle('free')).toBe('Setup & Testing')
    expect(getPlanSubtitle('gold')).toBe('Most Popular')
  })
})
