import { describe, expect, it } from 'vitest'
import { FEATURE_ALIASES } from './feature-flags.js'
import { RESTAURANT_FEATURE_KEYS, SUPPLIER_FEATURE_KEYS, ALL_FEATURE_KEYS } from './feature-keys.js'
import {
  FREE_TIER_LIMIT_PATCHES,
  RESTAURANT_LIMIT_KEYS,
  SUPPLIER_LIMIT_KEYS,
  limitKeysForTenantType,
} from './limit-resolution.js'

describe('tier-binding', () => {
  it('FREE_TIER_LIMIT_PATCHES covers every canonical limit key per tenant type', () => {
    for (const tenantType of ['RESTAURANT', 'SUPPLIER']) {
      const keys = limitKeysForTenantType(tenantType)
      const patch = FREE_TIER_LIMIT_PATCHES[tenantType]
      expect(patch, `missing patch object for ${tenantType}`).toBeTruthy()
      for (const key of keys) {
        expect(patch[key], `${tenantType} patch missing ${key}`).not.toBeUndefined()
      }
    }
  })

  it('canonical feature key lists have no duplicates', () => {
    expect(new Set(RESTAURANT_FEATURE_KEYS).size).toBe(RESTAURANT_FEATURE_KEYS.length)
    expect(new Set(SUPPLIER_FEATURE_KEYS).size).toBe(SUPPLIER_FEATURE_KEYS.length)
    expect(new Set(ALL_FEATURE_KEYS).size).toBe(ALL_FEATURE_KEYS.length)
  })

  it('supplier fulfillment aliases map to fulfillment_tools', () => {
    expect(FEATURE_ALIASES.fulfillment).toBe('fulfillment_tools')
    expect(FEATURE_ALIASES.driver_management).toBe('fulfillment_tools')
    expect(SUPPLIER_FEATURE_KEYS).toContain('fulfillment_tools')
    expect(SUPPLIER_FEATURE_KEYS).toContain('fulfillment')
    expect(SUPPLIER_FEATURE_KEYS).toContain('driver_management')
  })

  it('restaurant and supplier limit key sets do not overlap supplier-only keys on restaurant', () => {
    expect(RESTAURANT_LIMIT_KEYS).not.toContain('promotions')
    expect(RESTAURANT_LIMIT_KEYS).not.toContain('warehouses')
    expect(SUPPLIER_LIMIT_KEYS).toContain('promotions')
    expect(SUPPLIER_LIMIT_KEYS).toContain('warehouses')
  })
})
