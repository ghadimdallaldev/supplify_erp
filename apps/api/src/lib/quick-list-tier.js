import { evaluatePlanFeatureValue } from './feature-flags.js'

/** @typedef {'off' | 'silver' | 'gold' | 'platinum'} QuickListTier */

/**
 * Resolve quick_lists plan value into capability flags (no hard-coded plan codes).
 * @param {unknown} featureValue — from plan features JSON or entitlements
 */
export function resolveQuickListCapabilities(featureValue) {
  if (!evaluatePlanFeatureValue(featureValue)) {
    return {
      enabled: false,
      tier: /** @type {QuickListTier} */ ('off'),
      rawValue: featureValue ?? false,
      capabilities: {
        manualLists: false,
        scheduling: false,
        fullSchedule: false,
        aiQuantityAdjust: false,
        aiSuggest: false,
      },
    }
  }

  const raw = typeof featureValue === 'string' ? featureValue.trim().toLowerCase() : featureValue

  /** @type {QuickListTier} */
  let tier = 'gold'
  if (raw === 'basic_manual_only' || raw === 'false' || raw === 'disabled') {
    tier = 'off'
  } else if (raw === 'automated_weekly') {
    tier = 'silver'
  } else if (raw === 'ai_smart_automation') {
    tier = 'platinum'
  } else if (raw === 'full_schedule' || raw === true) {
    tier = 'gold'
  }

  const scheduling = tier !== 'off'
  const fullSchedule = tier === 'gold' || tier === 'platinum'
  const platinum = tier === 'platinum'

  return {
    enabled: scheduling,
    tier,
    rawValue: featureValue,
    capabilities: {
      manualLists: evaluatePlanFeatureValue(featureValue),
      scheduling,
      fullSchedule,
      aiQuantityAdjust: platinum,
      aiSuggest: platinum,
    },
  }
}

/**
 * @param {unknown} featureValue
 * @param {keyof ReturnType<typeof resolveQuickListCapabilities>['capabilities']} capability
 */
export function hasQuickListCapability(featureValue, capability) {
  return resolveQuickListCapabilities(featureValue).capabilities[capability] === true
}

/** Whether scheduled / automated quick lists are allowed for the plan. */
export function isQuickListSchedulingEnabled(featureValue) {
  return resolveQuickListCapabilities(featureValue).capabilities.scheduling
}
