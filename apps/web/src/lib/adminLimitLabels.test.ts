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

  it('shows the active customer locations limit with product wording', () => {
    expect(formatLimitKeyLabel('active_customer_locations_monthly')).toBe(
      'Active customer locations'
    )
  })

  it('falls back to humanized key for unknown limits', () => {
    expect(formatLimitKeyLabel('some_future_limit')).toBe('some future limit')
  })

  it('formats plan codes with four-plan names', () => {
    expect(formatPlanCodeLabel('free')).toBe('30-day Free Trial')
    expect(formatPlanCodeLabel('GOLD')).toBe('Growth / Scale')
    expect(formatPlanCodeLabel('gold', 'SUPPLIER')).toBe('Supplier Growth')
    expect(formatPlanCodeLabel('gold', 'RESTAURANT')).toBe('Restaurant Scale')
    expect(formatPlanCodeLabel(null)).toBe('-')
    expect(formatPlanCodeLabel('custom-plan')).toBe('custom-plan')
  })

  it('hides supplier-only limits from restaurant tenants and vice versa', () => {
    const keys = [
      'promotions',
      'deal_redemptions_per_day',
      'users',
      'active_customer_locations_monthly',
    ]
    expect(filterAdminLimitKeys(keys, 'RESTAURANT')).not.toContain('promotions')
    expect(filterAdminLimitKeys(keys, 'RESTAURANT')).not.toContain(
      'active_customer_locations_monthly'
    )
    expect(filterAdminLimitKeys(keys, 'RESTAURANT')).toContain('deal_redemptions_per_day')
    expect(filterAdminLimitKeys(keys, 'SUPPLIER')).not.toContain('deal_redemptions_per_day')
    expect(filterAdminLimitKeys(keys, 'SUPPLIER')).toContain('promotions')
    expect(filterAdminLimitKeys(keys, 'SUPPLIER')).toContain('active_customer_locations_monthly')
    expect(filterAdminLimitKeys(keys, 'SUPPLIER')).toContain('users')
  })

  it('renders unlimited limit values', () => {
    expect(formatLimitValue(-1)).toBe('Unlimited')
    expect(formatLimitValue(null)).toBe('Unlimited')
    expect(formatLimitValue(25)).toBe('25')
  })

  it('labels add-on keys', () => {
    expect(formatAddonKeyLabel('supplier_extra_warehouse')).toBe('Extra warehouse')
    expect(formatAddonKeyLabel('supplier_active_customer_locations_50')).toBe(
      '50 active customer locations'
    )
    expect(formatAddonKeyLabel('unknown_addon')).toBe('unknown_addon')
  })
})
