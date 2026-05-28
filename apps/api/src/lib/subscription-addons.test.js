import { describe, expect, it } from 'vitest'
import {
  addonKeyForLimitKey,
  canPurchaseLocationAddons,
  computeEffectiveWithAddons,
  defaultAddonUnitPrice,
  isAddonKeyValidForTenant,
  ENTERPRISE_BRANCH_THRESHOLD,
} from './subscription-addons.js'

describe('subscription-addons', () => {
  it('maps limit keys to add-on keys', () => {
    expect(addonKeyForLimitKey('RESTAURANT', 'branches')).toBe('restaurant_extra_branch')
    expect(addonKeyForLimitKey('SUPPLIER', 'branches')).toBe('supplier_extra_branch')
    expect(addonKeyForLimitKey('SUPPLIER', 'warehouses')).toBe('supplier_extra_warehouse')
    expect(addonKeyForLimitKey('RESTAURANT', 'warehouses')).toBe(null)
  })

  it('only Gold and Platinum can purchase location add-ons', () => {
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
    expect(defaultAddonUnitPrice('restaurant_extra_branch', 'platinum')).toBe(49)
    expect(defaultAddonUnitPrice('supplier_extra_warehouse', 'gold')).toBe(19)
  })

  it('validates add-on keys per tenant type', () => {
    expect(isAddonKeyValidForTenant('RESTAURANT', 'restaurant_extra_branch')).toBe(true)
    expect(isAddonKeyValidForTenant('RESTAURANT', 'supplier_extra_warehouse')).toBe(false)
    expect(isAddonKeyValidForTenant('SUPPLIER', 'supplier_extra_warehouse')).toBe(true)
  })

  it('enterprise branch threshold is 6', () => {
    expect(ENTERPRISE_BRANCH_THRESHOLD).toBe(6)
  })
})
