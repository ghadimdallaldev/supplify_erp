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
  'approvals_budgets',
  'advanced_roles',
  'notifications',
  'api_integrations',
  'support_sla',
  'custom_branding',
  'feature_flags_access',
]

export const SUPPLIER_FEATURE_KEYS = [
  'chat',
  'order_calendar',
  'reports',
  'multi_branch',
  'warehouses',
  'multi_warehouse',
  'fulfillment_tools',
  'disputes_returns',
  'quick_lists',
  'inventory_management',
  'advanced_roles',
  'notifications',
  'api_integrations',
  'support_sla',
  'custom_branding',
  'feature_flags_access',
]

export const ALL_FEATURE_KEYS = [...new Set([...RESTAURANT_FEATURE_KEYS, ...SUPPLIER_FEATURE_KEYS])]

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
  quick_lists: 'Quick lists',
  inventory_management: 'Inventory management',
  waste_tracking: 'Waste tracking',
  approvals_budgets: 'Approvals & budgets',
  advanced_roles: 'Advanced roles',
  notifications: 'Notifications',
  api_integrations: 'API integrations',
  support_sla: 'Support SLA',
  custom_branding: 'Custom branding',
  fulfillment_tools: 'Fulfillment tools',
  warehouses: 'Warehouses',
  multi_warehouse: 'Multi-warehouse fulfillment',
  feature_flags_access: 'Feature flag admin',
}

export function featureDisplayName(featureKey) {
  return DISPLAY_NAMES[featureKey] || featureKey
}
