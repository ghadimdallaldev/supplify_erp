import { describe, expect, it } from 'vitest'
import {
  FEATURE_UPGRADE_COPY,
  LIMIT_UPGRADE_COPY,
  getFeatureUpgradeCopy,
  getLimitUpgradeCopy,
} from './upgradeCopy'

describe('upgradeCopy', () => {
  it('includes supplier deals and promotion limit copy (GATE-R19, GATE-S13, PLN)', () => {
    expect(LIMIT_UPGRADE_COPY.supplier_deals?.plan).toBe('Silver')
    expect(LIMIT_UPGRADE_COPY.deal_redemptions_per_day?.plan).toBe('Gold')
    expect(LIMIT_UPGRADE_COPY.promotions?.plan).toBe('Gold')
    expect(LIMIT_UPGRADE_COPY.deal_redemptions_per_day?.value).toContain('50')
    expect(LIMIT_UPGRADE_COPY.promotions?.value).toContain('25')
  })

  it('getLimitUpgradeCopy returns null for unknown keys', () => {
    expect(getLimitUpgradeCopy('unknown_meter')).toBeNull()
  })

  it('getFeatureUpgradeCopy returns chat and reports entries', () => {
    expect(getFeatureUpgradeCopy('chat')?.plan).toBe('Silver')
    expect(FEATURE_UPGRADE_COPY.reports?.plan).toBe('Gold')
    expect(getFeatureUpgradeCopy('missing')).toBeNull()
  })
})
