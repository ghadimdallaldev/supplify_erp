import { query, withTransaction } from './db.js'
import { logger } from './logger.js'
import { resolveAllFeaturesForTenant } from './feature-flags.js'
import { createPendingActivationSubscription } from './billing/subscription-activation.js'
import { getCache, setCache, deleteCache } from './cache.js'
import { singleflight } from './singleflight.js'
import { startStage, mark, noteCacheHit, noteCacheMiss } from '../middlewares/request-timing.js'
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
} from './limit-resolution.js'
import { PLAN_TIER_ORDER, normalizePlanCode, formatPlanDisplayName } from './plan-codes.js'
import { countActiveBranchLocations, countActiveWarehouses } from './plan-enforcement.js'
import { getWarehouseSupplierColumn } from './warehouse-helpers.js'
import { resolveOrgBillingTenantId } from './org-billing-tenant.js'
import {
  addonKeyForLimitKey,
  computeEffectiveWithAddons,
  ENTERPRISE_BRANCH_THRESHOLD,
  getActiveTenantAddons,
} from './subscription-addons.js'

export { HIDDEN_ENTITLEMENT_LIMIT_KEYS }
export { normalizePlanCode, formatPlanDisplayName } from './plan-codes.js'

export { RESTAURANT_LIMIT_KEYS, SUPPLIER_LIMIT_KEYS, discoverLimitKeys }

/** Plan limits with Free-tier fallbacks applied before enforcement. */
function getEnforcementPlanLimits(subscription, tenantType) {
  const limits = { ...(subscription.limits || {}) }
  fillMissingFreeTierLimits(limits, tenantType, subscription.plan_code)
  return limits
}

/** Cache TTL for subscription data (seconds). Short enough to absorb burst traffic while staying fresh. */
const SUBSCRIPTION_CACHE_TTL = 180
/** Full entitlements payload (plan, limits, features, usage) — hot path on every app shell load. */
const ENTITLEMENTS_CACHE_TTL = 300

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
  const { invalidateBillingSubscriptionCache } = await import('./billing/billing-service.js')
  await invalidateBillingSubscriptionCache(tenantId, tenantType)
}

/**
 * Check if feature is enabled for tenant (tenant override → global override → plan).
 * @param {string} tenantId - Tenant ID
 * @param {string} tenantType - 'SUPPLIER' or 'RESTAURANT'
 * @param {string} featureKey - Feature key to check
 * @returns {Promise<boolean>} Whether feature is enabled
 */
