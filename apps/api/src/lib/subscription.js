import { query } from './db.js';
import { logger } from './logger.js';

/**
 * Get tenant's active subscription
 * @param {string} tenantId - Tenant ID (supplier or restaurant)
 * @param {string} tenantType - 'SUPPLIER' or 'RESTAURANT'
 * @returns {Promise<Object|null>} Subscription with plan details
 */
export async function getTenantSubscription(tenantId, tenantType) {
  try {
    const { rows } = await query(`
      SELECT s.*, sp.limits, sp.features, sp.name as plan_display_name, sp.code as plan_code
      FROM subscription s
      JOIN subscription_plan sp ON sp.id = s.plan_id
      WHERE s.tenant_id = $1 
        AND s.tenant_type = $2
        AND s.status IN ('TRIALING', 'ACTIVE')
      ORDER BY s.created_at DESC
      LIMIT 1
    `, [tenantId, tenantType]);

    return rows[0] || null;
  } catch (error) {
    logger.error('Get tenant subscription error:', error);
    return null;
  }
}

/**
 * Check if feature is enabled for tenant
 * Resolution order: tenant.override > plan.features > global.flag.default
 * @param {string} tenantId - Tenant ID
 * @param {string} tenantType - 'SUPPLIER' or 'RESTAURANT'
 * @param {string} featureKey - Feature key to check
 * @returns {Promise<boolean>} Whether feature is enabled
 */
export async function isFeatureEnabled(tenantId, tenantType, featureKey) {
  try {
    // First check tenant-specific override
    const { rows: override } = await query(`
      SELECT is_enabled
      FROM feature_flag_override
      WHERE tenant_id = $1 AND tenant_type = $2 AND feature_key = $3
    `, [tenantId, tenantType, featureKey]);

    if (override.length > 0) {
      return override[0].is_enabled;
    }

    // Get tenant's plan features
    const subscription = await getTenantSubscription(tenantId, tenantType);
    if (subscription && subscription.features) {
      const featureValue = subscription.features[featureKey];
      if (featureValue !== undefined) {
        // If it's a boolean, return it
        if (typeof featureValue === 'boolean') {
          return featureValue;
        }
        // If it's a string (e.g., "enabled", "disabled"), check truthiness
        if (typeof featureValue === 'string') {
          return featureValue !== 'false' && featureValue !== 'disabled' && featureValue !== '';
        }
        // If it exists in features (truthy), return true
        return featureValue ? true : false;
      }
    }

    // Fallback to global flag
    const { rows: globalFlag } = await query(`
      SELECT is_enabled_globally
      FROM feature_flag
      WHERE feature_key = $1
    `, [featureKey]);

    return globalFlag.length > 0 ? globalFlag[0].is_enabled_globally : false;
  } catch (error) {
    logger.error('Check feature enabled error:', error);
    return false; // Default to disabled on error
  }
}

/**
 * Check if tenant has reached limit
 * @param {string} tenantId - Tenant ID
 * @param {string} tenantType - 'SUPPLIER' or 'RESTAURANT'
 * @param {string} meterType - Type of meter (e.g., 'products', 'warehouses')
 * @returns {Promise<{current: number, limit: number|null, isUnlimited: boolean, isOverLimit: boolean}>}
 */
export async function checkLimit(tenantId, tenantType, meterType) {
  try {
    const subscription = await getTenantSubscription(tenantId, tenantType);
    
    if (!subscription) {
      // No subscription = strict limits
      return {
        current: 0,
        limit: 0,
        isUnlimited: false,
        isOverLimit: true
      };
    }

    // Get limit from plan
    const limit = subscription.limits?.[meterType];
    const isUnlimited = limit === -1 || limit === null || limit === undefined;

    if (isUnlimited) {
      return {
        current: 0,
        limit: null,
        isUnlimited: true,
        isOverLimit: false
      };
    }

    // Get current usage from usage_meter
    const { rows: usage } = await query(`
      SELECT current_value
      FROM usage_meter
      WHERE tenant_id = $1 
        AND tenant_type = $2 
        AND meter_type = $3
        AND period_start_date = CURRENT_DATE
    `, [tenantId, tenantType, meterType]);

    const current = usage.length > 0 ? parseInt(usage[0].current_value || 0) : 0;

    return {
      current,
      limit: parseInt(limit),
      isUnlimited: false,
      isOverLimit: current >= limit
    };
  } catch (error) {
    logger.error('Check limit error:', error);
    return {
      current: 0,
      limit: 0,
      isUnlimited: false,
      isOverLimit: true // Fail safe
    };
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
    await query(`
      INSERT INTO usage_meter (tenant_id, tenant_type, meter_type, current_value, period_type, period_start_date)
      VALUES ($1, $2, $3, $4, 'DAILY', CURRENT_DATE)
      ON CONFLICT (tenant_id, tenant_type, meter_type, period_start_date)
      DO UPDATE SET 
        current_value = usage_meter.current_value + $4,
        last_updated = now(),
        is_over_limit = usage_meter.current_value + $4 >= COALESCE(usage_meter.limit_value, 0)
    `, [tenantId, tenantType, meterType, increment]);
  } catch (error) {
    logger.error('Increment usage error:', error);
    // Don't throw - usage tracking shouldn't fail operations
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
    const result = await checkLimit(tenantId, tenantType, meterType);
    const usagePercent = result.limit ? (result.current / result.limit) * 100 : 0;
    const isWarning = usagePercent >= 80 && usagePercent < 100;
    
    return {
      ...result,
      isWarning,
      usagePercent
    };
  } catch (error) {
    logger.error('Check usage with warning error:', error);
    return {
      current: 0,
      limit: 0,
      isUnlimited: false,
      isOverLimit: true,
      isWarning: false,
      usagePercent: 0
    };
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
    await query(`
      UPDATE usage_meter
      SET 
        current_value = GREATEST(0, current_value - $4),
        last_updated = now(),
        is_over_limit = GREATEST(0, current_value - $4) >= COALESCE(limit_value, 0)
      WHERE tenant_id = $1 
        AND tenant_type = $2 
        AND meter_type = $3
        AND period_start_date = CURRENT_DATE
    `, [tenantId, tenantType, meterType, decrement]);
  } catch (error) {
    logger.error('Decrement usage error:', error);
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
      const tenantId = getTenantId(req);
      const tenantType = getTenantType(req);

      const limitCheck = await checkLimit(tenantId, tenantType, meterType);

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
              meterType
            }
          },
          requestId: req.requestId,
        });
      }

      req.planLimit = limitCheck;
      next();
    } catch (error) {
      logger.error('Check plan limit middleware error:', error);
      next(error);
    }
  };
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
      const tenantId = getTenantId(req);
      const tenantType = getTenantType(req);

      const isEnabled = await isFeatureEnabled(tenantId, tenantType, featureKey);

      if (!isEnabled) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: {
            name: 'FEATURE_NOT_AVAILABLE',
            message: `This feature is not available in your current plan`,
            details: {
              featureKey
            }
          },
          requestId: req.requestId,
        });
      }

      next();
    } catch (error) {
      logger.error('Check feature middleware error:', error);
      next(error);
    }
  };
}

