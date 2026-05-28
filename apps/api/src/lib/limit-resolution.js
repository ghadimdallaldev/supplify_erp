import { query } from './db.js'

/** Enforced in API but not shown in subscription/usage UI (Free-tier scheduled-order overflow only). */
export const HIDDEN_ENTITLEMENT_LIMIT_KEYS = new Set(['scheduled_order_grace_per_day'])

export const RESTAURANT_LIMIT_KEYS = [
  'branches',
  'users',
  'orders_per_day',
  'suppliers_per_restaurant',
  'restaurant_inventory_skus',
  'chats_per_day',
  'open_conversations',
  'storage_mb',
  'quick_lists',
  'quick_list_items',
  'scheduled_quick_lists',
  'scheduled_order_grace_per_day',
  'deal_redemptions_per_day',
]

export function stripHiddenEntitlementLimits(limits, usage, overrides = []) {
  for (const key of HIDDEN_ENTITLEMENT_LIMIT_KEYS) {
    if (limits) delete limits[key]
    if (usage) delete usage[key]
  }
  return overrides.filter((o) => !HIDDEN_ENTITLEMENT_LIMIT_KEYS.has(o.limitKey))
}

export const SUPPLIER_LIMIT_KEYS = [
  'branches',
  'warehouses',
  'users',
  'supplier_products_skus',
  'chats_per_day',
  'open_conversations',
  'storage_mb',
  'promotions',
]

export function limitKeysForTenantType(tenantType) {
  return tenantType === 'RESTAURANT' ? [...RESTAURANT_LIMIT_KEYS] : [...SUPPLIER_LIMIT_KEYS]
}

/** Supplier-only: active supplier deals/promotions count. Restaurants use deal_redemptions_per_day. */
export const SUPPLIER_ONLY_LIMIT_KEYS = new Set(['promotions'])

export function isLimitKeyApplicable(tenantType, limitKey) {
  if (tenantType === 'RESTAURANT' && SUPPLIER_ONLY_LIMIT_KEYS.has(limitKey)) return false
  return limitKeysForTenantType(tenantType).includes(limitKey)
}

/**
 * Human-readable plan limit for tier logger / admin catalog display.
 * Missing keys are not applicable (not unlimited). Only explicit -1 means unlimited.
 * @param {unknown} value
 * @param {{ defined?: boolean }} [opts]
 */
export function formatPlanLimitDisplay(value, opts = {}) {
  const defined = opts.defined !== false
  if (!defined) return 'n/a'
  if (value === -1) return 'unlimited'
  if (value === null || value === undefined) return 'unlimited'
  return String(value)
}

/** Canonical Free-tier defaults when plan JSON is missing keys (e.g. migration not applied yet). */
export const FREE_TIER_LIMIT_PATCHES = {
  RESTAURANT: {
    branches: 1,
    users: 1,
    orders_per_day: 3,
    suppliers_per_restaurant: 1,
    restaurant_inventory_skus: 10,
    chats_per_day: 3,
    open_conversations: 1,
    storage_mb: 50,
    quick_lists: 1,
    quick_list_items: 1,
    scheduled_quick_lists: 1,
    scheduled_order_grace_per_day: 1,
  },
  SUPPLIER: {
    branches: 1,
    warehouses: 0,
    users: 1,
    supplier_products_skus: 10,
    chats_per_day: 3,
    open_conversations: 1,
    storage_mb: 50,
    promotions: 1,
  },
}

/**
 * Fill null/missing limit keys on Free tier so settings UI and enforcement stay consistent.
 */
export function fillMissingFreeTierLimits(limits, tenantType, planCode) {
  if ((planCode || '').toLowerCase() !== 'free') return limits
  const patch = FREE_TIER_LIMIT_PATCHES[tenantType]
  if (!patch) return limits
  const keys = limitKeysForTenantType(tenantType)
  for (const key of keys) {
    if (limits[key] == null && patch[key] != null) {
      limits[key] = patch[key]
    }
  }
  return limits
}

function parseLimitValue(value) {
  if (value === -1 || value === null || value === undefined) return null
  const n = parseInt(value, 10)
  return Number.isFinite(n) ? n : null
}

function applyIncreaseOnly(baseLimit, overrideValue) {
  const base = parseLimitValue(baseLimit)
  const override = parseLimitValue(overrideValue)
  if (override == null) return base
  if (base == null) return override
  return Math.max(base, override)
}

function isOverrideRowActive(row) {
  if (row?.is_active === false) return false
  if (row?.expiration_date && new Date(row.expiration_date) <= new Date()) return false
  return true
}

/**
 * Resolve effective limit: tenant override > plan override > plan default.
 * Overrides may only increase limits (never reduce below plan default).
 */
export async function resolveEffectiveLimit({
  tenantId,
  tenantType,
  limitKey,
  planId,
  planLimits = {},
}) {
  const baseLimit = planLimits?.[limitKey]
  let effective = parseLimitValue(baseLimit)

  let planOverride = null
  let tenantOverride = null

  if (planId) {
    try {
      const { rows } = await query(
        `SELECT override_value, expiration_date, is_active, reason, id
         FROM plan_limit_override
         WHERE plan_id = $1 AND limit_type = $2`,
        [planId, limitKey]
      )
      if (rows[0] && isOverrideRowActive(rows[0])) {
        planOverride = rows[0]
        effective = applyIncreaseOnly(baseLimit, planOverride.override_value)
      }
    } catch (error) {
      if (error.code !== '42P01') throw error
    }
  }

  try {
    const { rows } = await query(
      `SELECT override_value, expiration_date, is_active, reason, id
       FROM tenant_limit_override
       WHERE tenant_id = $1 AND tenant_type = $2 AND limit_type = $3`,
      [tenantId, tenantType, limitKey]
    )
    if (rows[0] && isOverrideRowActive(rows[0])) {
      tenantOverride = rows[0]
      effective = applyIncreaseOnly(baseLimit, tenantOverride.override_value)
    }
  } catch (error) {
    if (error.code !== '42P01') throw error
  }

  return {
    limitKey,
    baseLimit: parseLimitValue(baseLimit),
    effectiveLimit: effective,
    planOverride,
    tenantOverride,
    isUnlimited: effective == null,
  }
}

/**
 * Discover limit keys from plan catalog JSONB (union with canonical keys).
 */
export async function discoverLimitKeys(tenantType = null) {
  const canonical = new Set()
  if (!tenantType || tenantType === 'RESTAURANT') {
    RESTAURANT_LIMIT_KEYS.forEach((k) => canonical.add(k))
  }
  if (!tenantType || tenantType === 'SUPPLIER') {
    SUPPLIER_LIMIT_KEYS.forEach((k) => canonical.add(k))
  }

  const params = []
  let sql = `SELECT tenant_type, limits FROM subscription_plan WHERE is_active = TRUE`
  if (tenantType) {
    params.push(tenantType)
    sql += ` AND tenant_type = $1`
  }
  const { rows } = await query(sql, params)
  for (const row of rows) {
    const limits = row.limits || {}
    Object.keys(limits).forEach((k) => canonical.add(k))
  }

  return [...canonical].sort()
}
