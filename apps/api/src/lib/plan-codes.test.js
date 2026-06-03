import { describe, expect, it } from 'vitest'
import { formatPlanDisplayName, normalizePlanCode, PLAN_TIER_ORDER } from './plan-codes.js'

describe('plan-codes', () => {
  it('maps free code to Free Trial label', () => {
    expect(formatPlanDisplayName('free', 'Free')).toBe('Free Trial')
    expect(formatPlanDisplayName('FREE')).toBe('Free Trial')
  })

  it('maps silver and legacy bronze alias', () => {
    expect(formatPlanDisplayName('silver')).toBe('Silver')
    expect(normalizePlanCode('bronze')).toBe('silver')
    expect(formatPlanDisplayName('bronze', 'Bronze')).toBe('Silver')
  })

  it('preserves Gold and Platinum names', () => {
    expect(formatPlanDisplayName('gold', 'Gold')).toBe('Gold')
    expect(formatPlanDisplayName('platinum', 'Platinum')).toBe('Platinum')
  })

  it('tier order excludes enterprise', () => {
    expect(PLAN_TIER_ORDER).toEqual(['free', 'silver', 'gold', 'platinum'])
    expect(PLAN_TIER_ORDER).not.toContain('enterprise')
  })
})
