import { describe, expect, it } from 'vitest'
import {
  addonKeyForLimitKey,
  canPurchaseLocationAddons,
  computeEffectiveWithAddons,
  defaultAddonUnitPrice,
  isAddonKeyCompatibleWithPlan,
  isAddonKeyValidForTenant,
  ENTERPRISE_BRANCH_THRESHOLD,
} from './subscription-addons.js'

describe('subscription-addons', () => {
  it('maps limit keys to add-on keys', () => {
    expect(addonKeyForLimitKey('RESTAURANT', 'branches')).toBe('restaurant_extra_branch')
    expect(addonKeyForLimitKey('SUPPLIER', 'branches')).toBe('supplier_extra_branch')
    expect(addonKeyForLimitKey('SUPPLIER', 'warehouses')).toBe('supplier_extra_warehouse')
    expect(addonKeyForLimitKey('RESTAURANT', 'warehouses')).toBe(null)
    expect(addonKeyForLimitKey('SUPPLIER', 'active_customer_locations_monthly')).toBe(
      'supplier_active_customer_locations_50'
    )
  })

  it('only Growth and Scale plans can purchase location add-ons', () => {
    expect(canPurchaseLocationAddons('gold')).toBe(true)
    expect(canPurchaseLocationAddons('platinum')).toBe(true)
    expect(canPurchaseLocationAddons('silver')).toBe(false)
    expect(canPurchaseLocationAddons('free')).toBe(false)
  })

  it('computes effective limit with add-ons', () => {
    expect(computeEffectiveWithAddons(2, 2)).toBe(4)
    expect(computeEffectiveWithAddons(3, 1)).toBe(4)
  })

  it('returns default unit prices by tier', () => {
    expect(defaultAddonUnitPrice('restaurant_extra_branch', 'gold')).toBe(39)
    expect(defaultAddonUnitPrice('restaurant_extra_branch', 'platinum')).toBe(null)
    expect(defaultAddonUnitPrice('supplier_extra_warehouse', 'gold')).toBe(null)
    expect(defaultAddonUnitPrice('supplier_extra_warehouse', 'platinum')).toBe(19)
    expect(defaultAddonUnitPrice('supplier_active_customer_locations_50', 'platinum')).toBe(75)
  })

  it('validates add-on compatibility by plan code', () => {
    expect(isAddonKeyCompatibleWithPlan('restaurant_extra_branch', 'gold')).toBe(true)
    expect(isAddonKeyCompatibleWithPlan('restaurant_extra_branch', 'silver')).toBe(false)
    expect(isAddonKeyCompatibleWithPlan('supplier_extra_branch', 'platinum')).toBe(true)
    expect(isAddonKeyCompatibleWithPlan('supplier_extra_branch', 'gold')).toBe(false)
    expect(isAddonKeyCompatibleWithPlan('supplier_active_customer_locations_50', 'platinum')).toBe(
      true
    )
    expect(isAddonKeyCompatibleWithPlan('supplier_active_customer_locations_50', null)).toBe(false)
  })

  it('validates add-on keys per tenant type', () => {
    expect(isAddonKeyValidForTenant('RESTAURANT', 'restaurant_extra_branch')).toBe(true)
    expect(isAddonKeyValidForTenant('RESTAURANT', 'supplier_extra_warehouse')).toBe(false)
    expect(isAddonKeyValidForTenant('SUPPLIER', 'supplier_extra_warehouse')).toBe(true)
    expect(isAddonKeyValidForTenant('SUPPLIER', 'supplier_active_customer_locations_50')).toBe(true)
  })

  it('enterprise branch threshold is 6', () => {
    expect(ENTERPRISE_BRANCH_THRESHOLD).toBe(6)
  })
})
