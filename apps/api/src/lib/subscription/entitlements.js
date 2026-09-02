import { query, withTransaction } from '../db.js'
import { logger } from '../logger.js'
import { resolveAllFeaturesForTenant } from '../feature-flags.js'
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
import {
  PLAN_TIER_ORDER,
  normalizePlanCode,
  formatPlanDisplayName,
  formatTenantPlanDisplayName,
} from '../plan-codes.js'
import { countActiveBranchLocations, countActiveWarehouses } from '../plan-enforcement.js'
import { getWarehouseSupplierColumn } from '../warehouse-helpers.js'
import { resolveOrgBillingTenantId } from '../org-billing-tenant.js'
import {
  addonKeyForLimitKey,
  computeEffectiveWithAddons,
  addonLimitIncrement,
  ENTERPRISE_BRANCH_THRESHOLD,
  getActiveTenantAddons,
} from '../subscription-addons.js'
import {
  countActiveTenantLoginUsers,
  countPendingTenantInvitations,
  isActiveTenantLoginUser,
} from '../user-seat-limits.js'
import {
  getTenantSubscription,
  getRecommendedPlanNames,
  buildLimitExceededPayload,
  buildFeatureNotAvailablePayload,
} from './plans.js'
import { resolveSmartReorderCapabilities } from '../smart-reorder-tier.js'
import { isAiPlatformEnabledForTenant } from '../ai-platform.js'
import { getTrialTargetPlan, resolveEffectivePlanFeatures } from './free-trial-plan-features.js'

export { HIDDEN_ENTITLEMENT_LIMIT_KEYS }
export { normalizePlanCode, formatPlanDisplayName } from '../plan-codes.js'
export { RESTAURANT_LIMIT_KEYS, SUPPLIER_LIMIT_KEYS, discoverLimitKeys }

/** Plan limits with trial-target and Free-tier fallbacks applied before enforcement. */
async function resolveEnforcementPlanLimits(subscription, tenantType) {
  const targetPlan = await getTrialTargetPlan(subscription)
  const sourceLimits =
    targetPlan?.limits && typeof targetPlan.limits === 'object'
      ? targetPlan.limits
      : subscription?.limits
  const limits = { ...(sourceLimits || {}) }
  fillMissingFreeTierLimits(limits, tenantType, subscription?.plan_code)
  return limits
}

const AI_TRIAL_METER_TYPE = 'ai_trial_requests_total'
const AI_TRIAL_TOTAL_LIMITS = { RESTAURANT: 50, SUPPLIER: 100 }

function isFreeTrialSubscription(subscription) {
  return (
    (subscription?.plan_code || '').toLowerCase() === 'free' &&
    Boolean(subscription?.free_sandbox_expires_at)
  )
}

/** Cache TTL for subscription data (seconds). Short enough to absorb burst traffic while staying fresh. */
const SUBSCRIPTION_CACHE_TTL = 180
/** Full entitlements payload (plan, limits, features, usage) - hot path on every app shell load. */
const ENTITLEMENTS_CACHE_TTL = 300
/**
 * Stale-while-revalidate: serve cached entitlements immediately on hit; usage counts may lag
 * until TTL expiry or explicit invalidation (plan/subscription changes). Hits younger than
 * ENTITLEMENTS_FRESH_USAGE_SEC skip usage re-count and return the cached snapshot as-is.
 */
const ENTITLEMENTS_FRESH_USAGE_SEC = 180

function stripEntitlementsCacheMeta(cached) {
  if (!cached || typeof cached !== 'object') return cached
  const { _cachedAt, ...payload } = cached
  return payload
}

/** Build a consistent cache key for a tenant subscription. */
function subscriptionCacheKey(tenantId, tenantType) {
  return 'sub:' + tenantType + ':' + tenantId
}

function entitlementsCacheKey(tenantId, tenantType) {
  return `ent:${tenantType}:${tenantId}`
}

export async function invalidateEntitlementsCache(tenantId, tenantType) {
  await deleteCache(entitlementsCacheKey(tenantId, tenantType)).catch(() => {})
}

export async function isFeatureEnabled(tenantId, tenantType, featureKey) {
  const { isFeatureEnabledForTenant } = await import('../feature-flags.js')
  return isFeatureEnabledForTenant(tenantId, tenantType, featureKey)
}

/**
 * Check if tenant has reached limit (with override support)
 * @param {string} tenantId - Tenant ID
 * @param {string} tenantType - 'SUPPLIER' or 'RESTAURANT'
 * @param {string} meterType - Type of meter (e.g., 'supplier_products_skus', 'restaurant_inventory_skus', 'warehouses')
 * @returns {Promise<{current: number, limit: number|null, isUnlimited: boolean, isOverLimit: boolean, effectiveLimit: number}>}
 */
