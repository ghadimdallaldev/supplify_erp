import { shouldShowEntitlementLimit } from './planLimits'

export const PLAN_CODE_LABELS: Record<string, string> = {
  free: 'Free Trial',
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
  enterprise: 'Enterprise',
}

export const LIMIT_KEY_LABELS: Record<string, string> = {
  branches: 'Branches',
  warehouses: 'Warehouses',
  users: 'Users',
  orders_per_day: 'Orders per day',
  suppliers_per_restaurant: 'Suppliers per restaurant',
  restaurant_inventory_skus: 'Restaurant inventory SKUs',
  chats_per_day: 'Chats per day',
  open_conversations: 'Open conversations',
  storage_mb: 'Storage (MB)',
  quick_lists: 'Quick lists',
  quick_list_items: 'Quick list items',
  scheduled_quick_lists: 'Scheduled quick lists',
  deal_redemptions_per_day: 'Deal redemptions per day',
  supplier_products_skus: 'Supplier product SKUs',
  promotions: 'Active deals',
}

export function formatPlanCodeLabel(code: string | null | undefined): string {
  if (!code) return '—'
  const key = code.toLowerCase()
  return PLAN_CODE_LABELS[key] ?? code
}

export function formatLimitKeyLabel(key: string): string {
  return LIMIT_KEY_LABELS[key] ?? key.replace(/_/g, ' ')
}

export function filterAdminLimitKeys(
  keys: string[],
  tenantType: 'RESTAURANT' | 'SUPPLIER'
): string[] {
  const supplierOnly = new Set(['promotions', 'warehouses', 'supplier_products_skus'])
  const restaurantOnly = new Set([
    'orders_per_day',
    'suppliers_per_restaurant',
    'restaurant_inventory_skus',
    'quick_lists',
    'quick_list_items',
    'scheduled_quick_lists',
    'deal_redemptions_per_day',
  ])

  return keys.filter((k) => {
    if (!shouldShowEntitlementLimit(k)) return false
    if (tenantType === 'RESTAURANT' && supplierOnly.has(k)) return false
    if (tenantType === 'SUPPLIER' && restaurantOnly.has(k)) return false
    return true
  })
}

export function formatLimitValue(value: unknown): string {
  if (value === -1 || value === null || value === undefined) return 'Unlimited'
  return String(value)
}

export const ADDON_KEY_LABELS: Record<string, string> = {
  restaurant_extra_branch: 'Extra branch',
  supplier_extra_branch: 'Extra branch',
  supplier_extra_warehouse: 'Extra warehouse',
}

export function formatAddonKeyLabel(key: string): string {
  return ADDON_KEY_LABELS[key] ?? key
}
