import { query } from '../db.js'
import { getCache, setCache } from '../cache.js'
import { singleflight } from '../singleflight.js'
import { normalizePlanCode } from '../plan-codes.js'

const GOLD_FEATURES_CACHE_TTL = 300
const TRIAL_TARGET_PLAN_CACHE_TTL = 300

function goldFeaturesCacheKey(tenantType) {
  return `plan:gold:features:${tenantType}`
}

function trialTargetPlanCacheKey(subscription, tenantType) {
  const id = subscription?.trial_target_plan_id || 'default'
  return `plan:trial-target:${tenantType}:${id}`
}

/**
 * Default paid-plan feature JSON for a tenant type (cached). Legacy fallback only.
 * @param {'RESTAURANT'|'SUPPLIER'} tenantType
 */
export async function getDefaultPaidTrialPlanFeatures(tenantType) {
  const cacheKey = goldFeaturesCacheKey(tenantType)
  const cached = await getCache(cacheKey)
  if (cached !== null) return cached

  return singleflight(cacheKey, async () => {
    const again = await getCache(cacheKey)
    if (again !== null) return again

    const { rows } = await query(
      `SELECT features FROM subscription_plan
       WHERE code = 'gold' AND tenant_type = $1 AND is_active = true
       LIMIT 1`,
      [tenantType]
    )
    const features =
      rows[0]?.features && typeof rows[0].features === 'object' ? rows[0].features : {}
    await setCache(cacheKey, features, GOLD_FEATURES_CACHE_TTL).catch(() => {})
    return features
  })
}

export async function getTrialTargetPlan(subscription) {
  if (!subscription) return null
  const planCode = normalizePlanCode(subscription.plan_code || 'free')
  const tenantType = subscription.plan_tenant_type || subscription.tenant_type
  if (planCode !== 'free' || !tenantType) return null

  const cacheKey = trialTargetPlanCacheKey(subscription, tenantType)
  const cached = await getCache(cacheKey)
  if (cached !== null) return cached === 'null' ? null : cached

  return singleflight(cacheKey, async () => {
    const again = await getCache(cacheKey)
    if (again !== null) return again === 'null' ? null : again

    const params = []
    let where
    if (subscription.trial_target_plan_id) {
      params.push(subscription.trial_target_plan_id, tenantType)
      where = 'id = $1 AND tenant_type = $2'
    } else {
      params.push(tenantType, tenantType === 'RESTAURANT' ? 'silver' : 'gold')
      where = 'tenant_type = $1 AND code = $2 AND is_active = true'
    }

    const { rows } = await query(
      `SELECT id, code, name, description, features, limits, price_per_month, price_per_year
       FROM subscription_plan
       WHERE ${where}
       LIMIT 1`,
      params
    )
    const plan = rows[0] || null
    await setCache(cacheKey, plan ?? 'null', TRIAL_TARGET_PLAN_CACHE_TTL).catch(() => {})
    return plan
  })
}

/**
 * Free Trial (DB plan code `free`) mirrors the selected/default paid trial target.
 * @param {Record<string, unknown>|null|undefined} subscription
 * @returns {Promise<Record<string, unknown>>}
 */
export async function resolveEffectivePlanFeatures(subscription) {
  if (!subscription) return {}
  const raw =
    subscription.features && typeof subscription.features === 'object' ? subscription.features : {}
  const planCode = normalizePlanCode(subscription.plan_code || 'free')
  const tenantType = subscription.plan_tenant_type || subscription.tenant_type
  if (planCode !== 'free' || !tenantType) return raw

  const targetPlan = await getTrialTargetPlan(subscription)
  if (targetPlan?.features && typeof targetPlan.features === 'object') return targetPlan.features
  return getDefaultPaidTrialPlanFeatures(tenantType)
}