export async function checkLimit(tenantId, tenantType, meterType) {
  try {
    if (!isLimitKeyApplicable(tenantType, meterType)) {
      return {
        current: 0,
        limit: 0,
        isUnlimited: false,
        isOverLimit: false,
        effectiveLimit: 0,
        notApplicable: true,
      }
    }

    const subscription = await getTenantSubscription(tenantId, tenantType)

    if (!subscription) {
      // No subscription = strict limits
      return {
        current: 0,
        limit: 0,
        isUnlimited: false,
        isOverLimit: true,
        effectiveLimit: 0,
      }
    }

    // Resolve limit: tenant override > plan override > plan default (increase-only)
    const billingTenantId = await resolveOrgBillingTenantId(tenantId, tenantType)
    const planLimits = await resolveEnforcementPlanLimits(subscription, tenantType)
    const resolved = await resolveEffectiveLimit({
      tenantId: billingTenantId,
      tenantType,
      limitKey: meterType,
      planId: subscription.plan_id,
      planLimits,
    })
    const limit = resolved.effectiveLimit
    const isUnlimited = resolved.isUnlimited

    if (isUnlimited) {
      return {
        current: 0,
        limit: null,
        isUnlimited: true,
        isOverLimit: false,
        effectiveLimit: null,
      }
    }

    // Get current usage
    let current = 0
    if (meterType === 'restaurant_inventory_skus' && tenantType === 'RESTAURANT') {
      const { rows: productCount } = await query(
        `
        SELECT COUNT(DISTINCT product_id) as count
        FROM restaurant_inventory
        WHERE restaurant_id = $1
      `,
        [tenantId]
      )
      current = parseInt(productCount[0]?.count || 0)
    } else if (meterType === 'orders_per_day' && tenantType === 'RESTAURANT') {
      // For restaurants, orders_per_day = count of PLACED orders today
      const { rows: orderCount } = await query(
        `
        SELECT COUNT(*) as count
        FROM customer_order
        WHERE restaurant_id = $1
          AND status = 'PLACED'
          AND DATE(placed_at) = CURRENT_DATE
      `,
        [tenantId]
      )
      current = parseInt(orderCount[0]?.count || 0)
    } else if (meterType === 'quick_lists' && tenantType === 'RESTAURANT') {
      const { rows: listCount } = await query(
        `SELECT COUNT(*) as count FROM quick_list WHERE restaurant_id = $1`,
        [tenantId]
      )
      current = parseInt(listCount[0]?.count || 0)
    } else if (meterType === 'quick_list_items' && tenantType === 'RESTAURANT') {
      const { rows: itemCount } = await query(
        `
        SELECT COUNT(*) as count
        FROM quick_list_item qli
        JOIN quick_list ql ON ql.id = qli.quick_list_id
        WHERE ql.restaurant_id = $1
      `,
        [tenantId]
      )
      current = parseInt(itemCount[0]?.count || 0)
    } else if (meterType === 'scheduled_quick_lists' && tenantType === 'RESTAURANT') {
      const { rows: scheduledCount } = await query(
        `SELECT COUNT(*) as count FROM quick_list WHERE restaurant_id = $1 AND is_scheduled = true`,
        [tenantId]
      )
      current = parseInt(scheduledCount[0]?.count || 0)
    } else if (meterType === 'active_customer_locations_monthly' && tenantType === 'SUPPLIER') {
      const activeCustomers = await countSupplierActiveCustomerLocationsMonthly(tenantId)
      current = activeCustomers.count
    } else if (meterType === 'supplier_products_skus' && tenantType === 'SUPPLIER') {
      const { rows: productCount } = await query(
        `
        SELECT COUNT(*) as count
        FROM product
        WHERE supplier_id = $1
      `,
        [tenantId]
      )
      current = parseInt(productCount[0]?.count || 0)
    } else if (meterType === 'drivers' && tenantType === 'SUPPLIER') {
      const { rows: driverCount } = await query(
        `SELECT COUNT(*) as count FROM drivers WHERE supplier_id = $1 AND is_active = true`,
        [tenantId]
      )
      current = parseInt(driverCount[0]?.count || 0)
    } else if (meterType === 'users') {
      current = await countActiveTenantLoginUsers(tenantId, tenantType)
    } else if (meterType === 'open_conversations') {
      if (tenantType === 'RESTAURANT') {
        const { rows: convCount } = await query(
          `
          SELECT COUNT(DISTINCT c.id) AS count
          FROM conversation c
          LEFT JOIN conversation_participant cp
            ON cp.conversation_id = c.id AND cp.participant_type = 'RESTAURANT'
          WHERE c.restaurant_id = $1
            AND (cp.id IS NULL OR cp.is_archived = false)
          `,
          [tenantId]
        )
        current = parseInt(convCount[0]?.count || 0, 10)
      } else {
        const { rows: convCount } = await query(
          `
          SELECT COUNT(DISTINCT c.id) AS count
          FROM conversation c
          LEFT JOIN conversation_participant cp
            ON cp.conversation_id = c.id AND cp.participant_type = 'SUPPLIER'
          WHERE c.supplier_id = $1
            AND (cp.id IS NULL OR cp.is_archived = false)
          `,
          [tenantId]
        )
        current = parseInt(convCount[0]?.count || 0, 10)
      }
    } else if (meterType === 'promotions' && tenantType === 'SUPPLIER') {
      const { rows: promoCount } = await query(
        `SELECT COUNT(*) AS count FROM promotions WHERE supplier_id = $1 AND status <> 'expired'`,
        [tenantId]
      )
      current = parseInt(promoCount[0]?.count || 0, 10)
    } else if (meterType === 'storage_mb') {
      // Cumulative storage: one row per tenant with fixed period
      const { rows: storageRows } = await query(
        `
        SELECT current_value
        FROM usage_meter
        WHERE tenant_id = $1 AND tenant_type = $2 AND meter_type = 'storage_mb'
          AND period_start_date = '2000-01-01'
      `,
        [tenantId, tenantType]
      )
      current = storageRows.length > 0 ? parseInt(storageRows[0].current_value || 0) : 0
    } else {
      // For other metrics, use usage_meter
      // Daily metrics use CURRENT_DATE, cumulative metrics might use different periods
      const { rows: usage } = await query(
        `
        SELECT current_value
        FROM usage_meter
        WHERE tenant_id = $1 
          AND tenant_type = $2 
          AND meter_type = $3
          AND period_start_date = CURRENT_DATE
      `,
        [tenantId, tenantType, meterType]
      )

      current = usage.length > 0 ? parseInt(usage[0].current_value || 0) : 0
    }

    const effectiveLimit = limit

    return {
      current,
      limit: effectiveLimit,
      isUnlimited: effectiveLimit === null,
      isOverLimit: effectiveLimit !== null && current >= effectiveLimit,
      effectiveLimit,
    }
  } catch (error) {
    logger.error('Check limit error:', error)
    // Fail closed for countable meters - do not treat DB errors as unlimited
    return {
      current: 0,
      limit: 0,
      isUnlimited: false,
      isOverLimit: true,
      effectiveLimit: 0,
      resolutionError: true,
    }
  }
}

async function getScheduledOrderGraceUsed(tenantId) {
  const { rows } = await query(
    `
    SELECT current_value
    FROM usage_meter
    WHERE tenant_id = $1
      AND tenant_type = 'RESTAURANT'
      AND meter_type = 'scheduled_order_grace_per_day'
      AND period_start_date = CURRENT_DATE
  `,
    [tenantId]
  )
  return rows.length > 0 ? parseInt(rows[0].current_value || 0, 10) : 0
}

/**
 * Whether a scheduled quick-list run may create orders when the daily cap is already reached.
 * Free tier may use scheduled_order_grace_per_day (default 1) for overflow orders.
 */
export async function evaluateScheduledOrderLimit(restaurantId, ordersToCreate) {
  const limitCheck = await checkLimit(restaurantId, 'RESTAURANT', 'orders_per_day')
  const subscription = await getTenantSubscription(restaurantId, 'RESTAURANT')
  const graceLimitRaw = subscription?.limits?.scheduled_order_grace_per_day
  const graceLimit =
    graceLimitRaw == null || graceLimitRaw === -1 ? 0 : parseInt(graceLimitRaw, 10) || 0

  if (limitCheck.isUnlimited || limitCheck.limit == null) {
    return {
      allowed: true,
      usesGrace: false,
      excess: 0,
      graceUsed: 0,
      graceLimit,
      limitCheck,
      ordersToCreate,
    }
  }

  const newTotal = limitCheck.current + ordersToCreate
  if (newTotal <= limitCheck.limit) {
    return {
      allowed: true,
      usesGrace: false,
      excess: 0,
      graceUsed: 0,
      graceLimit,
      limitCheck,
      ordersToCreate,
    }
  }

  const excess = newTotal - limitCheck.limit
  const graceUsed = await getScheduledOrderGraceUsed(restaurantId)
  const allowed = graceLimit > 0 && graceUsed + excess <= graceLimit

  return {
    allowed,
    usesGrace: allowed,
    excess,
    graceUsed,
    graceLimit,
    limitCheck,
    ordersToCreate,
  }
}

/**
 * Thrown when a daily meter increment would exceed the effective plan limit.
 */
export class DailyUsageLimitExceededError extends Error {
  constructor(current, limit) {
    super('Daily usage limit exceeded')
    this.name = 'DailyUsageLimitExceededError'
    this.allowed = false
    this.current = current
    this.limit = limit
  }
}

/**
 * Resolve subscription + effective daily limit without opening a usage_meter transaction.
 */
export async function resolveDailyMeterEnforcement(tenantId, tenantType, meterType) {
  const subscription = await getTenantSubscription(tenantId, tenantType)
  return resolveDailyMeterEnforcementFromSubscription(subscription, tenantId, tenantType, meterType)
}

/**
 * Resolve daily meter enforcement when subscription is already loaded (e.g. req.subscription).
 */
