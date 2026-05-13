/** Canonical feature keys used in subscription plans and admin toggles. */
export const RESTAURANT_FEATURE_KEYS = [
  'chat',
  'reports',
  'smart_reorder',
  'multi_branch',
  'receiving_quality',
  'finance_invoices',
  'quick_lists',
  'inventory_management',
  'waste_tracking',
  'approvals_budgets',
  'notifications',
  'api_integrations',
  'support_sla',
  'custom_branding',
  'feature_flags_access',
]

export const SUPPLIER_FEATURE_KEYS = [
  'chat',
  'reports',
  'fulfillment_tools',
  'quick_lists',
  'inventory_management',
  'notifications',
  'api_integrations',
  'support_sla',
  'custom_branding',
  'feature_flags_access',
]

export const ALL_FEATURE_KEYS = [
  ...new Set([...RESTAURANT_FEATURE_KEYS, ...SUPPLIER_FEATURE_KEYS]),
]

export function getAllowedFeatureKeys(tenantType) {
  return tenantType === 'RESTAURANT' ? RESTAURANT_FEATURE_KEYS : SUPPLIER_FEATURE_KEYS
}

export function isFeatureKeyAllowed(featureKey, tenantType) {
  return getAllowedFeatureKeys(tenantType).includes(featureKey)
}

const DISPLAY_NAMES = {
  chat: 'Chat',
  reports: 'Reports & analytics',
  smart_reorder: 'Smart reorder',
  multi_branch: 'Multi-branch',
  receiving_quality: 'Receiving & quality',
  finance_invoices: 'Finance & invoices',
  quick_lists: 'Quick lists',
  inventory_management: 'Inventory management',
  waste_tracking: 'Waste tracking',
  approvals_budgets: 'Approvals & budgets',
  notifications: 'Notifications',
  api_integrations: 'API integrations',
  support_sla: 'Support SLA',
  custom_branding: 'Custom branding',
  fulfillment_tools: 'Fulfillment tools',
  feature_flags_access: 'Feature flag admin',
}

export function featureDisplayName(featureKey) {
  return DISPLAY_NAMES[featureKey] || featureKey
}
