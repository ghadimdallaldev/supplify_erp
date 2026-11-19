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
  'recipe_costing',
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
  'intelligence',
  'ai_assistant',
  'ai_platform',
]

export const SUPPLIER_FEATURE_KEYS = [
  'chat',
  'order_calendar',
  'reports',
  'smart_reorder',
  'ai_platform',
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
  'intelligence',
  'ai_assistant',
]

/**
 * Default-on kill switches for core features that are not sold per plan tier.
 * They are NOT required in subscription_plan.features JSON (tier verifier ignores them).
 * Resolution: tenant override → global override → plan value (if a plan sets it) → ON.
 * Admins turn them off globally or per account from Admin → Features.
 */
export const RESTAURANT_DEFAULT_ON_FEATURE_KEYS = [
  'ordering',
  'product_catalog',
  'global_search',
  'quote_requests',
  'contract_pricing',
  'loyalty',
  'reservations',
  'staff_management',
  'consumer_storefront',
  'consumer_reviews',
  'supplier_connections',
  'team_invitations',
  'branch_management',
  'supplier_directory',
  'supplier_following',
  'price_comparison',
  'supplier_reviews_read',
  'delivery_locations',
  'delivery_tracking',
  'packing_slips',
  'order_reminders',
  'notification_center',
  'order_management',
  'public_profile',
  'self_serve_billing',
  'restaurant_profile',
]

export const SUPPLIER_DEFAULT_ON_FEATURE_KEYS = [
  'ordering',
  'product_catalog',
  'global_search',
  'quote_requests',
  'contract_pricing',
  'loyalty',
  'public_sales',
  'team_invitations',
  'branch_management',
  'ops_dashboard',
  'catalog_import',
  'product_substitutes',
  'fulfillment_issues',
  'stock_levels',
  'order_warehouse_dispatch',
  'featured_placement',
  'customer_directory',
  'delivery_tracking',
  'packing_slips',
  'notification_center',
  'order_management',
  'public_profile',
  'self_serve_billing',
]

export const DEFAULT_ON_FEATURE_KEYS = [
  ...new Set([...RESTAURANT_DEFAULT_ON_FEATURE_KEYS, ...SUPPLIER_DEFAULT_ON_FEATURE_KEYS]),
]

export const ALL_FEATURE_KEYS = [...new Set([...RESTAURANT_FEATURE_KEYS, ...SUPPLIER_FEATURE_KEYS])]

/**
 * Platform-only admin toggles (not sold on tenant plans).
 * Resolution is global_override only: explicit true enables; null/false/missing = off,
 * except keys in PLATFORM_DEFAULT_ON_FEATURE_KEYS where null/missing = on.
 */
export const PLATFORM_FEATURE_KEYS = [
  'mobile_public_shop',
  'demo_campaign',
  'public_registration',
  'consumer_accounts',
  'invitation_acceptance',
  'referral_landing',
  'whatsapp_ordering',
  'web_push',
  'organization_lifecycle',
]

/** Platform keys that are ON unless an admin forces them off. */
export const PLATFORM_DEFAULT_ON_FEATURE_KEYS = [
  'demo_campaign',
  'public_registration',
  'consumer_accounts',
  'invitation_acceptance',
  'referral_landing',
  'whatsapp_ordering',
  'web_push',
  'organization_lifecycle',
]

/** Keys admins can force on/off from Admin → Features (plans + default-on + platform). */
export const ADMIN_GLOBAL_FEATURE_KEYS = [
  ...new Set([...ALL_FEATURE_KEYS, ...DEFAULT_ON_FEATURE_KEYS, ...PLATFORM_FEATURE_KEYS]),
]

/** Legacy / migration-only keys in DB JSON — verifier warns, does not fail. */
export const KNOWN_EXTRA_FEATURE_KEYS = ['supplier_deals_redeem']

