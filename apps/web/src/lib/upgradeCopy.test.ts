import { describe, expect, it } from 'vitest'
import {
  FEATURE_UPGRADE_COPY,
  LIMIT_UPGRADE_COPY,
  getFeatureUpgradeCopy,
  getLimitUpgradeCopy,
} from './upgradeCopy'

describe('upgradeCopy', () => {
  it('includes supplier deals and promotion limit copy (GATE-R19, GATE-S13, PLN)', () => {
    expect(LIMIT_UPGRADE_COPY.supplier_deals?.plan).toBe('Growth')
    expect(LIMIT_UPGRADE_COPY.deal_redemptions_per_day?.plan).toBe('Growth')
    expect(LIMIT_UPGRADE_COPY.promotions?.plan).toBe('Supplier Scale')
    expect(LIMIT_UPGRADE_COPY.deal_redemptions_per_day?.value).toContain('fair use')
    expect(LIMIT_UPGRADE_COPY.promotions?.value).toContain('more active deals')
  })

  it('getLimitUpgradeCopy returns null for unknown keys', () => {
    expect(getLimitUpgradeCopy('unknown_meter')).toBeNull()
  })

  it('getFeatureUpgradeCopy returns chat and reports entries', () => {
    expect(getFeatureUpgradeCopy('chat')?.plan).toBe('Growth')
    expect(FEATURE_UPGRADE_COPY.reports?.plan).toBe('Scale')
    expect(getFeatureUpgradeCopy('missing')).toBeNull()
  })
})