export async function resolveDailyMeterEnforcementFromSubscription(
  subscription,
  tenantId,
  tenantType,
  meterType
) {
  if (!subscription) {
    return { subscription: null, resolved: null }
  }
  const billingTenantId = await resolveOrgBillingTenantId(tenantId, tenantType)
  const planLimits = await resolveEnforcementPlanLimits(subscription, tenantType)
  const resolved = await resolveEffectiveLimit({
    tenantId: billingTenantId,
    tenantType,
    limitKey: meterType,
    planId: subscription.plan_id,
    planLimits,
  })
  return { subscription, resolved }
}

/**
 * Increment a daily usage meter inside an existing transaction (row lock + update).
 */
export async function incrementDailyUsageMeterInTransaction(
  client,
  tenantId,
  tenantType,
  meterType,
  increment,
  resolved
) {
  if (!resolved) {
    return { allowed: false, current: 0, limit: 0 }
  }

  const inc = Number(increment) || 0
  if (inc <= 0) return { allowed: true }

  if (resolved.isUnlimited) {
    const { rows } = await client.query(
      `
      INSERT INTO usage_meter (tenant_id, tenant_type, meter_type, current_value, period_type, period_start_date)
      VALUES ($1, $2, $3, $4, 'DAILY', CURRENT_DATE)
      ON CONFLICT (tenant_id, tenant_type, meter_type, period_start_date)
      DO UPDATE SET
        current_value = usage_meter.current_value + EXCLUDED.current_value,
        last_updated = now()
      RETURNING current_value
    `,
      [tenantId, tenantType, meterType, inc]
    )
    return { allowed: true, current: parseInt(rows[0]?.current_value || inc, 10) }
  }

  const effectiveLimit = resolved.effectiveLimit

  await client.query(
    `
      INSERT INTO usage_meter (tenant_id, tenant_type, meter_type, current_value, period_type, period_start_date, limit_value)
      VALUES ($1, $2, $3, 0, 'DAILY', CURRENT_DATE, $4)
      ON CONFLICT (tenant_id, tenant_type, meter_type, period_start_date) DO NOTHING
    `,
    [tenantId, tenantType, meterType, effectiveLimit]
  )

  const { rows: updated } = await client.query(
    `UPDATE usage_meter SET current_value = current_value + $4, last_updated = now(),
        is_over_limit = (current_value + $4) >= $5,
        limit_value = COALESCE(limit_value, $5)
       WHERE tenant_id = $1 AND tenant_type = $2 AND meter_type = $3 AND period_start_date = CURRENT_DATE
         AND current_value + $4 <= $5
       RETURNING current_value`,
    [tenantId, tenantType, meterType, inc, effectiveLimit]
  )

  if (updated.length) {
    return {
      allowed: true,
      current: parseInt(updated[0].current_value, 10),
      limit: effectiveLimit,
    }
  }

  const { rows: locked } = await client.query(
    `SELECT current_value FROM usage_meter
       WHERE tenant_id = $1 AND tenant_type = $2 AND meter_type = $3 AND period_start_date = CURRENT_DATE
       FOR UPDATE`,
    [tenantId, tenantType, meterType]
  )
  const current = locked.length > 0 ? parseInt(locked[0].current_value || 0, 10) : 0
  if (current + inc > effectiveLimit) {
    throw new DailyUsageLimitExceededError(current, effectiveLimit)
  }

  const { rows: retry } = await client.query(
    `UPDATE usage_meter SET current_value = current_value + $4, last_updated = now(),
        is_over_limit = (current_value + $4) >= $5,
        limit_value = COALESCE(limit_value, $5)
       WHERE tenant_id = $1 AND tenant_type = $2 AND meter_type = $3 AND period_start_date = CURRENT_DATE
         AND current_value + $4 <= $5
       RETURNING current_value`,
    [tenantId, tenantType, meterType, inc, effectiveLimit]
  )

  if (!retry.length) {
    throw new DailyUsageLimitExceededError(current, effectiveLimit)
  }

  return {
    allowed: true,
    current: parseInt(retry[0].current_value, 10),
    limit: effectiveLimit,
  }
}

/**
 * Atomic check and increment for daily usage meters (orders_per_day, chats_per_day).
 * Uses transaction + row lock to avoid race conditions. Use this instead of checkLimit + incrementUsage for these meters.
 * @param {string} tenantId - Tenant ID
 * @param {string} tenantType - 'SUPPLIER' or 'RESTAURANT'
 * @param {string} meterType - e.g. 'orders_per_day', 'chats_per_day'
 * @param {number} increment - Amount to add (default: 1)
 * @returns {Promise<{ allowed: boolean, current?: number, limit?: number|null }>}
 */
export async function checkAndIncrementUsage(tenantId, tenantType, meterType, increment = 1) {
  const enforcement = await resolveDailyMeterEnforcement(tenantId, tenantType, meterType)
  if (!enforcement.subscription) {
    return { allowed: false, current: 0, limit: 0 }
  }

  try {
    return await withTransaction(async (client) =>
      incrementDailyUsageMeterInTransaction(
        client,
        tenantId,
        tenantType,
        meterType,
        increment,
        enforcement.resolved
      )
    )
  } catch (err) {
    if (err instanceof DailyUsageLimitExceededError) {
      return { allowed: false, current: err.current, limit: err.limit }
    }
    throw err
  }
}

async function incrementTrialAiUsageInTransaction(
  client,
  tenantId,
  tenantType,
  subscription,
  increment
) {
  const limit = AI_TRIAL_TOTAL_LIMITS[tenantType] ?? 0
  const inc = Number(increment) || 0
  if (inc <= 0) return { allowed: true }

  const periodStart = subscription.current_period_start || subscription.created_at || new Date()
  const periodEnd = subscription.free_sandbox_expires_at || null
  await client.query(
    `INSERT INTO usage_meter (
       tenant_id, tenant_type, meter_type, current_value, period_type,
       period_start_date, period_end_date, limit_value
     ) VALUES ($1, $2, $3, 0, 'Billing Cycle', $4::date, $5::date, $6)
     ON CONFLICT (tenant_id, tenant_type, meter_type, period_start_date) DO NOTHING`,
    [tenantId, tenantType, AI_TRIAL_METER_TYPE, periodStart, periodEnd, limit]
  )

  const { rows: updated } = await client.query(
    `UPDATE usage_meter SET
       current_value = current_value + $5,
       last_updated = now(),
       limit_value = $6,
       is_over_limit = (current_value + $5) >= $6
     WHERE tenant_id = $1
       AND tenant_type = $2
       AND meter_type = $3
       AND period_start_date = $4::date
       AND current_value + $5 <= $6
     RETURNING current_value`,
    [tenantId, tenantType, AI_TRIAL_METER_TYPE, periodStart, inc, limit]
  )

  if (updated.length) {
    return {
      allowed: true,
      current: parseInt(updated[0].current_value, 10),
      limit,
      meterType: AI_TRIAL_METER_TYPE,
      periodType: 'trial_total',
      resetAt: periodEnd ? new Date(periodEnd).toISOString() : null,
      trialPool: true,
    }
  }

  const { rows } = await client.query(
    `SELECT current_value FROM usage_meter
     WHERE tenant_id = $1 AND tenant_type = $2 AND meter_type = $3 AND period_start_date = $4::date
     FOR UPDATE`,
    [tenantId, tenantType, AI_TRIAL_METER_TYPE, periodStart]
  )
  return {
    allowed: false,
    current: parseInt(rows[0]?.current_value || 0, 10),
    limit,
    meterType: AI_TRIAL_METER_TYPE,
    periodType: 'trial_total',
    resetAt: periodEnd ? new Date(periodEnd).toISOString() : null,
    trialPool: true,
  }
}

