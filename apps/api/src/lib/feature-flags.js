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

/**
 * Resolve all allowed features in two DB round-trips (plan + global + tenant overrides).
 * @param {string} tenantId
 * @param {'RESTAURANT'|'SUPPLIER'} tenantType
 * @param {Record<string, unknown>|null|undefined} planFeatures
 * @returns {Promise<{ features: Record<string, boolean>, featureSources: Record<string, string> }>}
 */
export async function resolveAllFeaturesForTenant(tenantId, tenantType, planFeatures) {
  const keys = getAllowedFeatureKeys(tenantType)
  /** @type {Record<string, boolean|null>} */
  const globalMap = {}
  /** @type {Record<string, boolean>} */
  const tenantMap = {}

  try {
    const { rows } = await query(
      `SELECT feature_key, global_override FROM feature_flag WHERE feature_key = ANY($1::text[])`,
      [keys]
    )
    for (const row of rows) {
      globalMap[row.feature_key] = row.global_override
    }
  } catch (error) {
    if (error.code !== '42P01') throw error
  }

  try {
    const { rows } = await query(
      `SELECT feature_key, is_enabled FROM feature_flag_override WHERE tenant_id = $1 AND tenant_type = $2 AND feature_key = ANY($3::text[])`,
      [tenantId, tenantType, keys]
    )
    for (const row of rows) {
      tenantMap[row.feature_key] = row.is_enabled === true
    }
  } catch (error) {
    if (error.code !== '42P01') throw error
  }

  const features = {}
  const featureSources = {}
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(tenantMap, key)) {
      features[key] = tenantMap[key]
      featureSources[key] = 'tenant_override'
      continue
    }
    if (Object.prototype.hasOwnProperty.call(globalMap, key) && globalMap[key] !== null) {
      features[key] = globalMap[key] === true
      featureSources[key] = 'global'
      continue
    }
    if (planFeatures && typeof planFeatures === 'object' && key in planFeatures) {
      features[key] = evaluatePlanFeatureValue(planFeatures[key])
      featureSources[key] = 'plan'
    } else {
      features[key] = false
      featureSources[key] = 'default'
    }
  }

  return { features, featureSources }
}

/** Used by requireFeature middleware (via subscription.js). */
const FEATURE_ALIASES = {
  fulfillment: 'fulfillment_tools',
  driver_management: 'fulfillment_tools',
}

export async function isFeatureEnabledForTenant(tenantId, tenantType, featureKey) {
  try {
    const { getTenantSubscription } = await import('./subscription.js')
    const subscription = await getTenantSubscription(tenantId, tenantType)
    let result = await resolveFeatureEnabled(
      tenantId,
      tenantType,
      featureKey,
      subscription?.features
    )
    if (!result.enabled && FEATURE_ALIASES[featureKey]) {
      result = await resolveFeatureEnabled(
        tenantId,
        tenantType,
        FEATURE_ALIASES[featureKey],
        subscription?.features
      )
    }
    return result.enabled
  } catch (error) {
    logger.error('isFeatureEnabledForTenant error', { error: error.message, featureKey })
    return false
  }
}

export async function listGlobalFeatureFlags() {
  const byKey = new Map()
  try {
    const { rows } = await query(
      `SELECT feature_key, feature_name, description, global_override, updated_at
       FROM feature_flag
       ORDER BY feature_key`
    )
    for (const r of rows) {
      byKey.set(r.feature_key, r)
    }
  } catch (error) {
    if (error.code === '42P01') return []
    throw error
  }
  return [...ALL_FEATURE_KEYS].sort().map((featureKey) => {
    const r = byKey.get(featureKey)
    return {
      featureKey,
      featureName: r?.feature_name ?? featureDisplayName(featureKey),
      description: r?.description ?? null,
      /** null = inherit from each tenant's plan */
      globalOverride: r ? r.global_override : null,
      updatedAt: r?.updated_at ? new Date(r.updated_at).toISOString() : null,
    }
  })
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

  const { features, featureSources } = await resolveAllFeaturesForTenant(
    tenantId,
    tenantType,
    planFeatures
  )
  return allowed.map((key) => ({
    featureKey: key,
    featureName: featureDisplayName(key),
    enabled: features[key],
    source: featureSources[key],
    planValue: planFeatures[key] ?? null,
    tenantOverride: overrideByKey[key] || null,
  }))
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
