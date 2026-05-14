import type { Entitlements } from '../types'

function limitNumber(value: unknown): number | null {
  if (value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function featureEnabled(value: unknown): boolean {
  if (value === true) return true
  if (value === false || value == null) return false
  if (typeof value === 'string') return value !== 'false' && value.length > 0
  return Boolean(value)
}

/** Whether the tenant may create another restaurant branch under the current plan. */
export function canAddBranches(entitlements: Entitlements | null | undefined, currentCount = 0): boolean {
  if (!entitlements) return false
  const limit = limitNumber(entitlements.limits?.branches)
  if (limit === 0) return false
  if (!featureEnabled(entitlements.features?.multi_branch)) return false
  if (limit == null || limit === -1) return true
  return currentCount < limit
}

/** Whether the tenant may create another supplier warehouse under the current plan. */
export function canAddWarehouses(entitlements: Entitlements | null | undefined, currentCount = 0): boolean {
  if (!entitlements) return false
  const limit = limitNumber(entitlements.limits?.warehouses)
  if (limit === 0) return false
  if (limit == null || limit === -1) return true
  return currentCount < limit
}