export async function reserveAiUsage(tenantId, tenantType = 'RESTAURANT', increment = 1) {
  const subscription = await getTenantSubscription(tenantId, tenantType)
  if (!subscription) return { allowed: false, current: 0, limit: 0 }

  if (isFreeTrialSubscription(subscription)) {
    return withTransaction((client) =>
      incrementTrialAiUsageInTransaction(client, tenantId, tenantType, subscription, increment)
    )
  }

  const usage = await checkAndIncrementUsage(tenantId, tenantType, 'ai_requests_per_day', increment)
  return {
    ...usage,
    meterType: 'ai_requests_per_day',
    periodType: 'daily',
    resetAt: new Date(new Date().setUTCHours(24, 0, 0, 0)).toISOString(),
    trialPool: false,
  }
}

export async function refundReservedAiUsage(
  tenantId,
  tenantType = 'RESTAURANT',
  reservation = null,
  decrement = 1
) {
  const meterType = reservation?.meterType || 'ai_requests_per_day'
  const subscription = await getTenantSubscription(tenantId, tenantType)
  const periodStart =
    meterType === AI_TRIAL_METER_TYPE && subscription
      ? subscription.current_period_start || subscription.created_at || new Date()
      : null

  try {
    await query(
      `UPDATE usage_meter
       SET current_value = GREATEST(0, current_value - $5),
           last_updated = now(),
           is_over_limit = CASE
             WHEN limit_value IS NULL THEN false
             ELSE GREATEST(0, current_value - $5) >= limit_value
           END
       WHERE tenant_id = $1
         AND tenant_type = $2
         AND meter_type = $3
         AND period_start_date = COALESCE($4::date, CURRENT_DATE)`,
      [tenantId, tenantType, meterType, periodStart, Math.max(1, Number(decrement) || 1)]
    )
  } catch {
    // Best-effort only; never fail the caller because a refund could not be recorded.
  }
}

export async function getAiUsageSummary(tenantId, tenantType = 'RESTAURANT') {
  const subscription = await getTenantSubscription(tenantId, tenantType)
  if (!subscription) return null

  if (isFreeTrialSubscription(subscription)) {
    const limit = AI_TRIAL_TOTAL_LIMITS[tenantType] ?? 0
    const periodStart = subscription.current_period_start || subscription.created_at || new Date()
    const { rows } = await query(
      `SELECT current_value FROM usage_meter
       WHERE tenant_id = $1 AND tenant_type = $2 AND meter_type = $3 AND period_start_date = $4::date`,
      [tenantId, tenantType, AI_TRIAL_METER_TYPE, periodStart]
    )
    const current = parseInt(rows[0]?.current_value || 0, 10)
    return {
      meterType: AI_TRIAL_METER_TYPE,
      periodType: 'trial_total',
      current,
      limit,
      remaining: Math.max(0, limit - current),
      resetAt: subscription.free_sandbox_expires_at
        ? new Date(subscription.free_sandbox_expires_at).toISOString()
        : null,
      trialPool: true,
    }
  }

  const daily = await checkLimit(tenantId, tenantType, 'ai_requests_per_day')
  return {
    meterType: 'ai_requests_per_day',
    periodType: 'daily',
    current: daily.current,
    limit: daily.limit,
    remaining: daily.limit == null ? null : Math.max(0, daily.limit - daily.current),
    resetAt: new Date(new Date().setUTCHours(24, 0, 0, 0)).toISOString(),
    trialPool: false,
  }
}
/**
 * Increment usage meter
 * @param {string} tenantId - Tenant ID
 * @param {string} tenantType - 'SUPPLIER' or 'RESTAURANT'
 * @param {string} meterType - Type of meter
 * @param {number} increment - Amount to increment (default: 1)
 */
export async function incrementUsage(tenantId, tenantType, meterType, increment = 1) {
  try {
    const subscription = await getTenantSubscription(tenantId, tenantType)
    if (!subscription) return

    const billingTenantId = await resolveOrgBillingTenantId(tenantId, tenantType)
    const planLimits = await resolveEnforcementPlanLimits(subscription, tenantType)
    const resolved = await resolveEffectiveLimit({
      tenantId: billingTenantId,
      tenantType,
      limitKey: meterType,
      planId: subscription.plan_id,
      planLimits,
    })
    const effectiveLimit = resolved.isUnlimited ? null : resolved.effectiveLimit

    await query(
      `
      INSERT INTO usage_meter (tenant_id, tenant_type, meter_type, current_value, period_type, period_start_date, limit_value)
      VALUES ($1, $2, $3, $4, 'DAILY', CURRENT_DATE, $5)
      ON CONFLICT (tenant_id, tenant_type, meter_type, period_start_date)
      DO UPDATE SET 
        current_value = usage_meter.current_value + $4,
        last_updated = now(),
        limit_value = COALESCE(usage_meter.limit_value, $5),
        is_over_limit = CASE 
          WHEN $5 IS NULL THEN false
          ELSE (usage_meter.current_value + $4) >= $5
        END
    `,
      [tenantId, tenantType, meterType, increment, effectiveLimit]
    )

    logger.info('Usage incremented', {
      tenantId,
      tenantType,
      meterType,
      increment,
      newValue: 'N/A',
    })
  } catch (error) {
    logger.error('Increment usage error:', error)
    // Don't throw - usage tracking shouldn't fail operations
  }
}

/** Fixed date for cumulative meters (e.g. storage_mb) - one row per tenant */
const CUMULATIVE_PERIOD_DATE = '2000-01-01'

const SUPPLIER_ACTIVE_CUSTOMER_ORDER_STATUSES = [
  'ACKNOWLEDGED',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'RECEIVED_PARTIAL',
  'RECEIVED_FULL',
  'RECEIVED_WITH_DISPUTE',
  'INVOICED',
  'COMPLETED',
]

async function resolveSupplierActiveCustomerLocationPeriod(supplierId) {
  const { rows } = await query(
    `SELECT current_period_start, current_period_end
     FROM subscription
     WHERE tenant_id = $1 AND tenant_type = 'SUPPLIER' AND status IN ('TRIALING', 'ACTIVE', 'PAST_DUE')
     ORDER BY created_at DESC
     LIMIT 1`,
    [supplierId]
  )
  const sub = rows[0] || null
  if (sub?.current_period_start && sub?.current_period_end) {
    return {
      start: sub.current_period_start,
      end: sub.current_period_end,
      source: 'subscription_period',
      timezone: 'UTC',
    }
  }
  return {
    start: null,
    end: null,
    source: 'calendar_month_utc',
    timezone: 'UTC',
  }
}

export async function countSupplierActiveCustomerLocationsMonthly(supplierId) {
  const period = await resolveSupplierActiveCustomerLocationPeriod(supplierId)
  const params = [supplierId, SUPPLIER_ACTIVE_CUSTOMER_ORDER_STATUSES]
  let periodSql = `date_trunc('month', now() AT TIME ZONE 'UTC') <= COALESCE(o.placed_at, o.created_at)
      AND COALESCE(o.placed_at, o.created_at) < (date_trunc('month', now() AT TIME ZONE 'UTC') + INTERVAL '1 month')`
  if (period.start && period.end) {
    params.push(period.start, period.end)
    periodSql = `COALESCE(o.placed_at, o.created_at) >= $3 AND COALESCE(o.placed_at, o.created_at) < $4`
  }

  const { rows } = await query(
    `SELECT COUNT(DISTINCT COALESCE(o.branch_id, o.restaurant_id)) AS count
     FROM customer_order o
     JOIN order_item oi ON oi.order_id = o.id
     WHERE oi.supplier_id = $1
       AND o.status::text = ANY($2::text[])
       AND ${periodSql}`,
    params
  )
  return {
    count: parseInt(rows[0]?.count || 0, 10),
    period,
  }
}

