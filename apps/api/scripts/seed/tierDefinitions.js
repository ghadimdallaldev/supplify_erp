/** Bronze DB plan = Silver marketing tier. */
export const TIERS = [
  { tier: 'free', planCode: 'free', label: 'Free' },
  { tier: 'silver', planCode: 'bronze', label: 'Silver' },
  { tier: 'gold', planCode: 'gold', label: 'Gold' },
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
