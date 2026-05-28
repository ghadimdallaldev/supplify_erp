import { evaluatePlanFeatureValue } from './feature-flags.js'
import { getAllowedFeatureKeys } from './feature-keys.js'
import {
  RESTAURANT_LIMIT_KEYS,
  SUPPLIER_LIMIT_KEYS,
  SUPPLIER_ONLY_LIMIT_KEYS,
  isLimitKeyApplicable,
} from './limit-resolution.js'
import { normalizePlanCode, PLAN_TIER_ORDER } from './plan-codes.js'
import { FREE_TRIAL_MIN_DAYS, FREE_TRIAL_MAX_DAYS } from './platform-settings.js'

/** Product-removed keys; must not appear enabled on any plan. */
export const REMOVED_PLAN_FEATURE_KEYS = new Set(['approvals_budgets'])

/** Limits that apply only to restaurant plans (reject on supplier). */
export const RESTAURANT_ONLY_LIMIT_KEYS = new Set([
  'deal_redemptions_per_day',
  'quick_lists',
  'quick_list_items',
  'scheduled_quick_lists',
  'scheduled_order_grace_per_day',
  'suppliers_per_restaurant',
  'restaurant_inventory_skus',
])

const STORAGE_LIMIT_KEYS = new Set(['storage_mb'])
const USERS_LIMIT_KEY = 'users'
const WAREHOUSES_LIMIT_KEY = 'warehouses'

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidLimitScalar(value) {
  if (value === -1) return true
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return true
  return false
}

/**
 * @param {unknown} value
 * @returns {number}
 */
export function limitComparableRank(value) {
  if (value === -1 || value === null || value === undefined) return Number.POSITIVE_INFINITY
  const n = Number(value)
  return Number.isFinite(n) ? n : Number.NaN
}

/**
 * @param {unknown} limits
 * @param {unknown} features
 * @param {'RESTAURANT' | 'SUPPLIER'} tenantType
 * @returns {{ valid: boolean, message?: string, warnings?: string[] }}
 */
export function validatePlanLimitsAndFeatures(limits, features, tenantType) {
  if (!isPlainObject(limits)) {
    return { valid: false, message: 'limits must be a JSON object' }
  }
  if (!isPlainObject(features)) {
    return { valid: false, message: 'features must be a JSON object' }
  }

  const allowedLimitKeys =
    tenantType === 'RESTAURANT' ? [...RESTAURANT_LIMIT_KEYS] : [...SUPPLIER_LIMIT_KEYS]
  const allowedFeatureKeys = getAllowedFeatureKeys(tenantType)

  const unknownLimits = Object.keys(limits).filter((k) => !allowedLimitKeys.includes(k))
  const unknownFeatures = Object.keys(features).filter((k) => !allowedFeatureKeys.includes(k))

  if (unknownLimits.length > 0 || unknownFeatures.length > 0) {
    return {
      valid: false,
      message: `Unknown keys not allowed: limits: ${unknownLimits.join(', ') || 'none'}; features: ${unknownFeatures.join(', ') || 'none'}. Custom keys are not supported — use canonical catalog keys only.`,
    }
  }

  for (const key of Object.keys(limits)) {
    if (!isLimitKeyApplicable(tenantType, key)) {
      return {
        valid: false,
        message: `Limit "${key}" is not applicable for ${tenantType} plans`,
      }
    }
    if (tenantType === 'RESTAURANT' && SUPPLIER_ONLY_LIMIT_KEYS.has(key)) {
      return {
        valid: false,
        message: `Limit "promotions" is supplier-only; restaurants use deal_redemptions_per_day`,
      }
    }
    if (tenantType === 'SUPPLIER' && RESTAURANT_ONLY_LIMIT_KEYS.has(key)) {
      return {
        valid: false,
        message: `Limit "${key}" is restaurant-only and cannot be set on supplier plans`,
      }
    }
  }

  for (const [key, value] of Object.entries(limits)) {
    if (!isValidLimitScalar(value)) {
      return {
        valid: false,
        message: `Limit ${key} must be a non-negative integer or -1 (unlimited); null and strings are not allowed`,
      }
    }

    if (STORAGE_LIMIT_KEYS.has(key)) {
      if (value === -1) {
        return {
          valid: false,
          message: `Limit ${key} must be a positive storage cap in MB (unlimited storage is not supported)`,
        }
      }
      if (typeof value === 'number' && value < 1) {
        return {
          valid: false,
          message: `Limit ${key} must be at least 1 MB`,
        }
      }
    }

    if (key === USERS_LIMIT_KEY && typeof value === 'number' && value >= 0 && value < 1) {
      return {
        valid: false,
        message: 'Limit users must be at least 1, or -1 for unlimited',
      }
    }

    if (
      key === WAREHOUSES_LIMIT_KEY &&
      tenantType === 'SUPPLIER' &&
      typeof value === 'number' &&
      value < 0
    ) {
      return {
        valid: false,
        message: 'Limit warehouses must be 0 or greater, or -1 for unlimited',
      }
    }
  }

  for (const [key, value] of Object.entries(features)) {
    if (REMOVED_PLAN_FEATURE_KEYS.has(key)) {
      if (evaluatePlanFeatureValue(value)) {
        return {
          valid: false,
          message: `Feature "${key}" was removed from the product and cannot be enabled`,
        }
      }
      return {
        valid: false,
        message: `Feature "${key}" was removed from the product; remove the key from the plan JSON`,
      }
    }

    const t = typeof value
    if (value !== null && t !== 'boolean' && t !== 'string' && t !== 'number') {
      return {
        valid: false,
        message: `Feature ${key} must be boolean, string tier label, or false — nested objects are not allowed`,
      }
    }
  }

  return { valid: true, warnings: [] }
}

