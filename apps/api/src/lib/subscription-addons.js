import { query } from './db.js'

/** Hard cap before Enterprise / contact sales (total org branch accounts). */
export const ENTERPRISE_BRANCH_THRESHOLD = 6

export const ADDON_KEYS = {
  RESTAURANT_EXTRA_BRANCH: 'restaurant_extra_branch',
  SUPPLIER_EXTRA_BRANCH: 'supplier_extra_branch',
  SUPPLIER_EXTRA_WAREHOUSE: 'supplier_extra_warehouse',
}

/** Default monthly unit price (USD) by plan code when admin does not set a custom price. */
export const ADDON_UNIT_PRICING = {
  restaurant_extra_branch: { gold: 39, platinum: 49 },
  supplier_extra_branch: { gold: 49, platinum: 69 },
  supplier_extra_warehouse: { gold: 19, platinum: 25 },
}

export function addonKeyForLimitKey(tenantType, limitKey) {
  if (limitKey === 'branches') {
    return tenantType === 'RESTAURANT'
      ? ADDON_KEYS.RESTAURANT_EXTRA_BRANCH
      : ADDON_KEYS.SUPPLIER_EXTRA_BRANCH
  }
  if (limitKey === 'warehouses' && tenantType === 'SUPPLIER') {
    return ADDON_KEYS.SUPPLIER_EXTRA_WAREHOUSE
  }
  return null
}

export function canPurchaseLocationAddons(planCode) {
  const code = (planCode || '').toLowerCase()
  return code === 'gold' || code === 'platinum'
}

export function defaultAddonUnitPrice(addonKey, planCode) {
  const prices = ADDON_UNIT_PRICING[addonKey]
  if (!prices) return null
  const tier = (planCode || '').toLowerCase()
  if (prices[tier] != null) return prices[tier]
  return null
}

export function isAddonKeyValidForTenant(tenantType, addonKey) {
  if (tenantType === 'RESTAURANT') {
    return addonKey === ADDON_KEYS.RESTAURANT_EXTRA_BRANCH
  }
  if (tenantType === 'SUPPLIER') {
    return (
      addonKey === ADDON_KEYS.SUPPLIER_EXTRA_BRANCH ||
      addonKey === ADDON_KEYS.SUPPLIER_EXTRA_WAREHOUSE
    )
  }
  return false
}

/**
 * Active add-on rows for the billing tenant (org main branch).
 */
export async function getActiveTenantAddons(billingTenantId, tenantType) {
  try {
    const { rows } = await query(
      `SELECT id, addon_key, quantity, unit_price_monthly, status, starts_at, ends_at, metadata
       FROM tenant_subscription_addon
       WHERE tenant_id = $1 AND tenant_type = $2 AND status = 'active'
         AND (ends_at IS NULL OR ends_at > now())
       ORDER BY addon_key`,
      [billingTenantId, tenantType]
    )
    return rows
  } catch (error) {
    if (error.code === '42P01') return []
    throw error
  }
}

export async function getAddonQuantity(billingTenantId, tenantType, addonKey) {
  const addons = await getActiveTenantAddons(billingTenantId, tenantType)
  const row = addons.find((a) => a.addon_key === addonKey)
  return row ? parseInt(row.quantity, 10) || 0 : 0
}

/**
 * Included plan limit + active add-on quantity (before tenant/plan override merge).
 */
export function computeEffectiveWithAddons(includedLimit, addonQuantity) {
  if (includedLimit == null) return null
  const qty = parseInt(addonQuantity, 10) || 0
  return includedLimit + qty
}
