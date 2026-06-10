import { describe, expect, it } from 'vitest'
import {
  filterAdminLimitKeys,
  formatAddonKeyLabel,
  formatLimitKeyLabel,
  formatLimitValue,
  formatPlanCodeLabel,
} from './adminLimitLabels'

describe('adminLimitLabels', () => {
  it('shows supplier "promotions" limit as "Active deals"', () => {
    expect(formatLimitKeyLabel('promotions')).toBe('Active deals')
  })

  it('shows restaurant deal redemption limit with full wording', () => {
    expect(formatLimitKeyLabel('deal_redemptions_per_day')).toBe('Deal redemptions per day')
  })

  it('falls back to humanized key for unknown limits', () => {
    expect(formatLimitKeyLabel('some_future_limit')).toBe('some future limit')
  })

  it('formats plan codes with marketing names', () => {
    expect(formatPlanCodeLabel('free')).toBe('Free Trial')
    expect(formatPlanCodeLabel('GOLD')).toBe('Gold')
    expect(formatPlanCodeLabel(null)).toBe('—')
    expect(formatPlanCodeLabel('custom-plan')).toBe('custom-plan')
  })

  it('hides supplier-only limits from restaurant tenants and vice versa', () => {
    const keys = ['promotions', 'deal_redemptions_per_day', 'users']
    expect(filterAdminLimitKeys(keys, 'RESTAURANT')).not.toContain('promotions')
    expect(filterAdminLimitKeys(keys, 'RESTAURANT')).toContain('deal_redemptions_per_day')
    expect(filterAdminLimitKeys(keys, 'SUPPLIER')).not.toContain('deal_redemptions_per_day')
    expect(filterAdminLimitKeys(keys, 'SUPPLIER')).toContain('promotions')
    expect(filterAdminLimitKeys(keys, 'SUPPLIER')).toContain('users')
  })

  it('renders unlimited limit values', () => {
    expect(formatLimitValue(-1)).toBe('Unlimited')
    expect(formatLimitValue(null)).toBe('Unlimited')
    expect(formatLimitValue(25)).toBe('25')
  })

  it('labels add-on keys', () => {
    expect(formatAddonKeyLabel('supplier_extra_warehouse')).toBe('Extra warehouse')
    expect(formatAddonKeyLabel('unknown_addon')).toBe('unknown_addon')
  })
})
