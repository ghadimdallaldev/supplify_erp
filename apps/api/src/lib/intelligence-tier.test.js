import { describe, expect, it } from 'vitest'

import {
  INTELLIGENCE_TIER_ORDER,
  meetsIntelligenceTier,
  resolveIntelligenceCapabilities,
} from './intelligence-tier.js'

describe('resolveIntelligenceCapabilities', () => {
  it('maps the launch plan values onto tiers', () => {
    expect(resolveIntelligenceCapabilities('basic').tier).toBe('basic')
    expect(resolveIntelligenceCapabilities('advanced').tier).toBe('advanced')
    expect(resolveIntelligenceCapabilities('scale').tier).toBe('scale')
  })

  it('fails closed for absent and explicitly disabled values', () => {
    for (const value of [undefined, null, false, '', 'false', 'disabled']) {
      const resolved = resolveIntelligenceCapabilities(value)
      expect(resolved.tier, `${String(value)} must resolve to none`).toBe('none')
      expect(resolved.enabled).toBe(false)
      expect(resolved.capabilities.basicSignals).toBe(false)
    }
  })

  it('treats a bare enabled value as the entry tier rather than full scale', () => {
    // A plan that turns the key on without naming a tier must not silently
    // unlock cross-location insight.
    const resolved = resolveIntelligenceCapabilities(true)
    expect(resolved.tier).toBe('basic')
    expect(resolved.capabilities.crossLocation).toBe(false)
  })

  it('is case and whitespace tolerant on plan JSON values', () => {
    expect(resolveIntelligenceCapabilities('  Scale ').tier).toBe('scale')
  })

  it('gates capabilities cumulatively up the ladder', () => {
    const growth = resolveIntelligenceCapabilities('basic').capabilities
    expect(growth).toEqual({ basicSignals: true, advancedSignals: false, crossLocation: false })

    const intelligence = resolveIntelligenceCapabilities('advanced').capabilities
    expect(intelligence).toEqual({
      basicSignals: true,
      advancedSignals: true,
      crossLocation: false,
    })

    const scale = resolveIntelligenceCapabilities('scale').capabilities
    expect(scale).toEqual({ basicSignals: true, advancedSignals: true, crossLocation: true })
  })

  it('never implies the conversational assistant', () => {
    // ai_assistant is a separate entitlement; nothing here may stand in for it.
    const scale = resolveIntelligenceCapabilities('scale')
    expect(Object.keys(scale.capabilities)).not.toContain('assistant')
    expect(Object.keys(scale.capabilities)).not.toContain('aiAssistant')
  })
})

describe('meetsIntelligenceTier', () => {
  it('compares tiers by rank, not equality', () => {
    expect(meetsIntelligenceTier('scale', 'advanced')).toBe(true)
    expect(meetsIntelligenceTier('advanced', 'advanced')).toBe(true)
    expect(meetsIntelligenceTier('basic', 'advanced')).toBe(false)
    expect(meetsIntelligenceTier(false, 'basic')).toBe(false)
  })

  it('orders tiers low to high', () => {
    expect(INTELLIGENCE_TIER_ORDER).toEqual(['none', 'basic', 'advanced', 'scale'])
  })
})
