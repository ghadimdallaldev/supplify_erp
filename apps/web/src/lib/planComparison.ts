/**
 * Canonical limit and feature keys per tenant type for upgrade modal comparison table.
 * Keep in sync with API subscription limits/features; top 6–10 each for display.
 */

export const RESTAURANT_LIMIT_KEYS = [
  'orders_per_day',
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
  'users',
  'chats_per_day',
  'storage_mb',
] as const

export const RESTAURANT_FEATURE_KEYS = ['reports', 'smart_reorder', 'multi_branch'] as const

export const SUPPLIER_FEATURE_KEYS = ['reports', 'smart_reorder'] as const

export const LIMIT_KEY_LABELS: Record<string, string> = {
  orders_per_day: 'Daily orders',
  chats_per_day: 'Daily messages',
  supplier_products_skus: 'Products',
  restaurant_inventory_skus: 'Inventory SKUs',
  branches: 'Branches',
  warehouses: 'Warehouses',
  users: 'Users',
  storage_mb: 'Storage (MB)',
  suppliers_per_restaurant: 'Suppliers',
}

export const FEATURE_KEY_LABELS: Record<string, string> = {
  reports: 'Reports',
  smart_reorder: 'Smart reorder',
  multi_branch: 'Multi-branch',
}

/** Plan value subtitles (pricing psychology). Do not change plan names/codes. */
export const PLAN_SUBTITLES: Record<string, string> = {
  free: 'Setup & Testing',
  bronze: 'Starter',
  gold: 'Most Popular',
  platinum: 'Unlimited Ops',
  enterprise: 'Custom Contract',
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