/** Plan-sold keys only (what subscription_plan.features must carry). */
export function getPlanFeatureKeys(tenantType) {
  return tenantType === 'RESTAURANT' ? RESTAURANT_FEATURE_KEYS : SUPPLIER_FEATURE_KEYS
}

export function getDefaultOnFeatureKeys(tenantType) {
  return tenantType === 'RESTAURANT'
    ? RESTAURANT_DEFAULT_ON_FEATURE_KEYS
    : SUPPLIER_DEFAULT_ON_FEATURE_KEYS
}

/** Every key that resolves per tenant (plan-sold + default-on). */
export function getAllowedFeatureKeys(tenantType) {
  return [...new Set([...getPlanFeatureKeys(tenantType), ...getDefaultOnFeatureKeys(tenantType)])]
}

export function isDefaultOnFeatureKey(featureKey) {
  return DEFAULT_ON_FEATURE_KEYS.includes(featureKey)
}

/** Value used when neither override nor plan sets the key. */
export function defaultFeatureValue(featureKey) {
  return isDefaultOnFeatureKey(featureKey)
}

export function isFeatureKeyAllowed(featureKey, tenantType) {
  return getAllowedFeatureKeys(tenantType).includes(featureKey)
}

export function isPlatformFeatureKey(featureKey) {
  return PLATFORM_FEATURE_KEYS.includes(featureKey)
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
  recipe_costing: 'Recipe costing',
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
  intelligence: 'Operational intelligence',
  ai_assistant: 'Supplify AI Assistant',
  ai_platform: 'AI platform (Smart Reorder LLM)',
  mobile_public_shop: 'Mobile public shop (guest + consumer catalogs)',
  demo_campaign: 'Public demo campaign (lead capture)',
  ordering: 'Ordering (place & manage orders)',
  product_catalog: 'Product catalog & prices',
  global_search: 'Global search',
  quote_requests: 'Quote requests (RFQ)',
  contract_pricing: 'Contract pricing',
  loyalty: 'Loyalty programs',
  reservations: 'Reservations & waitlist',
  staff_management: 'Staff management (schedule, PTO, docs)',
  consumer_storefront: 'Consumer storefront & online ordering',
  consumer_reviews: 'Consumer reviews',
  supplier_connections: 'Supplier connection requests',
  team_invitations: 'Team invitations',
  public_sales: 'Public sales storefront',
  branch_management: 'Branch management (existing branches, users, switching)',
  supplier_directory: 'Supplier directory',
  supplier_following: 'Follow / block suppliers',
  price_comparison: 'Price comparison',
  supplier_reviews_read: 'Browse supplier reviews',
  delivery_locations: 'Delivery locations',
  delivery_tracking: 'Delivery tracking & proof of delivery',
  packing_slips: 'Packing slips',
  order_reminders: 'Order reminders',
  notification_center: 'Notification inbox & preferences',
  ops_dashboard: 'Command center & run sheet',
  catalog_import: 'Bulk catalog & image import',
  product_substitutes: 'Product substitutes',
  fulfillment_issues: 'Fulfillment issues (shortages)',
  stock_levels: 'Stock levels',
  order_warehouse_dispatch: 'Order warehouse transfer & dispatch',
  featured_placement: 'Featured placement',
  customer_directory: 'Customer directory',
  order_management: 'Order management (view & update orders)',
  public_profile: 'Public profile page & custom domain',
  self_serve_billing: 'Self-serve billing (checkout, payment methods)',
  restaurant_profile: 'Restaurant profile & team setup',
  public_registration: 'New sign-ups (workspace setup)',
  consumer_accounts: 'Consumer accounts (profile, addresses, order history)',
  invitation_acceptance: 'Accepting team / branch invitations',
  referral_landing: 'Supplier referral landing pages',
  whatsapp_ordering: 'WhatsApp inbound messages',
  web_push: 'Web push key & device cleanup',
  organization_lifecycle: 'Transfer ownership / close organization',
}

export function featureDisplayName(featureKey) {
  return DISPLAY_NAMES[featureKey] || featureKey
}
