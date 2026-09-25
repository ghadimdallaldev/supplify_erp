/**
 * Operational intelligence entitlement.
 *
 * `intelligence` is a tiered plan value, not a boolean, so one key can express
 * the whole launch matrix without hard-coding plan codes anywhere:
 *
 *   Restaurant Growth (silver)      -> "basic"
 *   Restaurant Intelligence (gold)  -> "advanced"
 *   Restaurant Scale (platinum)     -> "scale"
 *   Supplier Growth (gold)          -> "basic"
 *   Supplier Scale (platinum)       -> "scale"
 *
 * This gates deterministic intelligence only. The conversational assistant is a
 * separate `ai_assistant` entitlement (see lib/ai-platform.js) and is never
 * implied by any intelligence tier.
 */
import { evaluatePlanFeatureValue, resolveAllFeaturesForTenant } from './feature-flags.js'
import { ForbiddenError } from '../middlewares/errorHandler.js'

/** @typedef {'none' | 'basic' | 'advanced' | 'scale'} IntelligenceTier */

/** Ascending order; index is the comparison rank. */
export const INTELLIGENCE_TIER_ORDER = Object.freeze(['none', 'basic', 'advanced', 'scale'])

/**
 * @param {unknown} featureValue plan feature JSON value for `intelligence`
 * @returns {{ enabled: boolean, tier: IntelligenceTier, rawValue: unknown, capabilities: Record<string, boolean> }}
 */
export function resolveIntelligenceCapabilities(featureValue) {
  const on = evaluatePlanFeatureValue(featureValue)
  const raw = typeof featureValue === 'string' ? featureValue.trim().toLowerCase() : featureValue

  /** @type {IntelligenceTier} */
  let tier = 'none'
  if (on) {
    // A plan that enables the key without naming a tier gets the entry tier.
    if (raw === 'scale') tier = 'scale'
    else if (raw === 'advanced') tier = 'advanced'
    else tier = 'basic'
  }

  const atLeast = (min) =>
    INTELLIGENCE_TIER_ORDER.indexOf(tier) >= INTELLIGENCE_TIER_ORDER.indexOf(min)

  return {
    enabled: tier !== 'none',
    tier,
    rawValue: featureValue ?? false,
    capabilities: {
      // Growth: deterministic signals over data the tenant already has.
      basicSignals: atLeast('basic'),
      // Intelligence: forecasting, cost/price impact, anomaly and waste analysis.
      advancedSignals: atLeast('advanced'),
      // Scale: cross-branch / cross-warehouse comparison and transfer hints.
      crossLocation: atLeast('scale'),
    },
  }
}

/**
 * @param {unknown} featureValue
 * @param {IntelligenceTier} minTier
 */
export function meetsIntelligenceTier(featureValue, minTier) {
  const { tier } = resolveIntelligenceCapabilities(featureValue)
  return INTELLIGENCE_TIER_ORDER.indexOf(tier) >= INTELLIGENCE_TIER_ORDER.indexOf(minTier)
}

/**
 * Resolve the tenant's effective tier through the normal entitlement stack, so
 * tenant overrides and global kill-switches apply exactly as they do elsewhere.
 * @param {string} tenantId
 * @param {string} tenantType
 */
export async function getIntelligenceTierForTenant(tenantId, tenantType) {
  if (!tenantId || !tenantType) return resolveIntelligenceCapabilities(false)

  // Dynamic imports mirror feature-flags.js and keep this out of the
  // subscription <-> feature-flag import cycle.
  const { getTenantSubscription } = await import('./subscription.js')
  const { resolveEffectivePlanFeatures } = await import(
    './subscription/free-trial-plan-features.js'
  )

  const subscription = await getTenantSubscription(tenantId, tenantType)
  const planFeatures = await resolveEffectivePlanFeatures(subscription)

  // resolveAllFeaturesForTenant applies tenant overrides and global flags and
  // preserves the tier string when the key is on, so an admin who switches
  // `intelligence` off cannot be overridden by the plan JSON.
  const { features } = await resolveAllFeaturesForTenant(tenantId, tenantType, planFeatures)
  return resolveIntelligenceCapabilities(features?.intelligence)
}

/**
 * Express guard for deterministic intelligence endpoints.
 *
 * Intentionally additive: callers must still apply their own RBAC permission
 * and tenant-scoping middleware. Entitlement is not authorization.
 *
 * @param {IntelligenceTier} minTier
 */
export function requireIntelligenceTier(minTier) {
  return async function intelligenceTierGuard(req, res, next) {
    try {
      const tenantId = req.tenantContext?.tenantId
      const tenantType = req.tenantContext?.tenantType
      const { tier } = await getIntelligenceTierForTenant(tenantId, tenantType)

      if (INTELLIGENCE_TIER_ORDER.indexOf(tier) < INTELLIGENCE_TIER_ORDER.indexOf(minTier)) {
        throw new ForbiddenError(
          `This insight requires the ${minTier} operational intelligence tier`
        )
      }
      return next()
    } catch (error) {
      return next(error)
    }
  }
}
