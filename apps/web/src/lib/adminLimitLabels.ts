import { shouldShowEntitlementLimit } from './planLimits'

type TenantTypeLike = 'RESTAURANT' | 'SUPPLIER' | string | null | undefined

export const PLAN_CODE_LABELS: Record<string, string> = {
  free: '30-day Free Trial',
  silver: 'Growth',
  gold: 'Growth / Scale',
  platinum: 'Scale / Custom',
  enterprise: 'Custom',
}

export function formatPlanCodeLabel(
  code: string | null | undefined,
  tenantType?: TenantTypeLike
): string {
  if (!code) return '-'
  const key = code.toLowerCase()
  const type = String(tenantType || '').toUpperCase()

  if (key === 'free') return '30-day Free Trial'
  if (type === 'RESTAURANT') {
    if (key === 'silver') return 'Restaurant Growth'
    if (key === 'gold') return 'Restaurant Scale'
    if (key === 'platinum') return 'Restaurant Custom'
  }
  if (type === 'SUPPLIER') {
    if (key === 'silver') return 'Supplier Legacy Growth'
    if (key === 'gold') return 'Supplier Growth'
    if (key === 'platinum') return 'Supplier Scale'
  }

  return PLAN_CODE_LABELS[key] ?? code
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
  active_customer_locations_monthly: 'Active customer locations',
  promotions: 'Active deals',
}

export function formatLimitKeyLabel(key: string): string {
  return LIMIT_KEY_LABELS[key] ?? key.replace(/_/g, ' ')
}

export function filterAdminLimitKeys(
  keys: string[],
  tenantType: 'RESTAURANT' | 'SUPPLIER'
): string[] {
  const supplierOnly = new Set([
    'promotions',
    'warehouses',
    'supplier_products_skus',
    'active_customer_locations_monthly',
  ])
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
  supplier_active_customer_locations_50: '50 active customer locations',
}

export function formatAddonKeyLabel(key: string): string {
  return ADDON_KEY_LABELS[key] ?? key
}
