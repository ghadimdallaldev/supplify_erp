import { query, withTransaction } from '../db.js'
import { logger } from '../logger.js'
import { resolveAllFeaturesForTenant } from '../feature-flags.js'
import { createPendingActivationSubscription } from '../billing/subscription-activation.js'
import { getCache, setCache, deleteCache } from '../cache.js'
import { singleflight } from '../singleflight.js'
import { startStage, mark, noteCacheHit, noteCacheMiss } from '../../middlewares/request-timing.js'
import {
  RESTAURANT_LIMIT_KEYS,
  SUPPLIER_LIMIT_KEYS,
  resolveEffectiveLimit,
  resolveAllEffectiveLimits,
  discoverLimitKeys,
  limitKeysForTenantType,
  fillMissingFreeTierLimits,
  stripHiddenEntitlementLimits,
  HIDDEN_ENTITLEMENT_LIMIT_KEYS,
  isLimitKeyApplicable,
} from '../limit-resolution.js'
import { PLAN_TIER_ORDER, normalizePlanCode, formatPlanDisplayName } from '../plan-codes.js'
import { countActiveBranchLocations, countActiveWarehouses } from '../plan-enforcement.js'
import { getWarehouseSupplierColumn } from '../warehouse-helpers.js'
import { resolveOrgBillingTenantId } from '../org-billing-tenant.js'
import {
  addonKeyForLimitKey,
  computeEffectiveWithAddons,
  ENTERPRISE_BRANCH_THRESHOLD,
  getActiveTenantAddons,
} from '../subscription-addons.js'
import { getEntitlements, invalidateEntitlementsCache } from './entitlements.js'

/** Plan limits with Free-tier fallbacks applied before enforcement. */
function getEnforcementPlanLimits(subscription, tenantType) {
  const limits = { ...(subscription.limits || {}) }
  fillMissingFreeTierLimits(limits, tenantType, subscription.plan_code)
  return limits
}

/** Cache TTL for subscription data (seconds). Short enough to absorb burst traffic while staying fresh. */
const SUBSCRIPTION_CACHE_TTL = 180

/** Build a consistent cache key for a tenant subscription. */
function subscriptionCacheKey(tenantId, tenantType) {
  return 'sub:' + tenantType + ':' + tenantId
}

/**
 * Ensure tenant has an active subscription; if none, create one with the free plan.
 * Used so suppliers and restaurants never hit "no subscription" (0/0 limits).
 * Run migration 0048 to backfill existing tenants; this handles new tenants created after.
 */
async function ensureTenantSubscription(tenantId, tenantType) {
  const { rows: plans } = await query(
    `SELECT id, name, code FROM subscription_plan WHERE code = 'free' AND tenant_type = $1 AND is_active = true LIMIT 1`,
    [tenantType]
  )
  if (plans.length === 0) {
    logger.warn(
      'No Free plan found for tenant_type; run migration 0048 or seed subscription_plan',
      {
        tenantId,
        tenantType,
      }
    )
    return
  }
  const { rows: existing } = await query(
    `SELECT 1 FROM subscription
     WHERE tenant_id = $1 AND tenant_type = $2 AND status IN ('TRIALING', 'ACTIVE')
     LIMIT 1`,
    [tenantId, tenantType]
  )
  if (existing.length > 0) return

  await createPendingActivationSubscription(query, tenantId, tenantType, 'free')
  logger.info('Created pending-activation Free subscription for tenant', {
    tenantId,
    tenantType,
    plan: 'free',
  })
}

/**
 * Get tenant's active subscription
 * @param {string} tenantId - Tenant ID (supplier or restaurant)
 * @param {string} tenantType - 'SUPPLIER' or 'RESTAURANT'
 * @returns {Promise<Object|null>} Subscription with plan details
 */
