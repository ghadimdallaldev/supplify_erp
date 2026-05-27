/** Bronze DB plan = Silver marketing tier. */
export const TIERS = [
  { tier: 'free', planCode: 'free', label: 'Free' },
  { tier: 'silver', planCode: 'bronze', label: 'Silver' },
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
export const RESTAURANT_PLAN_FEATURE_PATCHES = {
  bronze: {
    order_calendar: true,
    disputes_returns: true,
    advanced_roles: false,
  },
  gold: {
    order_calendar: true,
    disputes_returns: true,
    advanced_roles: true,
  },
  platinum: {
    order_calendar: true,
    disputes_returns: true,
    advanced_roles: true,
  },
}

export const SUPPLIER_PLAN_FEATURE_PATCHES = {
  bronze: {
    order_calendar: true,
    disputes_returns: true,
    advanced_roles: false,
    warehouses: true,
    multi_warehouse: false,
    fulfillment: true,
    driver_management: false,
  },
  gold: {
    order_calendar: true,
    disputes_returns: true,
    advanced_roles: true,
    warehouses: true,
    multi_warehouse: true,
    fulfillment: true,
    driver_management: true,
  },
  platinum: {
    order_calendar: true,
    disputes_returns: true,
    advanced_roles: true,
    warehouses: true,
    multi_warehouse: true,
    fulfillment: true,
    driver_management: true,
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
