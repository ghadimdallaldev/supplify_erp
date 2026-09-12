import { describe, expect, it } from 'vitest'
import { parsePlanFeaturesJson, parsePlanLimitsJson } from './adminPlanJsonParse'

describe('adminPlanJsonParse', () => {
  it('preserves -1 and integers in limits', () => {
    const limits = parsePlanLimitsJson(
      JSON.stringify({ branches: -1, users: 15, chats_per_day: 10 })
    )
    expect(limits.branches).toBe(-1)
    expect(limits.users).toBe(15)
    expect(limits.chats_per_day).toBe(10)
  })

  it('preserves booleans and tier strings in features', () => {
    const features = parsePlanFeaturesJson(
      JSON.stringify({
        reports: 'basic_kpis',
        fulfillment_tools: false,
        chat: true,
      })
    )
    expect(features.reports).toBe('basic_kpis')
    expect(features.fulfillment_tools).toBe(false)
    expect(features.chat).toBe(true)
  })

  it('rejects empty feature strings', () => {
    expect(() => parsePlanFeaturesJson(JSON.stringify({ reports: '' }))).toThrow(/empty string/)
  })
})
