import { query } from '../db.js'
import { getCache, setCache } from '../cache.js'
import { singleflight } from '../singleflight.js'
import { normalizePlanCode } from '../plan-codes.js'

const GOLD_FEATURES_CACHE_TTL = 300

function goldFeaturesCacheKey(tenantType) {
  return `plan:gold:features:${tenantType}`
}

/**
 * Gold plan feature JSON for a tenant type (cached).
 * @param {'RESTAURANT'|'SUPPLIER'} tenantType
 */
export async function getGoldPlanFeatures(tenantType) {
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

/**
 * Free Trial (DB plan code `free`) keeps Gold feature gates; only limits differ (0112/0145).
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
  return getGoldPlanFeatures(tenantType)
}
