/** Canonical feature keys used in subscription plans and admin toggles. */
export const RESTAURANT_FEATURE_KEYS = [
  'chat',
  'order_calendar',
  'reports',
  'smart_reorder',
  'multi_branch',
  'receiving_quality',
  'disputes_returns',
  'finance_invoices',
  'quick_lists',
  'inventory_management',
  'waste_tracking',
  'advanced_roles',
  'notifications',
  'api_integrations',
  'support_sla',
  'custom_branding',
  'feature_flags_access',
  'supplier_reviews',
  'push_notifications',
  'order_amendments',
  'tenant_audit_log',
  'waitlist_auto_promo',
  'supplier_deals',
  'supplier_deals_redeem',
  'fulfillment_tools',
  'ai_platform',
]

export const SUPPLIER_FEATURE_KEYS = [
  'chat',
  'order_calendar',
  'reports',
  'multi_branch',
  'warehouses',
  'multi_warehouse',
  'fulfillment_tools',
  'fulfillment',
  'driver_management',
  'disputes_returns',
  'finance_invoices',
  'quick_lists',
  'inventory_management',
  'advanced_roles',
  'notifications',
  'api_integrations',
  'support_sla',
  'custom_branding',
  'feature_flags_access',
  'promotions',
  'push_notifications',
  'order_amendments',
  'tenant_audit_log',
  'supplier_growth',
]

export const ALL_FEATURE_KEYS = [...new Set([...RESTAURANT_FEATURE_KEYS, ...SUPPLIER_FEATURE_KEYS])]

/** Legacy / migration-only keys in DB JSON — verifier warns, does not fail. */
export const KNOWN_EXTRA_FEATURE_KEYS = ['supplier_deals_redeem']

export function getAllowedFeatureKeys(tenantType) {
  return tenantType === 'RESTAURANT' ? RESTAURANT_FEATURE_KEYS : SUPPLIER_FEATURE_KEYS
}

export function isFeatureKeyAllowed(featureKey, tenantType) {
  return getAllowedFeatureKeys(tenantType).includes(featureKey)
}

const DISPLAY_NAMES = {
  chat: 'Chat',
  order_calendar: 'Order calendar',
  reports: 'Reports & analytics',
  smart_reorder: 'Smart reorder',
  multi_branch: 'Multi-branch',
  receiving_quality: 'Receiving & quality',
  disputes_returns: 'Disputes & returns',
  finance_invoices: 'Finance & invoices',
  quick_lists: 'Quick lists & scheduling',
  inventory_management: 'Inventory management',
  waste_tracking: 'Waste tracking',
  advanced_roles: 'Advanced roles',
  notifications: 'Notifications',
  api_integrations: 'API integrations',
  support_sla: 'Support SLA',
  custom_branding: 'Custom branding',
  fulfillment_tools: 'Fulfillment tools',
  fulfillment: 'Fulfillment & logistics',
  driver_management: 'Driver management',
  warehouses: 'Warehouses',
  multi_warehouse: 'Multi-warehouse fulfillment',
  feature_flags_access: 'Feature flag admin',
  supplier_reviews: 'Supplier Reviews',
  promotions: 'Promotions & Deals',
  supplier_growth: 'Customer growth & referrals',
  push_notifications: 'Push Notifications',
  order_amendments: 'Order Amendments',
  tenant_audit_log: 'Activity Log',
  waitlist_auto_promo: 'Waitlist Auto-Promotion',
  supplier_deals: 'Supplier deals',
  supplier_deals_redeem: 'Supplier deal redemptions',
  ai_platform: 'AI platform (LLM reorder assistant)',
}

export function featureDisplayName(featureKey) {
  return DISPLAY_NAMES[featureKey] || featureKey
}