export async function getTenantSubscription(tenantId, tenantType, options = {}) {
  const { skipOrgBilling = false } = options
  const billingTenantId = skipOrgBilling
    ? tenantId
    : await resolveOrgBillingTenantId(tenantId, tenantType)

  // Check cache first - avoids repeated DB hits on hot paths (requireFeature, checkLimit, etc.)
  const cacheKey = subscriptionCacheKey(billingTenantId, tenantType)
  const cached = await getCache(cacheKey)
  if (cached !== null) return cached

  return singleflight(cacheKey, async () => {
    const again = await getCache(cacheKey)
    if (again !== null) return again

    try {
      try {
        const { rows: subRows } = await query(
          `SELECT id, plan_id, pending_plan_id, pending_effective_at FROM subscription
         WHERE tenant_id = $1 AND tenant_type = $2 AND status IN ('TRIALING', 'ACTIVE') ORDER BY created_at DESC LIMIT 1`,
          [billingTenantId, tenantType]
        )
        if (subRows.length > 0) {
          const sub = subRows[0]
          if (
            sub.pending_plan_id &&
            sub.pending_effective_at &&
            new Date(sub.pending_effective_at) <= new Date()
          ) {
            const { rows: planRows } = await query(
              'SELECT id, name, code FROM subscription_plan WHERE id = $1',
              [sub.pending_plan_id]
            )
            if (planRows.length > 0) {
              const newPlan = planRows[0]
              const { rows: oldPlan } = await query(
                'SELECT code FROM subscription_plan WHERE id = $1',
                [sub.plan_id]
              )
              await query(
                `UPDATE subscription SET plan_id = $1, plan_name = $2, previous_plan_code = $3, pending_plan_id = NULL, pending_effective_at = NULL, updated_at = now() WHERE id = $4`,
                [sub.pending_plan_id, newPlan.name, oldPlan[0]?.code || null, sub.id]
              )
            }
          }
        }
      } catch (e) {
        // Skip if columns missing (migration not run) or any error in pending-apply logic
      }

      let { rows } = await query(
        `
      SELECT s.*, sp.limits, sp.features, sp.name as plan_display_name, sp.code as plan_code,
        sp.price_per_month as plan_price_per_month, sp.price_per_year as plan_price_per_year, sp.tenant_type as plan_tenant_type
      FROM subscription s
      JOIN subscription_plan sp ON sp.id = s.plan_id
      WHERE s.tenant_id = $1 
        AND s.tenant_type = $2
        AND s.status IN ('TRIALING', 'ACTIVE')
      ORDER BY s.created_at DESC
      LIMIT 1
    `,
        [billingTenantId, tenantType]
      )

      if (rows.length === 0) {
        await ensureTenantSubscription(billingTenantId, tenantType)
        const result = await query(
          `
        SELECT s.*, sp.limits, sp.features, sp.name as plan_display_name, sp.code as plan_code,
          sp.price_per_month as plan_price_per_month, sp.price_per_year as plan_price_per_year, sp.tenant_type as plan_tenant_type
        FROM subscription s
        JOIN subscription_plan sp ON sp.id = s.plan_id
        WHERE s.tenant_id = $1 
          AND s.tenant_type = $2
          AND s.status IN ('TRIALING', 'ACTIVE')
        ORDER BY s.created_at DESC
        LIMIT 1
      `,
          [billingTenantId, tenantType]
        )
        rows = result.rows
      }

      const result = rows[0] || null
      // Populate cache (TTL=30s). On cache miss (null result), do NOT cache — tenant may have
      // just been created and ensureTenantSubscription will retry on next call.
      if (result !== null) {
        await setCache(cacheKey, result, SUBSCRIPTION_CACHE_TTL).catch(() => {})
      }
      return result
    } catch (error) {
      logger.error('Get tenant subscription error', { error: error.message })
      return null
    }
  })
}

/**
 * Invalidate the in-process/Redis cache for a tenant's subscription.
 * Call this whenever a subscription is activated, upgraded, or cancelled.
 */
export async function invalidateTenantSubscriptionCache(tenantId, tenantType) {
  await deleteCache(subscriptionCacheKey(tenantId, tenantType)).catch(() => {})
  await invalidateEntitlementsCache(tenantId, tenantType)
  const { invalidateBillingSubscriptionCache } = await import('../billing/billing-service.js')
  await invalidateBillingSubscriptionCache(tenantId, tenantType)
}

/** Default front-route for upgrade CTA (monetization UX) */
const DEFAULT_UPGRADE_PATH = '/app/settings?tab=subscription'

/** Plan & usage tab in settings for a tenant type */
export function getUpgradePathForTenant(tenantType) {
  return tenantType === 'SUPPLIER' ? '/app/settings?tab=plan' : DEFAULT_UPGRADE_PATH
}

/** Plan codes in tier order (free < silver < gold < platinum); exclude enterprise for self-serve */
const PLAN_ORDER = [...PLAN_TIER_ORDER]