export async function isFeatureEnabled(tenantId, tenantType, featureKey) {
  const { isFeatureEnabledForTenant } = await import('./feature-flags.js')
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
    const planLimits = getEnforcementPlanLimits(subscription, tenantType)
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
    } else if (meterType === 'users' && tenantType === 'RESTAURANT') {
      // Restaurant users = 1 (primary contact) + team members
      const { rows: teamCount } = await query(
        `
        SELECT COUNT(*) as count FROM restaurant_team WHERE restaurant_id = $1
      `,
        [tenantId]
      )
      current = 1 + parseInt(teamCount[0]?.count || 0)
    } else if (meterType === 'users' && tenantType === 'SUPPLIER') {
      // Suppliers have single contact (no team table); count as 1
      current = 1
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
    // Fail closed for countable meters — do not treat DB errors as unlimited
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
 * Atomic check and increment for daily usage meters (orders_per_day, chats_per_day).
 * Uses transaction + row lock to avoid race conditions. Use this instead of checkLimit + incrementUsage for these meters.
 * @param {string} tenantId - Tenant ID
 * @param {string} tenantType - 'SUPPLIER' or 'RESTAURANT'
 * @param {string} meterType - e.g. 'orders_per_day', 'chats_per_day'
 * @param {number} increment - Amount to add (default: 1)
 * @returns {Promise<{ allowed: boolean, current?: number, limit?: number|null }>}
 */
export async function checkAndIncrementUsage(tenantId, tenantType, meterType, increment = 1) {
  const subscription = await getTenantSubscription(tenantId, tenantType)
  if (!subscription) {
    return { allowed: false, current: 0, limit: 0 }
  }
  const billingTenantId = await resolveOrgBillingTenantId(tenantId, tenantType)
  const planLimits = getEnforcementPlanLimits(subscription, tenantType)
  const resolved = await resolveEffectiveLimit({
    tenantId: billingTenantId,
    tenantType,
    limitKey: meterType,
    planId: subscription.plan_id,
    planLimits,
  })
  if (resolved.isUnlimited) {
    const res = await withTransaction(async (client) => {
      await client.query(
        `
        INSERT INTO usage_meter (tenant_id, tenant_type, meter_type, current_value, period_type, period_start_date)
        VALUES ($1, $2, $3, 0, 'DAILY', CURRENT_DATE)
        ON CONFLICT (tenant_id, tenant_type, meter_type, period_start_date) DO NOTHING
      `,
        [tenantId, tenantType, meterType]
      )
      await client.query(
        `UPDATE usage_meter SET current_value = current_value + $4, last_updated = now()
         WHERE tenant_id = $1 AND tenant_type = $2 AND meter_type = $3 AND period_start_date = CURRENT_DATE`,
        [tenantId, tenantType, meterType, increment]
      )
      return { allowed: true }
    })
    return res
  }
  const effectiveLimit = resolved.effectiveLimit

  return withTransaction(async (client) => {
    await client.query(
      `
      INSERT INTO usage_meter (tenant_id, tenant_type, meter_type, current_value, period_type, period_start_date, limit_value)
      VALUES ($1, $2, $3, 0, 'DAILY', CURRENT_DATE, $4)
      ON CONFLICT (tenant_id, tenant_type, meter_type, period_start_date) DO NOTHING
    `,
      [tenantId, tenantType, meterType, effectiveLimit]
    )
    const { rows } = await client.query(
      `SELECT current_value FROM usage_meter
       WHERE tenant_id = $1 AND tenant_type = $2 AND meter_type = $3 AND period_start_date = CURRENT_DATE
       FOR UPDATE`,
      [tenantId, tenantType, meterType]
    )
    const current = rows.length > 0 ? parseInt(rows[0].current_value || 0) : 0
    if (current + increment > effectiveLimit) {
      throw { allowed: false, current, limit: effectiveLimit }
    }
    await client.query(
      `UPDATE usage_meter SET current_value = current_value + $4, last_updated = now(),
        is_over_limit = (current_value + $4) >= $5
       WHERE tenant_id = $1 AND tenant_type = $2 AND meter_type = $3 AND period_start_date = CURRENT_DATE`,
      [tenantId, tenantType, meterType, increment, effectiveLimit]
    )
    return { allowed: true, current: current + increment, limit: effectiveLimit }
  }).catch((err) => {
    if (err && typeof err === 'object' && 'allowed' in err) return err
    throw err
  })
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
    const planLimits = getEnforcementPlanLimits(subscription, tenantType)
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
      team,
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
      query(`SELECT COUNT(*) as c FROM restaurant_team WHERE restaurant_id = $1`, [tenantId]),
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
    usage.users = 1 + parseInt(team.rows[0]?.c || 0)
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
    const [products, warehouseCount, branchCount, storage, meterRows] = await Promise.all([
      query(`SELECT COUNT(*) as c FROM product WHERE supplier_id = $1`, [tenantId]),
      countActiveWarehouses(tenantId),
      countActiveBranchLocations(tenantId, 'SUPPLIER'),
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
    usage.users = 1
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
    return cached
  }
  noteCacheMiss(req, 'entitlements')

  return singleflight(cacheKey, async () => {
    const again = await getCache(cacheKey)
    if (again !== null) {
      noteCacheHit(req, 'entitlements')
      return again
    }

    const billingTenantId = await resolveOrgBillingTenantId(tenantId, tenantType)
    const subscription = await getTenantSubscription(billingTenantId, tenantType, {
      skipOrgBilling: true,
    })
    if (!subscription) return null

    const limitKeys = limitKeysForTenantType(tenantType)
    const baseLimits = {}
    limitKeys.forEach((k) => {
      const v = subscription.limits?.[k]
      baseLimits[k] = v === -1 || v === null || v === undefined ? null : parseInt(v)
    })

    const limits = { ...baseLimits }
    const limitsBeforeAddons = { ...baseLimits }
    const overrides = []

    const [resolvedByKey, { features, featureSources }, activeAddons, usage] = await Promise.all([
      resolveAllEffectiveLimits({
        tenantId: billingTenantId,
        tenantType,
        limitKeys,
        planId: subscription.plan_id,
        planLimits: subscription.limits || {},
      }),
      resolveAllFeaturesForTenant(billingTenantId, tenantType, subscription.features),
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
    const addonBoosts = { branches: 0, warehouses: 0 }
    for (const a of activeAddons) {
      const qty = parseInt(a.quantity, 10) || 0
      if (a.addon_key === addonKeyForLimitKey(tenantType, 'branches')) {
        addonBoosts.branches = qty
      }
      if (a.addon_key === addonKeyForLimitKey(tenantType, 'warehouses')) {
        addonBoosts.warehouses = qty
      }
    }
    for (const k of ['branches', 'warehouses']) {
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
        overIncludedLimit: included != null && current > included,
        overEffectiveLimit: effective != null && current > effective,
      }
    }

    const usageWindowMeta = {}
    limitKeys.forEach((k) => {
      if (HIDDEN_ENTITLEMENT_LIMIT_KEYS.has(k)) return
      if (k === 'orders_per_day' || k === 'chats_per_day')
        usageWindowMeta[k] = { date: new Date().toISOString().slice(0, 10) }
    })

    const payload = {
      tenantType,
      tenantId,
      billingTenantId,
      usesOrgBilling: billingTenantId !== tenantId,
      plan: {
        id: subscription.plan_id,
        name: formatPlanDisplayName(
          subscription.plan_code,
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
      planFeatures: subscription.features || {},
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
      freeSandbox:
        (subscription.plan_code || '').toLowerCase() === 'free'
          ? {
              expiresAt: subscription.free_sandbox_expires_at
                ? new Date(subscription.free_sandbox_expires_at).toISOString()
                : null,
            }
          : null,
    }

    await setCache(cacheKey, payload, ENTITLEMENTS_CACHE_TTL).catch(() => {})
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

/** Default front-route for upgrade CTA (monetization UX) */
const DEFAULT_UPGRADE_PATH = '/app/settings'

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
  upgradeUrl = DEFAULT_UPGRADE_PATH
) {
  return {
    name: 'LIMIT_EXCEEDED',
    message: `You have reached your plan limit for ${meterType}`,
    details: {
      limitKey: meterType,
      limitValue: limitCheck.limit,
      currentUsage: limitCheck.current,
      currentPlan: currentPlanName || null,
      recommendedPlans: recommendedPlans || [],
      upgradeUrl: upgradeUrl || DEFAULT_UPGRADE_PATH,
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
  upgradeUrl = DEFAULT_UPGRADE_PATH
) {
  return {
    name: 'FEATURE_NOT_AVAILABLE',
    message: 'This feature is not available in your current plan',
    details: {
      featureKey,
      currentPlan: currentPlanName || null,
      requiredPlan: requiredPlan || null,
      recommendedPlans: recommendedPlans || [],
      upgradeUrl: upgradeUrl || DEFAULT_UPGRADE_PATH,
    },
  }
}

/**
 * Middleware factory for checking plan limits
 * @param {string} meterType - Type of meter to check
 * @param {Function} getTenantId - Function to get tenant ID from request
 * @param {Function} getTenantType - Function to get tenant type from request
 */
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
        const { recordConversionEvent } = await import('./conversion-events.js')
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
            recommendedPlans
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
      const tenantId = getTenantId(req)
      const tenantType = getTenantType(req)

      let subscription = req.subscription
      if (!subscription && tenantId && tenantType) {
        const { resolveRequestSubscription } = await import('./request-subscription.js')
        subscription = await resolveRequestSubscription(req, {
          tenantId,
          tenantType,
        })
      }

      const { resolveOrgBillingTenantId } = await import('./org-billing-tenant.js')
      const { resolveFeatureEnabled, FEATURE_ALIASES } = await import('./feature-flags.js')
      const billingTenantId = await resolveOrgBillingTenantId(tenantId, tenantType)
      let featureResult = await resolveFeatureEnabled(
        billingTenantId,
        tenantType,
        featureKey,
        subscription?.features
      )
      if (!featureResult.enabled && FEATURE_ALIASES[featureKey]) {
        featureResult = await resolveFeatureEnabled(
          billingTenantId,
          tenantType,
          FEATURE_ALIASES[featureKey],
          subscription?.features
        )
      }
      const isEnabled = featureResult.enabled

      if (!isEnabled) {
        const { recordConversionEvent } = await import('./conversion-events.js')
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
            recommendedPlans
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
