export const TIERS = [
  { tier: 'free', planCode: 'free', label: 'Free' },
  { tier: 'silver', planCode: 'silver', label: 'Silver' },
  { tier: 'gold', planCode: 'gold', label: 'Gold' },
  { tier: 'platinum', planCode: 'platinum', label: 'Platinum' },
]

export const SLUG_PREFIX = 'tier-'
export const SEED_PASSWORD = process.env.SEED_ACCOUNTS_PASSWORD || 'Supplify1!'

export function restaurantDef(tier, label) {
  return {
    slug: `${SLUG_PREFIX}restaurant-${tier}`,
    name: `${label} Plate Restaurant`,
    ownerEmail: `restaurant-${tier}@supplify.com`,
    tier,
  }
}

export function supplierDef(tier, label) {
  return {
    slug: `${SLUG_PREFIX}supplier-${tier}`,
    name: `${label} Harvest Supplier`,
    ownerEmail: `supplier-${tier}@supplify.com`,
    tier,
  }
}

/** Extra logins per tenant for Team → assign role testing */
export const RESTAURANT_TEAM_MEMBERS = [
  { suffix: 'manager', roleName: 'Manager', lastName: 'Manager' },
  { suffix: 'purchaser', roleName: 'Purchaser', lastName: 'Purchaser' },
]

export const SUPPLIER_TEAM_MEMBERS = [
  { suffix: 'manager', roleName: 'Manager', lastName: 'Manager' },
  { suffix: 'sales', roleName: 'Sales Rep', lastName: 'Sales' },
]

/**
 * Feature patches applied on top of migration-seeded plan features.
 * Covers keys missing from migration SQL (0022/0044/0090) that are actively
 * gated via requireFeature() in route middleware:
 *
 *   RESTAURANT: order_calendar, disputes_returns, advanced_roles
 *   SUPPLIER:   order_calendar, disputes_returns, advanced_roles,
 *               warehouses, multi_warehouse, fulfillment, driver_management
 *
 * Shape: { [planCode]: { [featureKey]: value } }
 * Applied per tenant_type via applyPlanFeaturePatches().
 */
/** Gold catalog (migration 0119 is source of truth for limits + features). */
export const GOLD_RESTAURANT_LIMITS = {
  branches: 3,
  users: 15,
  orders_per_day: 100,
  suppliers_per_restaurant: 30,
  restaurant_inventory_skus: 3000,
  chats_per_day: 500,
  open_conversations: 30,
  storage_mb: 10240,
  quick_lists: 50,
  quick_list_items: 500,
  scheduled_quick_lists: 15,
  deal_redemptions_per_day: 50,
  scheduled_order_grace_per_day: 0,
}

export const GOLD_SUPPLIER_LIMITS = {
  branches: 3,
  warehouses: 3,
  users: 15,
  supplier_products_skus: 3000,
  chats_per_day: 500,
  open_conversations: 30,
  storage_mb: 10240,
  promotions: 25,
}

/** Platinum catalog (migration 0120 is source of truth for limits + features). */
export const PLATINUM_RESTAURANT_LIMITS = {
  branches: -1,
  users: -1,
  orders_per_day: -1,
  suppliers_per_restaurant: -1,
  restaurant_inventory_skus: -1,
  chats_per_day: -1,
  open_conversations: -1,
  storage_mb: 30720,
  quick_lists: -1,
  quick_list_items: -1,
  scheduled_quick_lists: -1,
  deal_redemptions_per_day: -1,
  scheduled_order_grace_per_day: 0,
}

export const PLATINUM_SUPPLIER_LIMITS = {
  branches: -1,
  warehouses: -1,
  users: -1,
  supplier_products_skus: -1,
  chats_per_day: -1,
  open_conversations: -1,
  storage_mb: 30720,
  promotions: -1,
}

/** Silver feature fillers for seed runs (migration 0117 is source of truth). */
export const RESTAURANT_PLAN_FEATURE_PATCHES = {
  silver: {
    order_calendar: true,
    disputes_returns: true,
    advanced_roles: false,
    smart_reorder: false,
    waitlist_auto_promo: false,
    tenant_audit_log: false,
    api_integrations: false,
    feature_flags_access: false,
    fulfillment_tools: false,
  },
  gold: {
    order_calendar: true,
    disputes_returns: true,
    advanced_roles: true,
    smart_reorder: 'full_90day_trends',
    waitlist_auto_promo: true,
    tenant_audit_log: true,
    multi_branch: true,
    api_integrations: 'api_key_access',
    feature_flags_access: 'addon_toggles',
    fulfillment_tools: false,
  },
  platinum: {
    order_calendar: true,
    disputes_returns: true,
    advanced_roles: true,
    smart_reorder: 'ai_forecast_seasonality',
    waitlist_auto_promo: true,
    tenant_audit_log: true,
    multi_branch: 'central_purchasing',
    api_integrations: 'full_api_webhooks',
    feature_flags_access: 'all_experimental',
    waste_tracking: 'cost_percentage_vs_sales',
    fulfillment_tools: false,
  },
}

export const SUPPLIER_PLAN_FEATURE_PATCHES = {
  silver: {
    order_calendar: true,
    disputes_returns: true,
    advanced_roles: false,
    warehouses: true,
    multi_warehouse: false,
    fulfillment: true,
    driver_management: false,
    tenant_audit_log: false,
    api_integrations: false,
    feature_flags_access: false,
  },
  gold: {
    order_calendar: true,
    disputes_returns: true,
    advanced_roles: true,
    warehouses: true,
    multi_warehouse: true,
    fulfillment: true,
    driver_management: true,
    tenant_audit_log: true,
    multi_branch: true,
    api_integrations: 'api_key_access',
    feature_flags_access: 'addon_toggles',
  },
  platinum: {
    order_calendar: true,
    disputes_returns: true,
    advanced_roles: true,
    warehouses: true,
    multi_warehouse: true,
    fulfillment: true,
    driver_management: true,
    tenant_audit_log: true,
    multi_branch: true,
    api_integrations: 'full_api_webhooks',
    feature_flags_access: 'all_experimental',
  },
}

/**
 * Upsert missing feature keys into subscription_plan rows.
 * Uses `patch || existing` so existing values are preserved; only adds keys
 * that migrations did not set. Safe to run multiple times.
 * @param {import('pg').PoolClient} client
 */
export async function applyPlanFeaturePatches(client) {
  const patchSets = [
    { tenantType: 'RESTAURANT', patches: RESTAURANT_PLAN_FEATURE_PATCHES },
    { tenantType: 'SUPPLIER', patches: SUPPLIER_PLAN_FEATURE_PATCHES },
  ]

  for (const { tenantType, patches } of patchSets) {
    for (const [planCode, featureMap] of Object.entries(patches)) {
      // Merge patch into existing: patch || features keeps existing values for keys
      // already present and fills in the missing ones from the patch.
      const patchJson = JSON.stringify(featureMap)
      await client.query(
        `UPDATE subscription_plan
         SET features = ($1::jsonb || features),
             updated_at = now()
         WHERE code = $2
           AND tenant_type = $3
           AND is_active = true`,
        [patchJson, planCode, tenantType]
      )
    }
  }
}
