import { query } from './db.js'
import { logger } from './logger.js'
import {
  ALL_FEATURE_KEYS,
  featureDisplayName,
  getAllowedFeatureKeys,
  isFeatureKeyAllowed,
} from './feature-keys.js'

/** @returns {boolean} */
export function evaluatePlanFeatureValue(featureValue) {
  if (featureValue === undefined) return false
  if (typeof featureValue === 'boolean') return featureValue
  if (typeof featureValue === 'string') {
    return featureValue !== 'false' && featureValue !== 'disabled' && featureValue !== ''
  }
  return Boolean(featureValue)
}

async function getTenantOverride(tenantId, tenantType, featureKey) {
  try {
    const { rows } = await query(
      `SELECT is_enabled, reason, updated_at
       FROM feature_flag_override
       WHERE tenant_id = $1 AND tenant_type = $2 AND feature_key = $3`,
      [tenantId, tenantType, featureKey]
    )
    return rows[0] || null
  } catch (error) {
    if (error.code === '42P01') return null
    throw error
  }
}

async function getGlobalOverride(featureKey) {
  try {
    const { rows } = await query(
      `SELECT global_override, feature_name, description
       FROM feature_flag
       WHERE feature_key = $1`,
      [featureKey]
    )
    return rows[0] || null
  } catch (error) {
    if (error.code === '42P01') return null
    throw error
  }
}

/**
 * Resolve whether a feature is enabled for a tenant.
 * Priority: tenant override → global override → subscription plan.
 * @returns {Promise<{ enabled: boolean, source: 'tenant_override'|'global'|'plan'|'default' }>}
 */
export async function resolveFeatureEnabled(tenantId, tenantType, featureKey, planFeatures) {
  const tenantRow = await getTenantOverride(tenantId, tenantType, featureKey)
  if (tenantRow) {
    return { enabled: tenantRow.is_enabled, source: 'tenant_override' }
  }

  const globalRow = await getGlobalOverride(featureKey)
  if (globalRow && globalRow.global_override !== null) {
    return { enabled: globalRow.global_override, source: 'global' }
  }

  if (planFeatures && featureKey in planFeatures) {
    return { enabled: evaluatePlanFeatureValue(planFeatures[featureKey]), source: 'plan' }
  }

  return { enabled: false, source: 'default' }
}

/** Used by requireFeature middleware (via subscription.js). */
export async function isFeatureEnabledForTenant(tenantId, tenantType, featureKey) {
  try {
    const { getTenantSubscription } = await import('./subscription.js')
    const subscription = await getTenantSubscription(tenantId, tenantType)
    const result = await resolveFeatureEnabled(
      tenantId,
      tenantType,
      featureKey,
      subscription?.features
    )
    return result.enabled
  } catch (error) {
    logger.error('isFeatureEnabledForTenant error', { error: error.message, featureKey })
    return false
  }
}

export async function listGlobalFeatureFlags() {
  try {
    const { rows } = await query(
      `SELECT feature_key, feature_name, description, global_override, updated_at
       FROM feature_flag
       ORDER BY feature_key`
    )
    return rows.map((r) => ({
      featureKey: r.feature_key,
      featureName: r.feature_name,
      description: r.description,
      /** null = inherit from each tenant's plan */
      globalOverride: r.global_override,
      updatedAt: r.updated_at,
    }))
  } catch (error) {
    if (error.code === '42P01') return []
    throw error
  }
}

/**
 * @param {'inherit'|'on'|'off'} mode
 */
export async function setGlobalFeatureOverride(featureKey, mode) {
  if (!ALL_FEATURE_KEYS.includes(featureKey)) {
    throw new Error(`Unknown feature key: ${featureKey}`)
  }
  const globalOverride =
    mode === 'inherit' ? null : mode === 'on' ? true : mode === 'off' ? false : null
  if (mode !== 'inherit' && mode !== 'on' && mode !== 'off') {
    throw new Error('mode must be inherit, on, or off')
  }
  const { rows } = await query(
    `INSERT INTO feature_flag (feature_key, feature_name, global_override, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (feature_key)
     DO UPDATE SET global_override = EXCLUDED.global_override, updated_at = now()
     RETURNING feature_key, feature_name, description, global_override, updated_at`,
    [featureKey, featureDisplayName(featureKey), globalOverride]
  )
  return {
    featureKey: rows[0].feature_key,
    featureName: rows[0].feature_name,
    description: rows[0].description,
    globalOverride: rows[0].global_override,
    updatedAt: rows[0].updated_at,
  }
}

export async function listTenantFeatureOverrides(tenantId, tenantType) {
  try {
    const { rows } = await query(
      `SELECT feature_key, is_enabled, reason, created_by, updated_at
       FROM feature_flag_override
       WHERE tenant_id = $1 AND tenant_type = $2
       ORDER BY feature_key`,
      [tenantId, tenantType]
    )
    return rows.map((r) => ({
      featureKey: r.feature_key,
      enabled: r.is_enabled,
      reason: r.reason,
      createdBy: r.created_by,
      updatedAt: r.updated_at,
    }))
  } catch (error) {
    if (error.code === '42P01') return []
    throw error
  }
}

/**
 * Effective feature map for admin UI (plan + global + tenant overrides).
 */
export async function getEffectiveFeaturesForTenant(tenantId, tenantType) {
  const { getTenantSubscription } = await import('./subscription.js')
  const subscription = await getTenantSubscription(tenantId, tenantType)
  const planFeatures = subscription?.features || {}
  const allowed = getAllowedFeatureKeys(tenantType)
  const overrides = await listTenantFeatureOverrides(tenantId, tenantType)
  const overrideByKey = Object.fromEntries(overrides.map((o) => [o.featureKey, o]))

  const features = []
  for (const key of allowed) {
    const resolved = await resolveFeatureEnabled(tenantId, tenantType, key, planFeatures)
    features.push({
      featureKey: key,
      featureName: featureDisplayName(key),
      enabled: resolved.enabled,
      source: resolved.source,
      planValue: planFeatures[key] ?? null,
      tenantOverride: overrideByKey[key] || null,
    })
  }
  return features
}

export async function setTenantFeatureOverride(
  tenantId,
  tenantType,
  featureKey,
  enabled,
  reason,
  createdBy
) {
  if (!isFeatureKeyAllowed(featureKey, tenantType)) {
    throw new Error(`Feature ${featureKey} is not valid for tenant type ${tenantType}`)
  }
  const { rows } = await query(
    `INSERT INTO feature_flag_override (
       tenant_id, tenant_type, feature_key, is_enabled, reason, created_by, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (tenant_id, tenant_type, feature_key)
     DO UPDATE SET
       is_enabled = EXCLUDED.is_enabled,
       reason = EXCLUDED.reason,
       created_by = EXCLUDED.created_by,
       updated_at = now()
     RETURNING feature_key, is_enabled, reason, created_by, updated_at`,
    [tenantId, tenantType, featureKey, enabled, reason || null, createdBy || null]
  )
  return {
    featureKey: rows[0].feature_key,
    enabled: rows[0].is_enabled,
    reason: rows[0].reason,
    createdBy: rows[0].created_by,
    updatedAt: rows[0].updated_at,
  }
}

export async function clearTenantFeatureOverride(tenantId, tenantType, featureKey) {
  await query(
    `DELETE FROM feature_flag_override
     WHERE tenant_id = $1 AND tenant_type = $2 AND feature_key = $3`,
    [tenantId, tenantType, featureKey]
  )
}