export async function assertSupplierActiveCustomerLocationCapacity(
  supplierId,
  { action = 'supplier_customer_activation' } = {}
) {
  const [limitCheck, subscription] = await Promise.all([
    checkLimit(supplierId, 'SUPPLIER', 'active_customer_locations_monthly'),
    getTenantSubscription(supplierId, 'SUPPLIER'),
  ])

  if (
    !limitCheck.isUnlimited &&
    limitCheck.limit != null &&
    limitCheck.current >= limitCheck.limit
  ) {
    const { recordConversionEvent } = await import('../conversion-events.js')
    recordConversionEvent(supplierId, 'SUPPLIER', 'BLOCKED_LIMIT', {
      limitKey: 'active_customer_locations_monthly',
      current: limitCheck.current,
      limit: limitCheck.limit,
      action,
    }).catch(() => {})

    const recommendedPlans = await getRecommendedPlanNames('SUPPLIER')
    const payload = buildLimitExceededPayload(
      limitCheck,
      'active_customer_locations_monthly',
      subscription?.plan_name || subscription?.plan_display_name,
      recommendedPlans,
      undefined,
      'SUPPLIER'
    )

    const err = new Error(
      'This supplier has reached its active customer locations limit for the current billing period.'
    )
    err.name = 'LimitExceededError'
    err.code = 'LIMIT_EXCEEDED'
    err.status = 403
    err.details = payload.details
    throw err
  }

  return limitCheck
}
/** Canonical limit keys re-exported from limit-resolution.js */

/**
 * Get usage snapshot for all relevant meter keys (batch queries).
 * @param {string} tenantId
 * @param {string} tenantType - 'RESTAURANT' | 'SUPPLIER'
 * @returns {Promise<{ [meterKey]: number }>}
 */
async function getUsageSnapshot(tenantId, tenantType) {
  const keys = tenantType === 'RESTAURANT' ? [...RESTAURANT_LIMIT_KEYS] : [...SUPPLIER_LIMIT_KEYS]
  const usage = Object.fromEntries(keys.map((k) => [k, 0]))

  if (tenantType === 'RESTAURANT') {
    const [
      inv,
      orders,
      suppliers,
      storage,
      quickLists,
      quickListItems,
      scheduledQuickLists,
      meterRows,
      branchCount,
      openConvRows,
    ] = await Promise.all([
      query(
        `SELECT COUNT(DISTINCT product_id) as c FROM restaurant_inventory WHERE restaurant_id = $1`,
        [tenantId]
      ),
      query(
        `SELECT COUNT(*) as c FROM customer_order WHERE restaurant_id = $1 AND status = 'PLACED' AND DATE(placed_at) = CURRENT_DATE`,
        [tenantId]
      ),
      query(`SELECT COUNT(*) as c FROM supplier_follow WHERE restaurant_id = $1`, [tenantId]),
      query(
        `SELECT current_value FROM usage_meter WHERE tenant_id = $1 AND tenant_type = 'RESTAURANT' AND meter_type = 'storage_mb' AND period_start_date = $2`,
        [tenantId, CUMULATIVE_PERIOD_DATE]
      ),
      query(`SELECT COUNT(*) as c FROM quick_list WHERE restaurant_id = $1`, [tenantId]),
      query(
        `SELECT COUNT(*) as c FROM quick_list_item qli
         JOIN quick_list ql ON ql.id = qli.quick_list_id
         WHERE ql.restaurant_id = $1`,
        [tenantId]
      ),
      query(
        `SELECT COUNT(*) as c FROM quick_list WHERE restaurant_id = $1 AND is_scheduled = true`,
        [tenantId]
      ),
      query(
        `SELECT meter_type, current_value FROM usage_meter WHERE tenant_id = $1 AND tenant_type = 'RESTAURANT' AND period_start_date = CURRENT_DATE`,
        [tenantId]
      ),
      countActiveBranchLocations(tenantId, 'RESTAURANT'),
      query(
        `
      SELECT COUNT(DISTINCT c.id) AS c
      FROM conversation c
      LEFT JOIN conversation_participant cp
        ON cp.conversation_id = c.id AND cp.participant_type = 'RESTAURANT'
      WHERE c.restaurant_id = $1 AND (cp.id IS NULL OR cp.is_archived = false)
      `,
        [tenantId]
      ),
    ])
    usage.restaurant_inventory_skus = parseInt(inv.rows[0]?.c || 0)
    usage.orders_per_day = parseInt(orders.rows[0]?.c || 0)
    usage.users = await countActiveTenantLoginUsers(tenantId, tenantType)
    usage.branches = branchCount
    usage.suppliers_per_restaurant = parseInt(suppliers.rows[0]?.c || 0)
    usage.storage_mb = parseInt(storage.rows[0]?.current_value || 0)
    usage.quick_lists = parseInt(quickLists.rows[0]?.c || 0)
    usage.quick_list_items = parseInt(quickListItems.rows[0]?.c || 0)
    usage.scheduled_quick_lists = parseInt(scheduledQuickLists.rows[0]?.c || 0)
    usage.open_conversations = parseInt(openConvRows.rows[0]?.c || 0, 10)
    meterRows.rows.forEach((r) => {
      if (keys.includes(r.meter_type)) usage[r.meter_type] = parseInt(r.current_value || 0)
    })
  } else {
    const [
      products,
      warehouseCount,
      branchCount,
      activeCustomerLocations,
      drivers,
      storage,
      meterRows,
    ] = await Promise.all([
      query(`SELECT COUNT(*) as c FROM product WHERE supplier_id = $1`, [tenantId]),
      countActiveWarehouses(tenantId),
      countActiveBranchLocations(tenantId, 'SUPPLIER'),
      countSupplierActiveCustomerLocationsMonthly(tenantId),
      query(`SELECT COUNT(*) as c FROM drivers WHERE supplier_id = $1 AND is_active = true`, [
        tenantId,
      ]),
      query(
        `SELECT current_value FROM usage_meter WHERE tenant_id = $1 AND tenant_type = 'SUPPLIER' AND meter_type = 'storage_mb' AND period_start_date = $2`,
        [tenantId, CUMULATIVE_PERIOD_DATE]
      ),
      query(
        `SELECT meter_type, current_value FROM usage_meter WHERE tenant_id = $1 AND tenant_type = 'SUPPLIER' AND period_start_date = CURRENT_DATE`,
        [tenantId]
      ),
    ])
    usage.supplier_products_skus = parseInt(products.rows[0]?.c || 0)
    usage.warehouses = warehouseCount
    usage.branches = branchCount
    usage.active_customer_locations_monthly = activeCustomerLocations.count
    usage.drivers = parseInt(drivers.rows[0]?.c || 0)
    usage.users = await countActiveTenantLoginUsers(tenantId, tenantType)
    usage.storage_mb = parseInt(storage.rows[0]?.current_value || 0)
    const [openConvRows, promoRows] = await Promise.all([
      query(
        `
        SELECT COUNT(DISTINCT c.id) AS c
        FROM conversation c
        LEFT JOIN conversation_participant cp
          ON cp.conversation_id = c.id AND cp.participant_type = 'SUPPLIER'
        WHERE c.supplier_id = $1 AND (cp.id IS NULL OR cp.is_archived = false)
        `,
        [tenantId]
      ),
      query(`SELECT COUNT(*) AS c FROM promotions WHERE supplier_id = $1 AND status <> 'expired'`, [
        tenantId,
      ]),
    ])
    usage.open_conversations = parseInt(openConvRows.rows[0]?.c || 0, 10)
    usage.promotions = parseInt(promoRows.rows[0]?.c || 0, 10)
    meterRows.rows.forEach((r) => {
      if (keys.includes(r.meter_type)) usage[r.meter_type] = parseInt(r.current_value || 0)
    })
  }

  return usage
}

