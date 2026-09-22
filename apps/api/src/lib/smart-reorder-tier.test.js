import { describe, it, expect } from 'vitest'
import {
  resolveSmartReorderCapabilities,
  forecastModelTierForFeature,
} from './smart-reorder-tier.js'

describe('smart-reorder-tier', () => {
  it('returns off when feature disabled', () => {
    const caps = resolveSmartReorderCapabilities(false)
    expect(caps.enabled).toBe(false)
    expect(caps.capabilities.forecast).toBe(false)
  })

  it('maps full_90day_trends to gold capabilities', () => {
    const caps = resolveSmartReorderCapabilities('full_90day_trends')
    expect(caps.tier).toBe('gold')
    expect(caps.capabilities.forecast90d).toBe(true)
    expect(caps.capabilities.seasonality).toBe(false)
    expect(forecastModelTierForFeature('full_90day_trends')).toBe('gold')
  })

  it('maps ai_forecast_seasonality to platinum capabilities', () => {
    const caps = resolveSmartReorderCapabilities('ai_forecast_seasonality')
    expect(caps.tier).toBe('platinum')
    expect(caps.capabilities.seasonality).toBe(true)
    expect(caps.capabilities.trendAdjustment).toBe(true)
    expect(forecastModelTierForFeature('ai_forecast_seasonality')).toBe('platinum')
  })
})

describe('matrix alignment (migration 0215)', () => {
  it('maps the Growth value to assistance without forecasting', () => {
    // Growth is "basic reorder suggestions" in the launch matrix. Forecasting,
    // stockout prediction and smart quantities start at Intelligence.
    const caps = resolveSmartReorderCapabilities('suggestions_only')
    expect(caps.enabled).toBe(true)
    expect(caps.tier).toBe('basic')
    expect(caps.capabilities).toEqual({
      assistance: true,
      forecast: false,
      forecast90d: false,
      seasonality: false,
      trendAdjustment: false,
    })
  })

  it('keeps forecasting on the Intelligence and Scale value', () => {
    const caps = resolveSmartReorderCapabilities('ai_forecast_seasonality')
    expect(caps.capabilities.forecast).toBe(true)
    expect(caps.capabilities.seasonality).toBe(true)
  })

  it('does not persist a forecast model tier for the Growth value', () => {
    expect(forecastModelTierForFeature('suggestions_only')).toBeNull()
    expect(forecastModelTierForFeature('ai_forecast_seasonality')).toBe('platinum')
  })
})
