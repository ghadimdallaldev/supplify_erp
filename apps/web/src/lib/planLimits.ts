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

export type OrderPlaceGate = {
  canPlace: boolean
  reason: 'ok' | 'at_limit' | 'would_exceed' | 'unlimited' | 'unknown'
  current: number
  limit: number | null
  ordersRequested: number
  remaining: number | null
  planName: string | null
}

/** Whether the tenant can place N orders today (each supplier in cart = 1 order). */
export function getOrderPlaceGate(
  entitlements: Entitlements | null | undefined,
  ordersToPlace = 1
): OrderPlaceGate {
  const planName = entitlements?.plan?.name ?? null
  const requested = Math.max(1, ordersToPlace)

  if (!entitlements) {
    return {
      canPlace: true,
      reason: 'unknown',
      current: 0,
      limit: null,
      ordersRequested: requested,
      remaining: null,
      planName,
    }
  }

  const limit = limitNumber(entitlements.limits?.orders_per_day)
  const current = limitNumber(entitlements.usage?.orders_per_day) ?? 0

  if (limit == null || limit === -1) {
    return {
      canPlace: true,
      reason: 'unlimited',
      current,
      limit: null,
      ordersRequested: requested,
      remaining: null,
      planName,
    }
  }

  const remaining = Math.max(0, limit - current)

  if (current >= limit) {
    return {
      canPlace: false,
      reason: 'at_limit',
      current,
      limit,
      ordersRequested: requested,
      remaining: 0,
      planName,
    }
  }

  if (current + requested > limit) {
    return {
      canPlace: false,
      reason: 'would_exceed',
      current,
      limit,
      ordersRequested: requested,
      remaining,
      planName,
    }
  }

  return {
    canPlace: true,
    reason: 'ok',
    current,
    limit,
    ordersRequested: requested,
    remaining,
    planName,
  }
}

export function formatOrderPlaceGateMessage(gate: OrderPlaceGate): string {
  const plan = gate.planName ?? 'your current plan'

  if (gate.reason === 'at_limit') {
    return `You've used all ${gate.limit} daily orders on ${plan}. Your limit resets tomorrow — upgrade for more orders today.`
  }

  if (gate.reason === 'would_exceed' && gate.limit != null) {
    const remaining = gate.remaining ?? 0
    const orderWord = gate.ordersRequested === 1 ? 'order' : 'orders'
    const supplierNote =
      gate.ordersRequested > 1
        ? ` This cart creates ${gate.ordersRequested} orders (one per supplier).`
        : ''
    if (remaining === 0) {
      return `You've reached your daily order limit (${gate.current}/${gate.limit}) on ${plan}.${supplierNote} Upgrade for more orders.`
    }
    return `You only have ${remaining} daily ${remaining === 1 ? 'order' : 'orders'} left (${gate.current}/${gate.limit} used), but this cart needs ${gate.ordersRequested}.${supplierNote} Remove items from a supplier or upgrade your plan.`
  }

  return `Daily order limit reached on ${plan}. Upgrade for higher limits.`
}

/** Usage badge for nav (e.g. Cart): null when unlimited or no entitlements. */
/** Generic plan limit gate from entitlements usage/limits. */
export function getPlanLimitGate(
  entitlements: Entitlements | null | undefined,
  limitKey: string,
  additional = 0
): { canUse: boolean; current: number; limit: number | null; message: string } {
  const planName = entitlements?.plan?.name ?? 'your current plan'
  const limit = limitNumber(entitlements?.limits?.[limitKey])
  const current = limitNumber(entitlements?.usage?.[limitKey]) ?? 0

  if (limit == null || limit === -1) {
    return { canUse: true, current, limit: null, message: '' }
  }

  const canUse = current + additional <= limit
  const label =
    limitKey === 'quick_lists'
      ? 'quick list'
      : limitKey === 'quick_list_items'
        ? 'quick list product'
        : limitKey === 'scheduled_quick_lists'
          ? 'scheduled quick list'
          : limitKey.replace(/_/g, ' ')

  return {
    canUse,
    current,
    limit,
    message: canUse
      ? ''
      : `You've reached your ${label} limit (${current}/${limit}) on ${planName}. Upgrade for more.`,
  }
}

export function isQuickListSchedulingEnabled(
  entitlements: Entitlements | null | undefined
): boolean {
  const v = entitlements?.features?.quick_lists as unknown
  if (v === true) return true
  if (typeof v === 'string') {
    const lower = v.toLowerCase()
    return (
      lower !== 'false' && lower !== 'disabled' && lower !== '' && lower !== 'basic_manual_only'
    )
  }
  return false
}

/** Whether the tenant may schedule this list (respects scheduled_quick_lists cap). */
export function getQuickListScheduleGate(
  entitlements: Entitlements | null | undefined,
  listAlreadyScheduled = false
): { canSchedule: boolean; current: number; limit: number | null; message: string } {
  if (!isQuickListSchedulingEnabled(entitlements)) {
    return {
      canSchedule: false,
      current: 0,
      limit: null,
      message: 'Scheduled quick lists require Bronze or higher. Upgrade in Settings.',
    }
  }

  const gate = getPlanLimitGate(entitlements, 'scheduled_quick_lists', listAlreadyScheduled ? 0 : 1)
  return {
    canSchedule: gate.canUse,
    current: gate.current,
    limit: gate.limit,
    message: gate.message,
  }
}

export function getOrderUsageBadge(
  entitlements: Entitlements | null | undefined
): { label: string; atLimit: boolean; nearLimit: boolean } | null {
  if (!entitlements) return null
  const limit = limitNumber(entitlements.limits?.orders_per_day)
  if (limit == null || limit === -1) return null
  const current = limitNumber(entitlements.usage?.orders_per_day) ?? 0
  const pct = limit > 0 ? (current / limit) * 100 : 0
  return {
    label: `${current}/${limit}`,
    atLimit: current >= limit,
    nearLimit: pct >= 80 && current < limit,
  }
}