/**
 * Get full entitlements for a tenant: plan, limits (with overrides), features, usage.
 * Single canonical shape for frontend. Expired overrides are excluded.
 * @param {string} tenantId
 * @param {string} tenantType - 'RESTAURANT' | 'SUPPLIER'
 * @returns {Promise<Object|null>} Entitlements object or null if no subscription
 */
export async function getEntitlements(tenantId, tenantType, req = null) {
  const cacheKey = entitlementsCacheKey(tenantId, tenantType)
  const cached = await getCache(cacheKey)
  if (cached !== null) {
    noteCacheHit(req, 'entitlements')
    const ageMs = cached._cachedAt ? Date.now() - cached._cachedAt : 0
    if (ageMs < ENTITLEMENTS_FRESH_USAGE_SEC * 1000) {
      return stripEntitlementsCacheMeta(cached)
    }
    try {
      const usage = await getUsageSnapshot(tenantId, tenantType)
      stripHiddenEntitlementLimits(cached.limits, usage)
      const refreshed = { ...stripEntitlementsCacheMeta(cached), usage, _cachedAt: Date.now() }
      await setCache(cacheKey, refreshed, ENTITLEMENTS_CACHE_TTL).catch(() => {})
      return stripEntitlementsCacheMeta(refreshed)
    } catch (err) {
      logger.warn('Entitlements usage refresh failed, serving cached payload', {
        tenantId,
        tenantType,
        error: err.message,
      })
      return stripEntitlementsCacheMeta(cached)
    }
  }
  noteCacheMiss(req, 'entitlements')

  return singleflight(cacheKey, async () => {
    const again = await getCache(cacheKey)
    if (again !== null) {
      noteCacheHit(req, 'entitlements')
      return stripEntitlementsCacheMeta(again)
    }

    const billingTenantId = await resolveOrgBillingTenantId(tenantId, tenantType)
    const subscription = await getTenantSubscription(billingTenantId, tenantType, {
      skipOrgBilling: true,
    })
    if (!subscription) return null

    const limitKeys = limitKeysForTenantType(tenantType)
    const planLimits = await resolveEnforcementPlanLimits(subscription, tenantType)
    const baseLimits = {}
    limitKeys.forEach((k) => {
      const v = planLimits?.[k]
      baseLimits[k] = v === -1 || v === null || v === undefined ? null : parseInt(v)
    })

    const limits = { ...baseLimits }
    const limitsBeforeAddons = { ...baseLimits }
    const overrides = []

    const effectivePlanFeatures = await resolveEffectivePlanFeatures(subscription)
    const [resolvedByKey, { features, featureSources }, activeAddons, usage] = await Promise.all([
      resolveAllEffectiveLimits({
        tenantId: billingTenantId,
        tenantType,
        limitKeys,
        planId: subscription.plan_id,
        planLimits,
      }),
      resolveAllFeaturesForTenant(billingTenantId, tenantType, effectivePlanFeatures),
      getActiveTenantAddons(billingTenantId, tenantType),
      getUsageSnapshot(tenantId, tenantType),
    ])

    for (const k of limitKeys) {
      const resolved = resolvedByKey[k]
      if (!resolved) continue
      limits[k] = resolved.effectiveLimit
      limitsBeforeAddons[k] = resolved.effectiveLimit
      if (resolved.tenantOverride) {
        overrides.push({
          limitKey: k,
          value: parseInt(resolved.tenantOverride.override_value, 10),
          reason: resolved.tenantOverride.reason || null,
          expiresAt: resolved.tenantOverride.expiration_date
            ? new Date(resolved.tenantOverride.expiration_date).toISOString()
            : null,
          scope: 'tenant',
        })
      } else if (resolved.planOverride) {
        overrides.push({
          limitKey: k,
          value: parseInt(resolved.planOverride.override_value, 10),
          reason: resolved.planOverride.reason || null,
          expiresAt: resolved.planOverride.expiration_date
            ? new Date(resolved.planOverride.expiration_date).toISOString()
            : null,
          scope: 'plan',
        })
      }
    }

    fillMissingFreeTierLimits(limits, tenantType, subscription.plan_code)
    fillMissingFreeTierLimits(limitsBeforeAddons, tenantType, subscription.plan_code)
    const addonBoosts = { branches: 0, warehouses: 0, active_customer_locations_monthly: 0 }
    for (const a of activeAddons) {
      const qty = parseInt(a.quantity, 10) || 0
      if (a.addon_key === addonKeyForLimitKey(tenantType, 'branches')) {
        addonBoosts.branches = qty
      }
      if (a.addon_key === addonKeyForLimitKey(tenantType, 'warehouses')) {
        addonBoosts.warehouses = qty
      }
      if (a.addon_key === addonKeyForLimitKey(tenantType, 'active_customer_locations_monthly')) {
        addonBoosts.active_customer_locations_monthly = qty * addonLimitIncrement(a.addon_key)
      }
    }
    for (const k of ['branches', 'warehouses', 'active_customer_locations_monthly']) {
      if (!isLimitKeyApplicable(tenantType, k)) continue
      const qty = addonBoosts[k] || 0
      if (limits[k] != null && qty > 0) {
        limits[k] = computeEffectiveWithAddons(limits[k], qty)
      }
    }

    if (tenantType === 'SUPPLIER') {
      const warehouseLimit = limits.warehouses
      if (warehouseLimit === 0) {
        usage.warehouses = 0
      }
    }
    stripHiddenEntitlementLimits(limits, usage)
    stripHiddenEntitlementLimits(baseLimits, null)
    stripHiddenEntitlementLimits(limitsBeforeAddons, null)
    const visibleOverrides = stripHiddenEntitlementLimits(null, null, overrides)

    const locationLimits = {}
    if (isLimitKeyApplicable(tenantType, 'branches')) {
      const included = limitsBeforeAddons.branches
      const boost = addonBoosts.branches || 0
      const effective = limits.branches
      const current = usage.branches ?? 0
      locationLimits.branches = {
        included,
        addonQuantity: boost,
        effective,
        current,
        remaining: effective == null ? null : Math.max(0, effective - current),
        percentUsed:
          effective == null || effective <= 0 ? null : Math.round((current / effective) * 100),
        warningThresholdReached:
          effective != null && effective > 0 && current >= Math.floor(effective * 0.8),
        overIncludedLimit: included != null && current > included,
        overEffectiveLimit: effective != null && current > effective,
        enterpriseThreshold: ENTERPRISE_BRANCH_THRESHOLD,
        atEnterpriseThreshold: current >= ENTERPRISE_BRANCH_THRESHOLD,
      }
    }
    if (isLimitKeyApplicable(tenantType, 'warehouses')) {
      const included = limitsBeforeAddons.warehouses
      const boost = addonBoosts.warehouses || 0
      const effective = limits.warehouses
      const current = usage.warehouses ?? 0
      locationLimits.warehouses = {
        included,
        addonQuantity: boost,
        effective,
        current,
        remaining: effective == null ? null : Math.max(0, effective - current),
        percentUsed:
          effective == null || effective <= 0 ? null : Math.round((current / effective) * 100),
        warningThresholdReached:
          effective != null && effective > 0 && current >= Math.floor(effective * 0.8),
        overIncludedLimit: included != null && current > included,
        overEffectiveLimit: effective != null && current > effective,
      }
    }
    if (isLimitKeyApplicable(tenantType, 'active_customer_locations_monthly')) {
      const included = limitsBeforeAddons.active_customer_locations_monthly
      const boost = addonBoosts.active_customer_locations_monthly || 0
      const effective = limits.active_customer_locations_monthly
      const current = usage.active_customer_locations_monthly ?? 0
      locationLimits.activeCustomerLocationsMonthly = {
        included,
        addonQuantity: boost / 50,
        addonIncrement: 50,
        effective,
        current,
        remaining: effective == null ? null : Math.max(0, effective - current),
        percentUsed:
          effective == null || effective <= 0 ? null : Math.round((current / effective) * 100),
        warningThresholdReached:
          effective != null && effective > 0 && current >= Math.floor(effective * 0.8),
        overIncludedLimit: included != null && current > included,
        overEffectiveLimit: effective != null && current > effective,
      }
    }

    const usageWindowMeta = {}
    limitKeys.forEach((k) => {
      if (HIDDEN_ENTITLEMENT_LIMIT_KEYS.has(k)) return
      if (k === 'orders_per_day' || k === 'chats_per_day' || k === 'ai_requests_per_day')
        usageWindowMeta[k] = { date: new Date().toISOString().slice(0, 10) }
      if (k === 'active_customer_locations_monthly' && tenantType === 'SUPPLIER')
        usageWindowMeta[k] = {
          period: 'monthly',
          timezone: 'UTC',
          definition:
            'distinct restaurant branch or restaurant with accepted/fulfilled supplier order activity',
        }
    })

    let smartReorder = null
    if (tenantType === 'RESTAURANT') {
      const smartReorderValue = features.smart_reorder ?? effectivePlanFeatures?.smart_reorder
      const caps = resolveSmartReorderCapabilities(smartReorderValue)
      const aiPlatformFeature = Boolean(features.ai_platform)
      const aiPlatformEnabled = await isAiPlatformEnabledForTenant(billingTenantId, tenantType)
      smartReorder = {
        tier: caps.tier,
        capabilities: {
          ...caps.capabilities,
          llmExplain: caps.capabilities.forecast && aiPlatformFeature,
          nlAsk: caps.capabilities.seasonality && aiPlatformFeature,
        },
        aiPlatformEnabled,
      }
    }

    const payload = {
      tenantType,
      tenantId,
      billingTenantId,
      usesOrgBilling: billingTenantId !== tenantId,
      plan: {
        id: subscription.plan_id,
        name: formatTenantPlanDisplayName(
          subscription.plan_code,
          tenantType,
          subscription.plan_name || subscription.plan_display_name
        ),
        code: subscription.plan_code,
        tenant_type: subscription.plan_tenant_type || subscription.tenant_type || tenantType,
        price_monthly:
          subscription.plan_price_per_month != null
            ? Number(subscription.plan_price_per_month)
            : null,
        price_yearly:
          subscription.plan_price_per_year != null
            ? Number(subscription.plan_price_per_year)
            : null,
      },
      features,
      featureSources,
      planFeatures: effectivePlanFeatures,
      limits,
      baseLimits,
      limitsBeforeAddons,
      addons: activeAddons.map((a) => ({
        id: a.id,
        key: a.addon_key,
        quantity: parseInt(a.quantity, 10) || 0,
        unitPriceMonthly: a.unit_price_monthly != null ? Number(a.unit_price_monthly) : null,
        status: a.status,
        startsAt: a.starts_at ? new Date(a.starts_at).toISOString() : null,
        endsAt: a.ends_at ? new Date(a.ends_at).toISOString() : null,
      })),
      locationLimits,
      overrides: visibleOverrides.map((o) => ({
        limitKey: o.limitKey,
        value: o.value,
        reason: o.reason || null,
        expiresAt: o.expiresAt,
        scope: o.scope,
      })),
      usage,
      usageWindowMeta,
      trialTargetPlanId: subscription.trial_target_plan_id || null,
      freeSandbox:
        (subscription.plan_code || '').toLowerCase() === 'free'
          ? {
              expiresAt: subscription.free_sandbox_expires_at
                ? new Date(subscription.free_sandbox_expires_at).toISOString()
                : null,
            }
          : null,
      smartReorder,
    }

    const cachedPayload = { ...payload, _cachedAt: Date.now() }
    await setCache(cacheKey, cachedPayload, ENTITLEMENTS_CACHE_TTL).catch(() => {})
    return payload
  })
}