/** Reason codes for deterministic, explainable recommendations */
const REASON_CODES = {
  CURRENT_BEST: 'CURRENT_BEST',
  FREE_DEFAULT: 'FREE_DEFAULT',
  NEAR_LIMIT: 'NEAR_LIMIT',
  LIMIT_EXCEEDED: 'LIMIT_EXCEEDED',
  FEATURE_BLOCKED: 'FEATURE_BLOCKED',
  MULTIPLE_BLOCKS: 'MULTIPLE_BLOCKS',
}

/**
 * Recommend a plan: deterministic, explainable. Always returns a result.
 * Picks lowest plan that resolves the issue; Free with no issue → Gold. If current is best → CURRENT_BEST.
 * @param {Object} opts
 * @param {string} opts.tenantId - Tenant ID
 * @param {string} opts.tenantType - 'RESTAURANT' | 'SUPPLIER'
 * @param {Array<{type: string, key: string}>} [opts.blockedEvents] - Optional list of { type: 'FEATURE'|'LIMIT', key }
 * @returns {Promise<Object>} recommendation with recommendedPlanCode, recommendedPlanName, reasonCode, reasonText, evidence, comparedToCurrent
 */
export async function recommendPlan({ tenantId, tenantType, blockedEvents = [] }) {
  const limitKeys =
    tenantType === 'RESTAURANT' ? [...RESTAURANT_LIMIT_KEYS] : [...SUPPLIER_LIMIT_KEYS]
  const entitlements = await getEntitlements(tenantId, tenantType)

  const buildResponse = (
    recommendedPlanCode,
    recommendedPlanName,
    reasonCode,
    reasonText,
    evidence,
    comparedToCurrent
  ) => ({
    recommendedPlanCode,
    recommendedPlanName: recommendedPlanName || recommendedPlanCode,
    reasonCode,
    reasonText,
    evidence,
    comparedToCurrent,
    reason: reasonText,
  })

  if (!entitlements) {
    return buildResponse(
      'gold',
      'Gold',
      REASON_CODES.FREE_DEFAULT,
      'Upgrade to Gold to unlock full platform capabilities.',
      { tenantType, currentPlanCode: 'free', blocked: { limitKeys: [], featureKeys: [] } },
      { resolvesLimits: [], unlocksFeatures: [] }
    )
  }

  const { plan, usage, limits, features } = entitlements
  const currentCode = normalizePlanCode(
    (plan?.code || 'free').toLowerCase().replace('enterprise', 'platinum')
  )
  const currentIndex = PLAN_ORDER.indexOf(currentCode)
  const planRowsRaw = await query(
    `SELECT code, name, limits, features FROM subscription_plan WHERE tenant_type = $1 AND is_active = true ORDER BY display_order, name`,
    [tenantType]
  )
  const planRows = planRowsRaw.rows.filter((p) => PLAN_ORDER.includes(normalizePlanCode(p.code)))
  const planIndex = planRows.findIndex((p) => normalizePlanCode(p.code) === currentCode)
  const effectiveCurrentIndex = planIndex >= 0 ? planIndex : 0

  const limitDetails = []
  const blockedLimitKeys = []
  const blockedFeatureKeys = []
  let triggeredBy = null
  let usageEvidence = null
  const unlocksFeaturesSet = new Set()

  // Blocked events from API (e.g. after 403)
  for (const ev of blockedEvents) {
    if (ev.type === 'LIMIT' && limitKeys.includes(ev.key)) {
      blockedLimitKeys.push(ev.key)
      if (!triggeredBy) triggeredBy = { type: 'limit', key: ev.key }
    }
    if (ev.type === 'FEATURE' && ev.key) {
      blockedFeatureKeys.push(ev.key)
      if (!triggeredBy) triggeredBy = { type: 'feature', key: ev.key }
    }
  }

  // Usage > 80% or over limit → find lowest plan that raises that limit
  for (const key of limitKeys) {
    const used = usage[key] ?? 0
    const cap = limits[key]
    if (cap == null || cap === -1) continue
    const capNum = parseInt(cap)
    if (capNum <= 0) continue
    const pct = (used / capNum) * 100
    const isExceeded = used >= capNum
    const isNear = pct >= 80 && !isExceeded
    if (isExceeded || isNear) {
      if (!blockedLimitKeys.includes(key)) blockedLimitKeys.push(key)
      if (!usageEvidence) usageEvidence = { key, value: used, limit: capNum, pct: Math.round(pct) }
      for (let i = effectiveCurrentIndex + 1; i < planRows.length; i++) {
        const p = planRows[i]
        const nextCap = p.limits?.[key]
        const nextVal = nextCap === -1 || nextCap === null ? 999999 : parseInt(nextCap)
        if (nextVal > capNum) {
          limitDetails.push({
            limitKey: key,
            currentUsage: used,
            currentLimit: capNum,
            newLimit: nextVal === 999999 ? null : nextVal,
          })
          break
        }
      }
    }
  }

  const featureKeysToCheck = ['reports', 'smart_reorder', 'multi_branch']
  for (const fk of featureKeysToCheck) {
    if (features[fk]) continue
    let unlockedAbove = false
    for (let i = effectiveCurrentIndex + 1; i < planRows.length; i++) {
      const p = planRows[i]
      const v = p.features?.[fk]
      const enabled = typeof v === 'boolean' ? v : v && v !== 'false' && v !== 'disabled'
      if (enabled) {
        unlockedAbove = true
        unlocksFeaturesSet.add(fk)
        break
      }
    }
    if (unlockedAbove) {
      blockedFeatureKeys.push(fk)
      if (!triggeredBy) triggeredBy = { type: 'feature', key: fk }
    }
  }

  let minRecommendedIndex = effectiveCurrentIndex
  for (const key of blockedLimitKeys) {
    for (let i = effectiveCurrentIndex + 1; i < planRows.length; i++) {
      const p = planRows[i]
      const nextCap = p.limits?.[key]
      const nextVal = nextCap === -1 || nextCap === null ? 999999 : parseInt(nextCap)
      if (nextVal > (limits[key] || 0)) {
        if (i > minRecommendedIndex) minRecommendedIndex = i
        break
      }
    }
  }
  for (const fk of blockedFeatureKeys) {
    for (let i = effectiveCurrentIndex + 1; i < planRows.length; i++) {
      const p = planRows[i]
      const v = p.features?.[fk]
      const enabled = typeof v === 'boolean' ? v : v && v !== 'false' && v !== 'disabled'
      if (enabled) {
        if (i > minRecommendedIndex) minRecommendedIndex = i
        break
      }
    }
  }

  let recommendedIndex = minRecommendedIndex
  if (currentCode === 'free' && minRecommendedIndex <= effectiveCurrentIndex) {
    const goldIdx = planRows.findIndex((p) => normalizePlanCode(p.code) === 'gold')
    recommendedIndex = goldIdx >= 0 ? goldIdx : Math.min(1, planRows.length - 1)
  }
  if (
    recommendedIndex <= effectiveCurrentIndex &&
    (blockedLimitKeys.length || blockedFeatureKeys.length)
  )
    recommendedIndex = effectiveCurrentIndex + 1
  if (recommendedIndex >= planRows.length) recommendedIndex = planRows.length - 1

  const recommended = planRows[recommendedIndex]
  const recommendedPlanCode = normalizePlanCode(recommended?.code || 'gold')
  const recommendedPlanName = formatPlanDisplayName(recommendedPlanCode, recommended?.name)
  const isCurrentBest = recommendedPlanCode === currentCode

  const evidence = {
    tenantType,
    currentPlanCode: currentCode,
    triggeredBy:
      triggeredBy || (usageEvidence ? { type: 'limit', key: usageEvidence.key } : undefined),
    usage: usageEvidence,
    blocked: {
      limitKeys: [...new Set(blockedLimitKeys)],
      featureKeys: [...new Set(blockedFeatureKeys)],
    },
  }

  const recommendedLimits = recommended?.limits || {}
  const resolvesLimits = limitDetails.length
    ? limitDetails
    : blockedLimitKeys.map((key) => ({
        limitKey: key,
        currentUsage: usage[key] ?? 0,
        currentLimit: limits[key] != null ? parseInt(limits[key]) : null,
        newLimit:
          recommendedLimits[key] === -1 || recommendedLimits[key] == null
            ? null
            : parseInt(recommendedLimits[key]),
      }))
  const unlocksFeatures = [...unlocksFeaturesSet]

  let reasonCode = REASON_CODES.CURRENT_BEST
  let reasonText = "You're on the best plan for your usage."
  if (isCurrentBest) {
    return buildResponse(currentCode, plan?.name || 'Current', reasonCode, reasonText, evidence, {
      resolvesLimits: [],
      unlocksFeatures: [],
    })
  }
  const hasLimitExceeded = blockedLimitKeys.some((k) => (usage[k] ?? 0) >= (limits[k] ?? 0))
  const hasNearLimit = usageEvidence && usageEvidence.pct >= 80 && !hasLimitExceeded
  if (blockedLimitKeys.length && blockedFeatureKeys.length)
    reasonCode = REASON_CODES.MULTIPLE_BLOCKS
  else if (hasLimitExceeded) reasonCode = REASON_CODES.LIMIT_EXCEEDED
  else if (hasNearLimit) reasonCode = REASON_CODES.NEAR_LIMIT
  else if (blockedFeatureKeys.length) reasonCode = REASON_CODES.FEATURE_BLOCKED
  else if (currentCode === 'free') reasonCode = REASON_CODES.FREE_DEFAULT

  if (reasonCode === REASON_CODES.LIMIT_EXCEEDED)
    reasonText = `Your usage is at or over limits (${blockedLimitKeys.join(', ')}). Upgrading resolves these.`
  else if (reasonCode === REASON_CODES.NEAR_LIMIT)
    reasonText = `You're near your limit for ${usageEvidence?.key || 'usage'}. Upgrade to avoid being blocked.`
  else if (reasonCode === REASON_CODES.FEATURE_BLOCKED)
    reasonText = `Upgrade to unlock: ${unlocksFeatures.slice(0, 3).join(', ')}.`
  else if (reasonCode === REASON_CODES.MULTIPLE_BLOCKS)
    reasonText = 'You have multiple limits and feature restrictions. Upgrading resolves them.'
  else if (reasonCode === REASON_CODES.FREE_DEFAULT)
    reasonText =
      'Gold is the default plan for real daily usage—unlock more orders, branches, and reports.'
  else reasonText = 'Upgrade to get more capacity and features.'

  return buildResponse(recommendedPlanCode, recommendedPlanName, reasonCode, reasonText, evidence, {
    resolvesLimits,
    unlocksFeatures,
  })
}

