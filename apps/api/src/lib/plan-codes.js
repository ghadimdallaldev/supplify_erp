/**
 * Canonical self-serve plan codes and legacy aliases.
 * bronze -> silver rename (migration 0116); keep alias for backward-compatible API input.
 */

/** @type {readonly string[]} */
export const PLAN_TIER_ORDER = ['free', 'silver', 'gold', 'platinum']

/** @type {Record<string, string>} */
export const LEGACY_PLAN_CODE_ALIASES = {
  bronze: 'silver',
}

/**
 * Normalize plan code for lookups, ordering, and comparisons.
 * @param {string | null | undefined} code
 * @returns {string}
 */
export function normalizePlanCode(code) {
  const c = (code || '').toLowerCase().trim()
  return LEGACY_PLAN_CODE_ALIASES[c] ?? c
}

/**
 * User-facing plan label; never returns Bronze.
 * @param {string | null | undefined} planCode
 * @param {string | null | undefined} [planName]
 * @returns {string}
 */
export function formatPlanDisplayName(planCode, planName) {
  const code = normalizePlanCode(planCode)
  if (code === 'free') return 'Free Trial'
  if (code === 'silver') return 'Silver'
  const name = (planName || '').trim()
  if (name === 'Bronze') return 'Silver'
  if (name) return name
  return 'Plan'
}