/**
 * Free Trial plan trial_days must stay within platform bounds (3–7).
 * @param {string | null | undefined} planCode
 * @param {number | undefined} trialDays
 */
export function validateFreePlanTrialDays(planCode, trialDays) {
  if (trialDays === undefined) return { valid: true }
  if (normalizePlanCode(planCode) !== 'free') return { valid: true }
  const n = Number(trialDays)
  if (!Number.isInteger(n)) {
    return {
      valid: false,
      message: `Free Trial trial_days must be an integer between ${FREE_TRIAL_MIN_DAYS} and ${FREE_TRIAL_MAX_DAYS}`,
    }
  }
  if (n < FREE_TRIAL_MIN_DAYS || n > FREE_TRIAL_MAX_DAYS) {
    return {
      valid: false,
      message: `Free Trial trial_days must be between ${FREE_TRIAL_MIN_DAYS} and ${FREE_TRIAL_MAX_DAYS} (got ${n})`,
    }
  }
  return { valid: true }
}

/**
 * Enterprise is admin-assigned only; block self-serve catalog activation without explicit confirm.
 * @param {string | null | undefined} planCode
 * @param {boolean | undefined} isActive
 * @param {boolean | undefined} confirmEnterpriseActivation
 */
export function validateEnterprisePlanActivation(planCode, isActive, confirmEnterpriseActivation) {
  if (isActive !== true) return { valid: true }
  if (normalizePlanCode(planCode) !== 'enterprise') return { valid: true }
  if (confirmEnterpriseActivation === true) return { valid: true }
  return {
    valid: false,
    message:
      'Enterprise plan cannot be activated for self-serve catalog without confirmEnterpriseActivation: true',
  }
}

/**
 * Non-blocking warnings when a lower tier limit exceeds a higher tier (same tenant_type).
 * @param {string} planCode
 * @param {Record<string, unknown>} limits
 * @param {Array<{ code: string, limits?: Record<string, unknown> }>} peerPlans
 * @returns {string[]}
 */
export function buildTierLadderWarnings(planCode, limits, peerPlans) {
  const myCode = normalizePlanCode(planCode)
  const myIdx = PLAN_TIER_ORDER.indexOf(myCode)
  if (myIdx < 0) return []

  const warnings = []
  const myLimits = limits || {}

  for (const peer of peerPlans) {
    const peerCode = normalizePlanCode(peer.code)
    const peerIdx = PLAN_TIER_ORDER.indexOf(peerCode)
    if (peerIdx < 0 || peerIdx === myIdx) continue

    const peerLimits = peer.limits || {}
    const allKeys = new Set([...Object.keys(myLimits), ...Object.keys(peerLimits)])

    for (const key of allKeys) {
      const myVal = myLimits[key]
      const peerVal = peerLimits[key]
      if (myVal === undefined || peerVal === undefined) continue

      const myRank = limitComparableRank(myVal)
      const peerRank = limitComparableRank(peerVal)
      if (!Number.isFinite(myRank) || !Number.isFinite(peerRank)) continue

      if (peerIdx < myIdx && peerRank > myRank) {
        warnings.push(
          `Tier ladder: ${peerCode} ${key}=${peerVal} exceeds ${myCode} ${key}=${myVal} (lower tier should not beat higher tier)`
        )
      }
      if (peerIdx > myIdx && myRank > peerRank) {
        warnings.push(
          `Tier ladder: ${myCode} ${key}=${myVal} exceeds ${peerCode} ${key}=${peerVal} (lower tier should not beat higher tier)`
        )
      }
    }
  }

  return [...new Set(warnings)]
}

/**
 * @param {string | null | undefined} planCode
 * @param {boolean | undefined} confirmEnterpriseActivation
 */
export function validateEnterprisePlanCreate(planCode, confirmEnterpriseActivation) {
  if (normalizePlanCode(planCode) !== 'enterprise') return { valid: true }
  if (confirmEnterpriseActivation === true) return { valid: true }
  return {
    valid: false,
    message:
      'Creating an Enterprise plan row requires confirmEnterpriseActivation: true; prefer admin assignment of existing Enterprise catalog',
  }
}