/**
 * Get recommended plan names for a tenant type (for error payloads).
 * @param {string} tenantType - RESTAURANT | SUPPLIER
 * @returns {Promise<string[]>} Plan names (e.g. ['Silver', 'Gold', 'Platinum'])
 */
export async function getRecommendedPlanNames(tenantType) {
  try {
    const { rows } = await query(
      `SELECT code, name FROM subscription_plan WHERE tenant_type = $1 AND code != 'free' AND is_active = true ORDER BY display_order, name`,
      [tenantType]
    )
    return rows.map((r) => formatPlanDisplayName(r.code, r.name))
  } catch (e) {
    if (e.code === '42703') return ['Silver', 'Gold', 'Platinum']
    return []
  }
}

/**
 * Build standardized LIMIT_EXCEEDED error payload for monetization UX.
 */
export function buildLimitExceededPayload(
  limitCheck,
  meterType,
  currentPlanName,
  recommendedPlans,
  upgradeUrl,
  tenantType
) {
  const resolvedUpgradeUrl =
    upgradeUrl || (tenantType ? getUpgradePathForTenant(tenantType) : DEFAULT_UPGRADE_PATH)
  return {
    name: 'LIMIT_EXCEEDED',
    message: `You have reached your plan limit for ${meterType}`,
    details: {
      limitKey: meterType,
      limitValue: limitCheck.limit,
      currentUsage: limitCheck.current,
      currentPlan: currentPlanName || null,
      recommendedPlans: recommendedPlans || [],
      upgradeUrl: resolvedUpgradeUrl,
    },
  }
}

/**
 * Whether the plan allows scheduled / automated quick lists (Silver+ tiers).
 */
export function isQuickListAutomationEnabled(featureValue) {
  if (featureValue === true) return true
  if (typeof featureValue === 'string') {
    const v = featureValue.toLowerCase()
    return v !== 'false' && v !== 'disabled' && v !== '' && v !== 'basic_manual_only'
  }
  return false
}

/**
 * Build standardized FEATURE_NOT_AVAILABLE error payload for monetization UX.
 */
export function buildFeatureNotAvailablePayload(
  featureKey,
  currentPlanName,
  requiredPlan,
  recommendedPlans,
  upgradeUrl,
  tenantType
) {
  const resolvedUpgradeUrl =
    upgradeUrl || (tenantType ? getUpgradePathForTenant(tenantType) : DEFAULT_UPGRADE_PATH)
  return {
    name: 'FEATURE_NOT_AVAILABLE',
    message: 'This feature is not available in your current plan',
    details: {
      featureKey,
      currentPlan: currentPlanName || null,
      requiredPlan: requiredPlan || null,
      recommendedPlans: recommendedPlans || [],
      upgradeUrl: resolvedUpgradeUrl,
    },
  }
}
