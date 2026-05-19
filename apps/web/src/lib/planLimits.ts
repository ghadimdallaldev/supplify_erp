import type { Entitlements } from '../types'

function limitNumber(value: unknown): number | null {
  if (value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function featureEnabled(value: unknown): boolean {
  if (value === true) return true
  if (value === false || value == null) return false
  if (typeof value === 'string') return value !== 'false' && value.length > 0
  return Boolean(value)
}

export type BranchAddGate = {
  canAdd: boolean
  reason: 'ok' | 'at_limit' | 'feature_unavailable'
  current: number
  limit: number | null
  planName: string | null
}

/** Whether the tenant may create another restaurant/supplier branch under the current plan. */
export function getBranchAddGate(
  entitlements: Entitlements | null | undefined,
  currentCount = 0
): BranchAddGate {
  const planName = entitlements?.plan?.name ?? null
  if (!entitlements) {
    return {
      canAdd: false,
      reason: 'feature_unavailable',
      current: currentCount,
      limit: null,
      planName,
    }
  }

  const limit = limitNumber(entitlements.limits?.branches)
  const multiBranch = featureEnabled(entitlements.features?.multi_branch)

  if (limit === 0) {
    if (currentCount > 0) {
      return {
        canAdd: false,
        reason: 'at_limit',
        current: currentCount,
        limit: 0,
        planName,
      }
    }
    return {
      canAdd: false,
      reason: 'feature_unavailable',
      current: currentCount,
      limit: 0,
      planName,
    }
  }

  if (limit != null && limit !== -1) {
    if (currentCount >= limit) {
      return { canAdd: false, reason: 'at_limit', current: currentCount, limit, planName }
    }
    if (limit > 0 || multiBranch) {
      return { canAdd: true, reason: 'ok', current: currentCount, limit, planName }
    }
    return {
      canAdd: false,
      reason: 'feature_unavailable',
      current: currentCount,
      limit,
      planName,
    }
  }

  if (!multiBranch) {
    return {
      canAdd: false,
      reason: 'feature_unavailable',
      current: currentCount,
      limit,
      planName,
    }
  }

  return { canAdd: true, reason: 'ok', current: currentCount, limit, planName }
}

export function formatBranchGateMessage(gate: BranchAddGate): string {
  const plan = gate.planName ?? 'your current plan'

  if (gate.reason === 'at_limit') {
    if (gate.limit != null && gate.limit > 0) {
      return `You've reached your branch account limit (${gate.current}/${gate.limit}, including your main location) on ${plan}. Upgrade for more locations.`
    }
    if (gate.current > 0) {
      return `You have ${gate.current} branch account${gate.current === 1 ? '' : 's'}, but ${plan} no longer allows adding more. Upgrade to add locations.`
    }
    return `You've reached your branch limit on ${plan}. Upgrade for more locations.`
  }

  const planLower = plan.toLowerCase()
  if (
    planLower.includes('gold') ||
    planLower.includes('platinum') ||
    planLower.includes('enterprise')
  ) {
    return `Branch accounts are not enabled for this ${plan} subscription. Contact support if you believe this is an error.`
  }
  if (planLower.includes('silver') || planLower.includes('bronze')) {
    return `Additional branch accounts require Gold or higher. Your plan is ${plan}.`
  }
  return `Additional branch accounts aren't included on ${plan}. Upgrade to Gold or higher to add separate locations.`
}

export function canAddBranches(
  entitlements: Entitlements | null | undefined,
  currentCount = 0
): boolean {
  return getBranchAddGate(entitlements, currentCount).canAdd
}

/** Warehouse management feature (Bronze+). */
export function warehousesFeatureEnabled(entitlements: Entitlements | null | undefined): boolean {
  return featureEnabled(entitlements?.features?.warehouses)
}

/** Plan allows multi-warehouse routing (Gold+); supplier toggle is separate. */
export function multiWarehousePlanEnabled(entitlements: Entitlements | null | undefined): boolean {
  return featureEnabled(entitlements?.features?.multi_warehouse)
}

export function isMultiWarehouseActive(
  entitlements: Entitlements | null | undefined,
  supplier?: { multi_warehouse_enabled?: boolean; fulfillment_mode?: string } | null
): boolean {
  return (
    multiWarehousePlanEnabled(entitlements) &&
    Boolean(supplier?.multi_warehouse_enabled) &&
    supplier?.fulfillment_mode === 'multi'
  )
}

/** Whether the tenant may create another supplier warehouse under the current plan. */
export function canAddWarehouses(
  entitlements: Entitlements | null | undefined,
  currentCount = 0
): boolean {
  if (!entitlements) return false
  if (!warehousesFeatureEnabled(entitlements)) return false
  const limit = limitNumber(entitlements.limits?.warehouses)
  if (limit === 0) return false
  if (limit == null || limit === -1) return true
  return currentCount < limit
}

/** Logo upload and brand theming (Gold: logo + colors; Platinum: white-label). */
export function canUseCustomBranding(entitlements: Entitlements | null | undefined): boolean {
  return featureEnabled(entitlements?.features?.custom_branding)
}

export function customBrandingUpgradeMessage(planName?: string | null): string {
  const plan = planName ?? 'your current plan'
  return `Custom branding isn't included on ${plan}. Upgrade to Gold for logo and colors, or Platinum for white-label.`
}
