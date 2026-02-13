import { query } from './db.js'
import { logger } from './logger.js'

/**
 * Ensure tenant has an active subscription; if none, create one with the free plan.
 * Used so suppliers and restaurants never hit "no subscription" (0/0 limits).
 */
async function ensureTenantSubscription(tenantId, tenantType) {
  const { rows: plans } = await query(
    `SELECT id, name, code FROM subscription_plan WHERE code = 'free' AND tenant_type = $1 AND is_active = true LIMIT 1`,
    [tenantType]
  )
  if (plans.length === 0) return
  const plan = plans[0]
  await query(
    `INSERT INTO subscription (tenant_id, tenant_type, plan_id, plan_name, status, billing_cycle, current_period_start, current_period_end)
     SELECT $1, $2, $3, $4, 'ACTIVE', 'MONTHLY', now(), now() + INTERVAL '1 month'
     WHERE NOT EXISTS (
       SELECT 1 FROM subscription
       WHERE tenant_id = $1 AND tenant_type = $2 AND status IN ('TRIALING', 'ACTIVE')
     )`,
    [tenantId, tenantType, plan.id, plan.name]
  )
  logger.debug('Ensured subscription for tenant', { tenantId, tenantType, plan: plan.code })
}

/**
 * Get tenant's active subscription
 * @param {string} tenantId - Tenant ID (supplier or restaurant)
 * @param {string} tenantType - 'SUPPLIER' or 'RESTAURANT'
 * @returns {Promise<Object|null>} Subscription with plan details
 */
export async function getTenantSubscription(tenantId, tenantType) {
  try {
    let { rows } = await query(
      `
      SELECT s.*, sp.limits, sp.features, sp.name as plan_display_name, sp.code as plan_code
      FROM subscription s
      JOIN subscription_plan sp ON sp.id = s.plan_id
      WHERE s.tenant_id = $1 
        AND s.tenant_type = $2
        AND s.status IN ('TRIALING', 'ACTIVE')
      ORDER BY s.created_at DESC
      LIMIT 1
    `,
      [tenantId, tenantType]
    )

    if (rows.length === 0) {
      await ensureTenantSubscription(tenantId, tenantType)
      const result = await query(
        `
        SELECT s.*, sp.limits, sp.features, sp.name as plan_display_name, sp.code as plan_code
        FROM subscription s
        JOIN subscription_plan sp ON sp.id = s.plan_id
        WHERE s.tenant_id = $1 
          AND s.tenant_type = $2
          AND s.status IN ('TRIALING', 'ACTIVE')
        ORDER BY s.created_at DESC
        LIMIT 1
      `,
        [tenantId, tenantType]
      )
      rows = result.rows
    }

    return rows[0] || null
  } catch (error) {
    logger.error('Get tenant subscription error', { error: error.message })
    return null
  }
}

/**
 * Check if feature is enabled for tenant based on subscription plan
 * Features are determined solely by the subscription plan's features JSONB field
 * @param {string} tenantId - Tenant ID
 * @param {string} tenantType - 'SUPPLIER' or 'RESTAURANT'
 * @param {string} featureKey - Feature key to check
 * @returns {Promise<boolean>} Whether feature is enabled
 */
export async function isFeatureEnabled(tenantId, tenantType, featureKey) {
  try {
    // Get tenant's subscription and check plan features
    const subscription = await getTenantSubscription(tenantId, tenantType)
    if (subscription && subscription.features) {
      const featureValue = subscription.features[featureKey]
      if (featureValue !== undefined) {
        // If it's a boolean, return it
        if (typeof featureValue === 'boolean') {
          return featureValue
        }
        // If it's a string (e.g., "enabled", "disabled"), check truthiness
        if (typeof featureValue === 'string') {
          return featureValue !== 'false' && featureValue !== 'disabled' && featureValue !== ''
        }
        // If it exists in features (truthy), return true
        return featureValue ? true : false
      }
    }

    // No subscription or feature not found in plan = disabled
    return false
  } catch (error) {
    logger.error('Check feature enabled error:', error)
    return false // Default to disabled on error
  }
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

    // Get limit from plan
    let limit = subscription.limits?.[meterType]
    const isUnlimited = limit === -1 || limit === null || limit === undefined

    // Check for admin override (table may not exist in all installations)
    let overrides = []
    try {
      const result = await query(
        `
        SELECT override_value, expiration_date
        FROM tenant_limit_override
        WHERE tenant_id = $1 
          AND tenant_type = $2 
          AND limit_type = $3
          AND (expiration_date IS NULL OR expiration_date > now())
      `,
        [tenantId, tenantType, meterType]
      )
      overrides = result.rows
    } catch (error) {
      // Table doesn't exist - that's OK, just skip override check
      if (error.code === '42P01') {
        // Table doesn't exist, continue without override
      } else {
        throw error
      }
    }

    if (overrides.length > 0) {
      const override = overrides[0]
      // Override takes precedence
      limit = parseInt(override.override_value)
    } else {
      limit = limit === -1 ? null : parseInt(limit)
    }

    if (isUnlimited && !overrides.length) {
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
    // On error, return safe defaults that don't block users
    return {
      current: 0,
      limit: null,
      isUnlimited: true,
      isOverLimit: false,
      effectiveLimit: null,
    }
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
    // Get subscription to fetch limit value
    const subscription = await getTenantSubscription(tenantId, tenantType)
    const limitValue = subscription?.limits?.[meterType]
    const effectiveLimit = limitValue === -1 ? null : limitValue ? parseInt(limitValue) : null

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

      const limitCheck = await checkLimit(tenantId, tenantType, meterType)

      if (limitCheck.isOverLimit && !limitCheck.isUnlimited) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: {
            name: 'LIMIT_EXCEEDED',
            message: `You have reached your plan limit for ${meterType}`,
            details: {
              current: limitCheck.current,
              limit: limitCheck.limit,
              meterType,
            },
          },
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
    try {
      const tenantId = getTenantId(req)
      const tenantType = getTenantType(req)

      const isEnabled = await isFeatureEnabled(tenantId, tenantType, featureKey)

      if (!isEnabled) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: {
            name: 'FEATURE_NOT_AVAILABLE',
            message: `This feature is not available in your current plan`,
            details: {
              featureKey,
            },
          },
          requestId: req.requestId,
        })
      }

      next()
    } catch (error) {
      logger.error('Check feature middleware error:', error)
      next(error)
    }
  }
}
