import { describe, expect, it } from 'vitest'
import {
  sanitizeMonetizationPlanLabel,
  sanitizeMonetizationRecommendedPlans,
} from './monetizationPlanLabels'

describe('monetization plan labels', () => {
  it('uses the Restaurant Growth, Intelligence, Scale ladder', () => {
    expect(sanitizeMonetizationPlanLabel('silver', 'RESTAURANT')).toBe('Growth')
    expect(sanitizeMonetizationPlanLabel('gold', 'RESTAURANT')).toBe('Intelligence')
    expect(sanitizeMonetizationPlanLabel('platinum', 'RESTAURANT')).toBe('Scale')
  })

  it('uses the Supplier Growth and Scale ladder', () => {
    expect(sanitizeMonetizationPlanLabel('gold', 'SUPPLIER')).toBe('Growth')
    expect(sanitizeMonetizationPlanLabel('platinum', 'SUPPLIER')).toBe('Scale')
  })

  it('does not guess the tenant-specific meaning of gold', () => {
    expect(sanitizeMonetizationPlanLabel('gold')).toBe('gold')
    expect(sanitizeMonetizationRecommendedPlans(['gold', 'platinum'], 'SUPPLIER')).toEqual([
      'Growth',
      'Scale',
    ])
  })
})
