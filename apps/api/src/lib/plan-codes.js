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

const LEGACY_PUBLIC_NAMES = new Set(['Bronze', 'Silver', 'Gold', 'Platinum'])

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
  if (code === 'free') return '30-day Free Trial'
  const name = (planName || '').trim()
  if (name && !LEGACY_PUBLIC_NAMES.has(name)) return name
  if (code === 'silver') return 'Growth'
  if (code === 'gold') return 'Scale'
  if (code === 'platinum') return 'Scale'
  return 'Plan'
}

/**
 * Tenant-aware customer-facing plan label for compatibility-preserved codes.
 * @param {string | null | undefined} planCode
 * @param {string | null | undefined} tenantType
 * @param {string | null | undefined} [planName]
 * @returns {string}
 */
export function formatTenantPlanDisplayName(planCode, tenantType, planName) {
  const code = normalizePlanCode(planCode)
  if (code === 'free') return '30-day Free Trial'
  const name = (planName || '').trim()
  if (name && !LEGACY_PUBLIC_NAMES.has(name)) return name

  const type = String(tenantType || '').toUpperCase()
  if (type === 'SUPPLIER') {
    if (code === 'gold') return 'Supplier Growth'
    if (code === 'platinum') return 'Supplier Scale'
    if (code === 'silver') return 'Supplier Growth'
  }

  if (type === 'RESTAURANT') {
    if (code === 'silver') return 'Restaurant Growth'
    if (code === 'gold') return 'Restaurant Scale'
    if (code === 'platinum') return 'Restaurant Custom'
  }

  return formatPlanDisplayName(code, name)
}

/**
 * Lowest public paid plan code for a tenant type under the four-plan model.
 * @param {string | null | undefined} tenantType
 * @returns {string}
 */
export function defaultPaidPlanCodeForTenant(tenantType) {
  return String(tenantType || '').toUpperCase() === 'SUPPLIER' ? 'gold' : 'silver'
}
