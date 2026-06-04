import type { Entitlements } from '../types'

/** Internal meter for Free-tier scheduled quick-list overflow; not a user-facing plan quota. */
export const HIDDEN_ENTITLEMENT_LIMIT_KEYS = new Set(['scheduled_order_grace_per_day'])

export function shouldShowEntitlementLimit(limitKey: string): boolean {
  return !HIDDEN_ENTITLEMENT_LIMIT_KEYS.has(limitKey)
}

/** True when usage has hit a real plan cap (excludes hidden meters and N/A limits). */
export function isAtEntitlementLimit(current: number, limit: number | null | undefined): boolean {
  if (limit == null || limit === -1) return false
  if (limit <= 0) return false
  return current >= limit
}

function limitNumber(value: unknown): number | null {
  if (value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** Aligns with API `evaluatePlanFeatureValue` — tier strings count as enabled. */
export function evaluatePlanFeatureValue(featureValue: unknown): boolean {
  if (featureValue === undefined) return false
  if (typeof featureValue === 'boolean') return featureValue
  if (typeof featureValue === 'string') {
    return featureValue !== 'false' && featureValue !== 'disabled' && featureValue !== ''
  }
  return Boolean(featureValue)
}

export function featureEnabled(value: unknown): boolean {
  return evaluatePlanFeatureValue(value)
}

/** Resolved feature value: enabled tier from features or planFeatures; otherwise the off value. */
export function resolveEntitlementFeature(
  entitlements: Entitlements | null | undefined,
  key: string
): unknown {
  if (!entitlements) return undefined
  const fromFeatures = entitlements.features?.[key]
  const fromPlan = entitlements.planFeatures?.[key]
  if (featureEnabled(fromFeatures)) return fromFeatures
  if (featureEnabled(fromPlan)) return fromPlan
  if (fromFeatures !== undefined && fromFeatures !== null) return fromFeatures
  return fromPlan
}

export function isEntitlementFeatureEnabled(
  entitlements: Entitlements | null | undefined,
  key: string
): boolean {
  if (featureEnabled(entitlements?.features?.[key])) return true
  return featureEnabled(entitlements?.planFeatures?.[key])
}

/** Plan allows multi-branch (Gold boolean, Platinum tier string, Silver off). */
export function multiBranchEnabled(entitlements: Entitlements | null | undefined): boolean {
  return isEntitlementFeatureEnabled(entitlements, 'multi_branch')
}

export type BranchAddGate = {
  canAdd: boolean
  reason:
    | 'ok'
    | 'at_limit'
    | 'feature_unavailable'
    | 'addon_or_upgrade'
    | 'upgrade_to_gold'
    | 'contact_enterprise'
  current: number
  limit: number | null
  includedLimit?: number | null
  planName: string | null
  planCode?: string | null
}

function planCodeLower(entitlements: Entitlements | null | undefined): string {
  return (entitlements?.plan?.code ?? entitlements?.plan?.name ?? '').toLowerCase()
}

function canBuyBranchAddons(entitlements: Entitlements | null | undefined): boolean {
  const code = planCodeLower(entitlements)
  return code === 'gold' || code === 'platinum'
}

/** Whether the tenant may create another restaurant/supplier branch under the current plan. */
export function getBranchAddGate(
  entitlements: Entitlements | null | undefined,
  currentCount = 0
): BranchAddGate {
  const planName = entitlements?.plan?.name ?? null
  const planCode = entitlements?.plan?.code ?? null
  const loc = entitlements?.locationLimits?.branches

  if (!entitlements) {
    return {
      canAdd: false,
      reason: 'feature_unavailable',
      current: currentCount,
      limit: null,
      planName,
      planCode,
    }
  }

  if (loc?.atEnterpriseThreshold || currentCount >= (loc?.enterpriseThreshold ?? 6)) {
    return {
      canAdd: false,
      reason: 'contact_enterprise',
      current: currentCount,
      limit: loc?.effective ?? limitNumber(entitlements.limits?.branches),
      includedLimit: loc?.included ?? null,
      planName,
      planCode,
    }
  }

  const limit = loc?.effective ?? limitNumber(entitlements.limits?.branches)
  const includedLimit = loc?.included ?? entitlements.limitsBeforeAddons?.branches ?? limit
  const multiBranch = multiBranchEnabled(entitlements)

  if (limit === 0) {
    if (currentCount > 0) {
      return {
        canAdd: false,
        reason: 'at_limit',
        current: currentCount,
        limit: 0,
        includedLimit: 0,
        planName,
        planCode,
      }
    }
    return {
      canAdd: false,
      reason: 'feature_unavailable',
      current: currentCount,
      limit: 0,
      planName,
      planCode,
    }
  }

  if (limit != null && limit !== -1) {
    if (currentCount >= limit) {
      const reason = canBuyBranchAddons(entitlements) ? 'addon_or_upgrade' : 'upgrade_to_gold'
      return {
        canAdd: false,
        reason,
        current: currentCount,
        limit,
        includedLimit,
        planName,
        planCode,
      }
    }
    if (limit > 0 || multiBranch) {
      return {
        canAdd: true,
        reason: 'ok',
        current: currentCount,
        limit,
        includedLimit,
        planName,
        planCode,
      }
    }
    return {
      canAdd: false,
      reason: 'feature_unavailable',
      current: currentCount,
      limit,
      planName,
      planCode,
    }
  }

  if (!multiBranch) {
    return {
      canAdd: false,
      reason: 'feature_unavailable',
      current: currentCount,
      limit,
      planName,
      planCode,
    }
  }

  return {
    canAdd: true,
    reason: 'ok',
    current: currentCount,
    limit,
    includedLimit,
    planName,
    planCode,
  }
}

export function formatBranchGateMessage(gate: BranchAddGate): string {
  const plan = gate.planName ?? 'your current plan'

  if (gate.reason === 'contact_enterprise') {
    return `You have ${gate.current} branch locations. For more than 6 branches, contact sales for Enterprise.`
  }

  if (gate.reason === 'addon_or_upgrade') {
    const included = gate.includedLimit ?? gate.limit
    return `You've reached your included branch limit (${gate.current}/${included} locations on ${plan}). Add an extra branch add-on or upgrade your plan, or contact your administrator.`
  }

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
    gate.reason === 'upgrade_to_gold' ||
    planLower.includes('silver') ||
    planLower.includes('bronze')
  ) {
    return `Additional branch accounts require Gold or higher. Your plan is ${plan}. Upgrade to add more locations.`
  }
  if (planLower.includes('free') || planLower.includes('trial')) {
    return `Extra branches aren't available on Free Trial. Upgrade to Gold to add separate locations.`
  }
  if (planLower.includes('enterprise')) {
    return `Branch limits on Enterprise are set by your account team. Contact sales for changes.`
  }
  return `Additional branch accounts aren't included on ${plan}. Upgrade to Gold or higher to add separate locations.`
}

export function canAddBranches(
  entitlements: Entitlements | null | undefined,
  currentCount = 0
): boolean {
  return getBranchAddGate(entitlements, currentCount).canAdd
}

/** Warehouse management feature (Silver+). */
export function warehousesFeatureEnabled(entitlements: Entitlements | null | undefined): boolean {
  return isEntitlementFeatureEnabled(entitlements, 'warehouses')
}

/** Plan allows multi-warehouse routing (Gold+); supplier toggle is separate. */
export function multiWarehousePlanEnabled(entitlements: Entitlements | null | undefined): boolean {
  return isEntitlementFeatureEnabled(entitlements, 'multi_warehouse')
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

export type WarehouseAddGate = {
  canAdd: boolean
  reason: 'ok' | 'at_limit' | 'feature_unavailable' | 'addon_or_upgrade' | 'upgrade_plan'
  current: number
  limit: number | null
  planName: string | null
}

export function getWarehouseAddGate(
  entitlements: Entitlements | null | undefined,
  currentCount = 0
): WarehouseAddGate {
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
  if (!warehousesFeatureEnabled(entitlements)) {
    return {
      canAdd: false,
      reason: 'feature_unavailable',
      current: currentCount,
      limit: 0,
      planName,
    }
  }

  const loc = entitlements.locationLimits?.warehouses
  const limit = loc?.effective ?? limitNumber(entitlements.limits?.warehouses)
  if (limit === 0) {
    return { canAdd: false, reason: 'upgrade_plan', current: currentCount, limit: 0, planName }
  }
  if (limit == null || limit === -1) {
    return { canAdd: true, reason: 'ok', current: currentCount, limit: null, planName }
  }
  if (currentCount >= limit) {
    const code = planCodeLower(entitlements)
    const reason = code === 'gold' || code === 'platinum' ? 'addon_or_upgrade' : 'upgrade_plan'
    return { canAdd: false, reason, current: currentCount, limit, planName }
  }
  return { canAdd: true, reason: 'ok', current: currentCount, limit, planName }
}

export function formatWarehouseGateMessage(gate: WarehouseAddGate): string {
  const plan = gate.planName ?? 'your current plan'
  if (gate.reason === 'addon_or_upgrade') {
    return `You've reached your included warehouse limit (${gate.current}/${gate.limit} on ${plan}). Add an extra warehouse add-on, upgrade your plan, or contact your administrator.`
  }
  if (gate.reason === 'upgrade_plan' && gate.limit === 0) {
    return `Warehouses aren't available on Free Trial. Upgrade to Silver for your first warehouse.`
  }
  if (gate.reason === 'feature_unavailable') {
    return `Warehouse management isn't included on ${plan}. Upgrade to Silver or higher.`
  }
  return `You've reached your warehouse limit (${gate.current}/${gate.limit}) on ${plan}. Upgrade for more warehouses.`
}

/** Whether the tenant may create another supplier warehouse under the current plan. */
export function canAddWarehouses(
  entitlements: Entitlements | null | undefined,
  currentCount = 0
): boolean {
  return getWarehouseAddGate(entitlements, currentCount).canAdd
}

/** Logo upload and brand theming (Gold: logo + colors; Platinum: white-label). */
export function canUseCustomBranding(entitlements: Entitlements | null | undefined): boolean {
  return isEntitlementFeatureEnabled(entitlements, 'custom_branding')
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
          : limitKey === 'deal_redemptions_per_day'
            ? 'deal redemption today'
            : limitKey === 'promotions'
              ? 'promotion'
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
  const v = resolveEntitlementFeature(entitlements, 'quick_lists')
  if (!featureEnabled(v)) return false
  if (typeof v === 'string' && v.toLowerCase() === 'basic_manual_only') return false
  return true
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
      message: 'Scheduled quick lists require Silver or higher. Upgrade in Settings.',
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

export function canBrowseSupplierDeals(entitlements: Entitlements | null | undefined): boolean {
  return isEntitlementFeatureEnabled(entitlements, 'supplier_deals')
}

export function getDealRedeemGate(entitlements: Entitlements | null | undefined) {
  const gate = getPlanLimitGate(entitlements, 'deal_redemptions_per_day', 1)
  return {
    canRedeem: gate.canUse,
    current: gate.current,
    limit: gate.limit,
    message: gate.message,
    planName: entitlements?.plan?.name ?? null,
  }
}

export function getSupplierPromotionGate(entitlements: Entitlements | null | undefined) {
  const gate = getPlanLimitGate(entitlements, 'promotions', 1)
  return {
    canCreate: gate.canUse,
    current: gate.current,
    limit: gate.limit,
    message: gate.message,
    planName: entitlements?.plan?.name ?? null,
  }
}

export function canRedeemSupplierDeals(entitlements: Entitlements | null | undefined): boolean {
  return getDealRedeemGate(entitlements).canRedeem
}
