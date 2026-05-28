/**
 * Canonical limit and feature keys per tenant type for upgrade modal comparison table.
 * Keep in sync with API subscription limits/features; top 6–10 each for display.
 */

export const RESTAURANT_LIMIT_KEYS = [
  'orders_per_day',
  'quick_lists',
  'quick_list_items',
  'scheduled_quick_lists',
  'deal_redemptions_per_day',
  'branches',
  'users',
  'suppliers_per_restaurant',
  'restaurant_inventory_skus',
  'chats_per_day',
  'storage_mb',
] as const

export const SUPPLIER_LIMIT_KEYS = [
  'supplier_products_skus',
  'warehouses',
  'branches',
  'users',
  'promotions',
  'open_conversations',
  'chats_per_day',
  'storage_mb',
] as const

export const RESTAURANT_FEATURE_KEYS = [
  'order_calendar',
  'reports',
  'smart_reorder',
  'multi_branch',
  'disputes_returns',
  'advanced_roles',
  'supplier_deals',
  'supplier_reviews',
  'tenant_audit_log',
  'custom_branding',
] as const

export const SUPPLIER_FEATURE_KEYS = [
  'order_calendar',
  'reports',
  'warehouses',
  'multi_warehouse',
  'fulfillment',
  'driver_management',
  'disputes_returns',
  'advanced_roles',
  'promotions',
  'tenant_audit_log',
  'custom_branding',
] as const

export const LIMIT_KEY_LABELS: Record<string, string> = {
  orders_per_day: 'Daily orders',
  quick_lists: 'Quick lists',
  quick_list_items: 'Quick list products',
  scheduled_quick_lists: 'Scheduled quick lists',
  chats_per_day: 'Messages (today)',
  open_conversations: 'Open chats',
  supplier_products_skus: 'Products',
  restaurant_inventory_skus: 'Inventory SKUs',
  branches: 'Branches',
  warehouses: 'Warehouses',
  users: 'Users',
  storage_mb: 'Storage (MB)',
  suppliers_per_restaurant: 'Suppliers',
  promotions: 'Deals & promotions',
  deal_redemptions_per_day: 'Deal redemptions (today)',
}

export const FEATURE_KEY_LABELS: Record<string, string> = {
  order_calendar: 'Order calendar',
  reports: 'Reports',
  smart_reorder: 'Smart reorder',
  multi_branch: 'Multi-branch',
  disputes_returns: 'Disputes & returns',
  advanced_roles: 'Advanced roles',
  supplier_reviews: 'Supplier reviews',
  tenant_audit_log: 'Activity log',
  custom_branding: 'Custom branding',
  warehouses: 'Warehouses',
  multi_warehouse: 'Multi-warehouse',
  fulfillment: 'Fulfillment & logistics',
  driver_management: 'Driver management',
  promotions: 'Promotions',
  supplier_deals: 'Supplier deals',
}

/** Short label for plan comparison cells (tier-specific branding levels). */
export function formatPlanFeatureCell(
  featureKey: string,
  rawVal: unknown
): { enabled: boolean; caption?: string } {
  if (featureKey === 'custom_branding') {
    if (rawVal === false || rawVal == null || rawVal === '') {
      return { enabled: false }
    }
    if (rawVal === 'logo_colors') {
      return { enabled: true, caption: 'Logo + colors' }
    }
    if (rawVal === 'white_label_domain' || rawVal === true) {
      return { enabled: true, caption: 'White-label' }
    }
    return { enabled: true, caption: 'Included' }
  }

  const enabled =
    typeof rawVal === 'boolean' ? rawVal : rawVal !== 'false' && rawVal != null && rawVal !== ''
  return { enabled }
}

/** Plan value subtitles (pricing psychology). Do not change DB plan codes. */
export const PLAN_SUBTITLES: Record<string, string> = {
  free: 'Time-limited trial',
  bronze: 'Starter',
  gold: 'Most Popular',
  platinum: 'Unlimited Ops',
}

/** User-facing plan name; DB code `free` is marketed as Free Trial (not forever-free). */
export function formatPlanDisplayName(
  planCode: string | null | undefined,
  planName?: string | null
): string {
  const code = (planCode || '').toLowerCase()
  if (code === 'free') return 'Free Trial'
  if (planName?.trim()) return planName.trim()
  return 'Plan'
}

export function getPlanSubtitle(planCode: string | null | undefined): string {
  if (!planCode) return ''
  const key = planCode.toLowerCase().replace(/\s/g, '')
  return PLAN_SUBTITLES[key] ?? ''
}

export function getLimitKeys(tenantType: 'RESTAURANT' | 'SUPPLIER'): readonly string[] {
  return tenantType === 'RESTAURANT' ? RESTAURANT_LIMIT_KEYS : SUPPLIER_LIMIT_KEYS
}

export function getFeatureKeys(tenantType: 'RESTAURANT' | 'SUPPLIER'): readonly string[] {
  return tenantType === 'RESTAURANT' ? RESTAURANT_FEATURE_KEYS : SUPPLIER_FEATURE_KEYS
}

export function getLimitLabel(limitKey: string): string {
  return LIMIT_KEY_LABELS[limitKey] ?? limitKey.replace(/_/g, ' ')
}

export function getFeatureLabel(featureKey: string): string {
  return FEATURE_KEY_LABELS[featureKey] ?? featureKey.replace(/_/g, ' ')
}

/** Human-readable nudge when the user has been blocked repeatedly (Layout banner). */
const IGNORED_BLOCK_KEYS = new Set(['upgrade_prompt', 'scheduled_order_grace_per_day'])

export function formatPlanBlockNudgeMessage(
  limitKeys: string[],
  featureKeys: string[] = []
): string | null {
  const labels = [
    ...limitKeys.filter((k) => !IGNORED_BLOCK_KEYS.has(k)).map(getLimitLabel),
    ...featureKeys.filter((k) => !IGNORED_BLOCK_KEYS.has(k)).map(getFeatureLabel),
  ].filter(Boolean)
  const unique = [...new Set(labels)]
  if (unique.length === 0) return null

  if (unique.length === 1) {
    return `You've reached your ${unique[0]} limit several times this week. Upgrade for more room.`
  }
  if (unique.length === 2) {
    return `You've hit your ${unique[0]} and ${unique[1]} limits several times this week. Upgrade for higher limits.`
  }
  const last = unique[unique.length - 1]
  const rest = unique.slice(0, -1).join(', ')
  return `You've hit limits on ${rest}, and ${last} several times this week. Upgrade to keep going.`
}

/** When usage is already at the plan cap (entitlements), not repeat blocks. */
export function formatAtPlanLimitMessage(limitKeys: string[]): string | null {
  const unique = [...new Set(limitKeys.map(getLimitLabel))].filter(Boolean)
  if (unique.length === 0) return null
  if (unique.length === 1) {
    return `You're at your ${unique[0]} limit on your current plan. Upgrade for more room.`
  }
  if (unique.length === 2) {
    return `You're at your ${unique[0]} and ${unique[1]} limits. Upgrade for higher limits.`
  }
  const last = unique[unique.length - 1]
  const rest = unique.slice(0, -1).join(', ')
  return `You're at your plan limits for ${rest}, and ${last}. Upgrade to continue.`
}
