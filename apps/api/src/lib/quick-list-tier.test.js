import { describe, it, expect } from 'vitest'
import {
  resolveQuickListCapabilities,
  hasQuickListCapability,
  isQuickListSchedulingEnabled,
} from './quick-list-tier.js'

describe('quick-list-tier', () => {
  it('returns off when feature disabled', () => {
    const caps = resolveQuickListCapabilities(false)
    expect(caps.enabled).toBe(false)
    expect(caps.capabilities.scheduling).toBe(false)
    expect(caps.capabilities.aiSuggest).toBe(false)
  })

  it('maps automated_weekly to silver scheduling only', () => {
    const caps = resolveQuickListCapabilities('automated_weekly')
    expect(caps.tier).toBe('silver')
    expect(caps.capabilities.scheduling).toBe(true)
    expect(caps.capabilities.fullSchedule).toBe(false)
    expect(caps.capabilities.aiQuantityAdjust).toBe(false)
  })

  it('maps full_90day_trends alias full_schedule to gold', () => {
    const caps = resolveQuickListCapabilities('full_schedule')
    expect(caps.tier).toBe('gold')
    expect(caps.capabilities.fullSchedule).toBe(true)
    expect(caps.capabilities.aiSuggest).toBe(false)
  })

  it('maps ai_smart_automation to platinum AI capabilities', () => {
    const caps = resolveQuickListCapabilities('ai_smart_automation')
    expect(caps.tier).toBe('platinum')
    expect(caps.capabilities.aiQuantityAdjust).toBe(true)
    expect(caps.capabilities.aiSuggest).toBe(true)
    expect(hasQuickListCapability('ai_smart_automation', 'aiSuggest')).toBe(true)
  })

  it('isQuickListSchedulingEnabled matches silver+', () => {
    expect(isQuickListSchedulingEnabled('automated_weekly')).toBe(true)
    expect(isQuickListSchedulingEnabled('basic_manual_only')).toBe(false)
  })
})