/**
 * Check headroom and record bytes against storage_mb (cumulative meter).
 * Call when a file is committed (presign approved, attachment saved, etc.).
 * @returns {Promise<{ allowed: boolean, current?: number, limit?: number|null, sizeMb?: number }>}
 */
export async function ensureStorageForUpload(tenantId, tenantType, sizeBytes) {
  const bytes = Number(sizeBytes) || 0
  if (bytes <= 0) {
    return { allowed: true }
  }

  const sizeMb = Math.ceil(bytes / (1024 * 1024))
  const storageCheck = await checkLimit(tenantId, tenantType, 'storage_mb')

  if (
    !storageCheck.isUnlimited &&
    storageCheck.limit != null &&
    storageCheck.current + sizeMb > storageCheck.limit
  ) {
    return {
      allowed: false,
      current: storageCheck.current,
      limit: storageCheck.limit,
      sizeMb,
    }
  }

  await incrementStorageUsage(tenantId, tenantType, bytes)
  return {
    allowed: true,
    current: storageCheck.current,
    limit: storageCheck.limit,
    sizeMb,
  }
}

/**
 * Increment storage usage (cumulative, in MB).
 * @param {string} tenantId - Tenant ID
 * @param {string} tenantType - 'SUPPLIER' or 'RESTAURANT'
 * @param {number} sizeBytes - File size in bytes (will be converted to MB for storage)
 */
export async function incrementStorageUsage(tenantId, tenantType, sizeBytes) {
  if (!sizeBytes || sizeBytes <= 0) return
  const sizeMb = Math.ceil(sizeBytes / (1024 * 1024))
  try {
    const subscription = await getTenantSubscription(tenantId, tenantType)
    const limitValue = subscription?.limits?.storage_mb
    const effectiveLimit = limitValue === -1 ? null : limitValue ? parseInt(limitValue) : null
    await query(
      `
      INSERT INTO usage_meter (tenant_id, tenant_type, meter_type, current_value, period_type, period_start_date, limit_value)
      VALUES ($1, $2, 'storage_mb', $3, 'MONTHLY', $4, $5)
      ON CONFLICT (tenant_id, tenant_type, meter_type, period_start_date)
      DO UPDATE SET 
        current_value = usage_meter.current_value + $3,
        last_updated = now(),
        limit_value = COALESCE(usage_meter.limit_value, $5),
        is_over_limit = CASE 
          WHEN $5 IS NULL THEN false
          ELSE (usage_meter.current_value + $3) >= $5
        END
    `,
      [tenantId, tenantType, sizeMb, CUMULATIVE_PERIOD_DATE, effectiveLimit]
    )
    logger.debug('Storage usage incremented', { tenantId, tenantType, sizeMb })
  } catch (error) {
    logger.error('Increment storage usage error:', error)
  }
}

