import { evaluatePlanFeatureValue } from './feature-flags.js'

/** @typedef {'off' | 'basic' | 'gold' | 'platinum'} SmartReorderTier */

/**
 * Resolve smart_reorder plan value into capability flags (no hard-coded plan codes).
 * @param {unknown} featureValue — from plan features JSON or entitlements
 */
export function resolveSmartReorderCapabilities(featureValue) {
  if (!evaluatePlanFeatureValue(featureValue)) {
    return {
      enabled: false,
      tier: /** @type {SmartReorderTier} */ ('off'),
      rawValue: featureValue ?? false,
      capabilities: {
        assistance: false,
        forecast: false,
        forecast90d: false,
        seasonality: false,
        trendAdjustment: false,
      },
    }
  }

  const raw = typeof featureValue === 'string' ? featureValue.trim().toLowerCase() : featureValue

  /** @type {SmartReorderTier} */
  let tier = 'basic'
  if (raw === 'ai_forecast_seasonality') {
    tier = 'platinum'
  } else if (raw === 'full_90day_trends' || raw === true) {
    tier = 'gold'
  }

  return {
    enabled: true,
    tier,
    rawValue: featureValue,
    capabilities: {
      assistance: true,
      forecast: tier === 'gold' || tier === 'platinum',
      forecast90d: tier === 'gold' || tier === 'platinum',
      seasonality: tier === 'platinum',
      trendAdjustment: tier === 'platinum',
    },
  }
}

/**
 * @param {unknown} featureValue
 * @param {keyof ReturnType<typeof resolveSmartReorderCapabilities>['capabilities']} capability
 */
export function hasSmartReorderCapability(featureValue, capability) {
  return resolveSmartReorderCapabilities(featureValue).capabilities[capability] === true
}

/**
 * Model tier stored on forecast rows.
 * @param {unknown} featureValue
 * @returns {'gold' | 'platinum' | null}
 */
export function forecastModelTierForFeature(featureValue) {
  const { capabilities, tier } = resolveSmartReorderCapabilities(featureValue)
  if (!capabilities.forecast) return null
  return tier === 'platinum' ? 'platinum' : 'gold'
}
