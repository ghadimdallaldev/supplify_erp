import { evaluatePlanFeatureValue } from './feature-flags.js'
import { PLAN_TIER_ORDER, normalizePlanCode } from './plan-codes.js'
import {
  RESTAURANT_FEATURE_KEYS,
  SUPPLIER_FEATURE_KEYS,
  KNOWN_EXTRA_FEATURE_KEYS,
} from './feature-keys.js'
import { RESTAURANT_LIMIT_KEYS, SUPPLIER_LIMIT_KEYS } from './limit-resolution.js'

const ACTIVE_TIERS = PLAN_TIER_ORDER

/** @typedef {{ code: string, tenant_type: string, limits?: Record<string, unknown>, features?: Record<string, unknown> }} PlanRow */

/**
 * @param {unknown} value
 * @returns {number|null}
 */
export function normalizeLimitForMonotonicCompare(value) {
  if (value === -1) return Number.MAX_SAFE_INTEGER
  if (value === null || value === undefined) return null
  const n = parseInt(String(value), 10)
  return Number.isFinite(n) ? n : null
}

/**
 * @param {Record<string, unknown>} obj
 * @param {string[]} canonical
 * @param {Set<string>} [knownExtra]
 */
export function findExtraKeys(obj, canonical, knownExtra = new Set()) {
  const canonicalSet = new Set(canonical)
  return Object.keys(obj || {}).filter((k) => !canonicalSet.has(k) && !knownExtra.has(k))
}

/**
 * @param {PlanRow[]} plans
 * @param {'RESTAURANT'|'SUPPLIER'} tenantType
 */
export function verifyTenantTypeMatrix(plans, tenantType) {
  const featureKeys = tenantType === 'RESTAURANT' ? RESTAURANT_FEATURE_KEYS : SUPPLIER_FEATURE_KEYS
  const limitKeys = tenantType === 'RESTAURANT' ? RESTAURANT_LIMIT_KEYS : SUPPLIER_LIMIT_KEYS
  const knownExtra = new Set(KNOWN_EXTRA_FEATURE_KEYS)

  const failures = []
  const warnings = []

  const byCode = Object.fromEntries(
    plans.filter((p) => p.tenant_type === tenantType).map((p) => [normalizePlanCode(p.code), p])
  )

  for (const tier of ACTIVE_TIERS) {
    const plan = byCode[tier]
    if (!plan) {
      failures.push(`${tenantType}/${tier}: no active subscription_plan row`)
      continue
    }
    const limits = plan.limits || {}
    const features = plan.features || {}

    for (const key of limitKeys) {
      if (!(key in limits)) {
        failures.push(`${tenantType}/${tier}: missing limit key "${key}"`)
      }
    }
    for (const key of featureKeys) {
      if (!(key in features)) {
        failures.push(`${tenantType}/${tier}: missing feature key "${key}"`)
      }
    }

    const extraLimits = findExtraKeys(limits, limitKeys)
    const extraFeatures = findExtraKeys(features, featureKeys, knownExtra)
    for (const k of extraLimits) {
      warnings.push(`${tenantType}/${tier}: extra limit key "${k}" (not in canonical list)`)
    }
    for (const k of extraFeatures) {
      warnings.push(`${tenantType}/${tier}: extra feature key "${k}" (not in canonical list)`)
    }
  }

  for (let i = 0; i < ACTIVE_TIERS.length - 1; i++) {
    const lowerTier = ACTIVE_TIERS[i]
    const higherTier = ACTIVE_TIERS[i + 1]
    const lower = byCode[lowerTier]
    const higher = byCode[higherTier]
    if (!lower || !higher) continue

    const lowerLimits = lower.limits || {}
    const higherLimits = higher.limits || {}
    for (const key of limitKeys) {
      const lo = normalizeLimitForMonotonicCompare(lowerLimits[key])
      const hi = normalizeLimitForMonotonicCompare(higherLimits[key])
      if (lo == null || hi == null) continue
      if (hi < lo) {
        failures.push(
          `${tenantType}: limit "${key}" decreases ${lowerTier}(${lowerLimits[key]}) -> ${higherTier}(${higherLimits[key]})`
        )
      }
    }

    const lowerFeatures = lower.features || {}
    const higherFeatures = higher.features || {}
    for (const key of featureKeys) {
      const loOn = evaluatePlanFeatureValue(lowerFeatures[key])
      const hiOn = evaluatePlanFeatureValue(higherFeatures[key])
      if (loOn && !hiOn) {
        failures.push(
          `${tenantType}: feature "${key}" enabled on ${lowerTier} but disabled on ${higherTier}`
        )
      }
    }
  }

  return { failures, warnings }
}

/**
 * @param {PlanRow[]} plans
 */
export function verifyTierMatrix(plans) {
  const restaurant = verifyTenantTypeMatrix(plans, 'RESTAURANT')
  const supplier = verifyTenantTypeMatrix(plans, 'SUPPLIER')
  return {
    failures: [...restaurant.failures, ...supplier.failures],
    warnings: [...restaurant.warnings, ...supplier.warnings],
  }
}

/**
 * @param {{ failures: string[], warnings: string[] }} result
 */
export function formatTierMatrixReport(result) {
  const lines = []
  if (result.failures.length) {
    lines.push('FAILURES:')
    for (const f of result.failures) lines.push(`  ✗ ${f}`)
  }
  if (result.warnings.length) {
    lines.push('WARNINGS:')
    for (const w of result.warnings) lines.push(`  ⚠ ${w}`)
  }
  if (!result.failures.length && !result.warnings.length) {
    lines.push('OK: all canonical keys present; tier ladder is monotonic.')
  }
  return lines.join('\n')
}