/**
 * Check usage with 80% warning threshold
 * @param {string} tenantId - Tenant ID
 * @param {string} tenantType - 'SUPPLIER' or 'RESTAURANT'
 * @param {string} meterType - Type of meter
 * @returns {Promise<{current: number, limit: number|null, isUnlimited: boolean, isOverLimit: boolean, isWarning: boolean, usagePercent: number}>}
 */
export async function checkUsageWithWarning(tenantId, tenantType, meterType) {
  try {
    const result = await checkLimit(tenantId, tenantType, meterType)
    const usagePercent = result.limit ? (result.current / result.limit) * 100 : 0
    const isWarning = usagePercent >= 80 && usagePercent < 100

    return {
      ...result,
      isWarning,
      usagePercent,
    }
  } catch (error) {
    logger.error('Check usage with warning error:', error)
    return {
      current: 0,
      limit: 0,
      isUnlimited: false,
      isOverLimit: true,
      isWarning: false,
      usagePercent: 0,
    }
  }
}

/**
 * Decrement usage meter (e.g., when deleting)
 * @param {string} tenantId - Tenant ID
 * @param {string} tenantType - 'SUPPLIER' or 'RESTAURANT'
 * @param {string} meterType - Type of meter
 * @param {number} decrement - Amount to decrement (default: 1)
 */
export async function decrementUsage(tenantId, tenantType, meterType, decrement = 1) {
  try {
    await query(
      `
      UPDATE usage_meter
      SET 
        current_value = GREATEST(0, current_value - $4),
        last_updated = now(),
        is_over_limit = GREATEST(0, current_value - $4) >= COALESCE(limit_value, 0)
      WHERE tenant_id = $1 
        AND tenant_type = $2 
        AND meter_type = $3
        AND period_start_date = CURRENT_DATE
    `,
      [tenantId, tenantType, meterType, decrement]
    )
  } catch (error) {
    logger.error('Decrement usage error:', error)
    // Don't throw - usage tracking shouldn't fail operations
  }
}

export async function assertTenantUserSeatAvailable(
  tenantId,
  tenantType,
  { includePendingInvitations = false, joiningUserId = null } = {}
) {
  if (joiningUserId && (await isActiveTenantLoginUser(tenantId, tenantType, joiningUserId))) {
    return {
      current: await countActiveTenantLoginUsers(tenantId, tenantType),
      pendingInvitations: 0,
      projected: null,
      limit: null,
      alreadyMember: true,
    }
  }

  const [limitCheck, pendingInvitations] = await Promise.all([
    checkLimit(tenantId, tenantType, 'users'),
    includePendingInvitations ? countPendingTenantInvitations(tenantId, tenantType) : 0,
  ])

  if (!limitCheck.isUnlimited && limitCheck.limit != null) {
    const projected = Number(limitCheck.current || 0) + Number(pendingInvitations || 0)
    if (projected >= Number(limitCheck.limit)) {
      const err = new Error(
        `This account has reached its plan limit of ${limitCheck.limit} active user seat(s). Upgrade the plan or remove an inactive invitation/user before adding another login.`
      )
      err.name = 'USER_LIMIT_REACHED'
      err.code = 'USER_LIMIT_REACHED'
      err.status = 403
      err.limitCheck = {
        ...limitCheck,
        pendingInvitations,
        projected,
      }
      throw err
    }
  }

  return {
    ...limitCheck,
    pendingInvitations,
    projected: Number(limitCheck.current || 0) + Number(pendingInvitations || 0),
  }
}

export function requireWithinLimit(meterType, getTenantId, getTenantType) {
  return async (req, res, next) => {
    try {
      const tenantId = getTenantId(req)
      const tenantType = getTenantType(req)

      const [limitCheck, subscription] = await Promise.all([
        checkLimit(tenantId, tenantType, meterType),
        getTenantSubscription(tenantId, tenantType),
      ])

      if (limitCheck.isOverLimit && !limitCheck.isUnlimited) {
        const { recordConversionEvent } = await import('../conversion-events.js')
        recordConversionEvent(tenantId, tenantType, 'BLOCKED_LIMIT', {
          limitKey: meterType,
          current: limitCheck.current,
          limit: limitCheck.limit,
        }).catch(() => {})
        const recommendedPlans = await getRecommendedPlanNames(tenantType)
        return res.status(403).json({
          ok: false,
          data: null,
          error: buildLimitExceededPayload(
            limitCheck,
            meterType,
            subscription?.plan_name || subscription?.plan_display_name,
            recommendedPlans,
            undefined,
            tenantType
          ),
          requestId: req.requestId,
        })
      }

      req.planLimit = limitCheck
      next()
    } catch (error) {
      logger.error('Check plan limit middleware error:', error)
      next(error)
    }
  }
}

/**
 * Middleware factory for checking feature access
 * @param {string} featureKey - Feature key to check
 * @param {Function} getTenantId - Function to get tenant ID from request
 * @param {Function} getTenantType - Function to get tenant type from request
 */
export function requireFeature(featureKey, getTenantId, getTenantType) {
  return async (req, res, next) => {
    startStage(req, 'feature')
    try {
      const tenantId = await Promise.resolve(getTenantId(req))
      const tenantType = await Promise.resolve(getTenantType(req))

      let subscription = req.subscription
      if (!subscription && tenantId && tenantType) {
        const { resolveRequestSubscription } = await import('../request-subscription.js')
        subscription = await resolveRequestSubscription(req, {
          tenantId,
          tenantType,
        })
      }

      const { resolveOrgBillingTenantId } = await import('../org-billing-tenant.js')
      const { resolveFeatureEnabled, FEATURE_ALIASES } = await import('../feature-flags.js')
      const billingTenantId = await resolveOrgBillingTenantId(tenantId, tenantType)
      const planFeatures = subscription
        ? await resolveEffectivePlanFeatures(subscription)
        : undefined
      let featureResult = await resolveFeatureEnabled(
        billingTenantId,
        tenantType,
        featureKey,
        planFeatures
      )
      const { shouldResolveFeatureAlias } = await import('../feature-flags.js')
      if (!featureResult.enabled && shouldResolveFeatureAlias(featureKey, planFeatures)) {
        featureResult = await resolveFeatureEnabled(
          billingTenantId,
          tenantType,
          FEATURE_ALIASES[featureKey],
          planFeatures
        )
      }
      const isEnabled = featureResult.enabled

      if (!isEnabled) {
        const { recordConversionEvent } = await import('../conversion-events.js')
        recordConversionEvent(tenantId, tenantType, 'BLOCKED_FEATURE', { featureKey }).catch(
          () => {}
        )
        const recommendedPlans = await getRecommendedPlanNames(tenantType)
        mark(req, 'feature')
        return res.status(403).json({
          ok: false,
          data: null,
          error: buildFeatureNotAvailablePayload(
            featureKey,
            subscription?.plan_name || subscription?.plan_display_name,
            null,
            recommendedPlans,
            undefined,
            tenantType
          ),
          requestId: req.requestId,
        })
      }

      req.subscription = subscription
      mark(req, 'feature')
      next()
    } catch (error) {
      mark(req, 'feature')
      logger.error('Check feature middleware error:', error)
      next(error)
    }
  }
}
