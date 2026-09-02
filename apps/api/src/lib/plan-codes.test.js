import { describe, expect, it } from 'vitest'
import {
  defaultPaidPlanCodeForTenant,
  formatPlanDisplayName,
  formatTenantPlanDisplayName,
  normalizePlanCode,
  PLAN_TIER_ORDER,
} from './plan-codes.js'

describe('plan-codes', () => {
  it('maps free code to 30-day Free Trial label', () => {
    expect(formatPlanDisplayName('free', 'Free')).toBe('30-day Free Trial')
    expect(formatPlanDisplayName('FREE')).toBe('30-day Free Trial')
  })

  it('maps legacy internal tier labels to Growth/Scale labels', () => {
    expect(formatPlanDisplayName('silver')).toBe('Growth')
    expect(normalizePlanCode('bronze')).toBe('silver')
    expect(formatPlanDisplayName('bronze', 'Bronze')).toBe('Growth')
    expect(formatPlanDisplayName('gold', 'Gold')).toBe('Scale')
    expect(formatPlanDisplayName('platinum', 'Platinum')).toBe('Scale')
  })

  it('formats tenant-specific public plan names for preserved internal codes', () => {
    expect(formatTenantPlanDisplayName('silver', 'RESTAURANT', 'Silver')).toBe('Restaurant Growth')
    expect(formatTenantPlanDisplayName('gold', 'RESTAURANT', 'Gold')).toBe('Restaurant Scale')
    expect(formatTenantPlanDisplayName('gold', 'SUPPLIER', 'Gold')).toBe('Supplier Growth')
    expect(formatTenantPlanDisplayName('platinum', 'SUPPLIER', 'Platinum')).toBe('Supplier Scale')
    expect(defaultPaidPlanCodeForTenant('RESTAURANT')).toBe('silver')
    expect(defaultPaidPlanCodeForTenant('SUPPLIER')).toBe('gold')
  })

  it('tier order excludes enterprise', () => {
    expect(PLAN_TIER_ORDER).toEqual(['free', 'silver', 'gold', 'platinum'])
    expect(PLAN_TIER_ORDER).not.toContain('enterprise')
  })
})
