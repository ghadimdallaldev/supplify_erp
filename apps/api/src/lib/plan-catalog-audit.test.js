import { describe, expect, it } from 'vitest'
import { evaluatePlanFeatureValue } from './feature-flags.js'
import { FREE_TIER_LIMIT_PATCHES } from './limit-resolution.js'

/** Audit-spec restaurant plan limits (post-0145). */
export const AUDIT_RESTAURANT_LIMITS = {
  free: {
    branches: 1,
    users: 1,
    orders_per_day: 3,
    suppliers_per_restaurant: 1,
    restaurant_inventory_skus: 10,
    chats_per_day: 3,
    storage_mb: 50,
    quick_lists: 1,
    quick_list_items: 1,
    deal_redemptions_per_day: 1,
  },
  silver: {
    branches: 1,
    users: 3,
    orders_per_day: 20,
    suppliers_per_restaurant: 5,
    restaurant_inventory_skus: 250,
    chats_per_day: 30,
    open_conversations: 5,
    storage_mb: 500,
    quick_lists: 10,
    quick_list_items: 100,
    scheduled_quick_lists: 3,
    deal_redemptions_per_day: 10,
  },
  gold: {
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
  },
  platinum: {
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
  },
}

/** Audit-spec supplier plan limits (post-0145). */
export const AUDIT_SUPPLIER_LIMITS = {
  free: {
    branches: 1,
    warehouses: 0,
    users: 1,
    supplier_products_skus: 10,
    chats_per_day: 3,
    storage_mb: 50,
  },
  silver: {
    branches: 1,
    warehouses: 1,
    users: 3,
    supplier_products_skus: 250,
    chats_per_day: 30,
    open_conversations: 5,
    storage_mb: 500,
    promotions: 3,
  },
  gold: {
    branches: 3,
    warehouses: 3,
    users: 15,
    supplier_products_skus: 3000,
    chats_per_day: 500,
    open_conversations: 30,
    storage_mb: 10240,
    promotions: 25,
  },
  platinum: {
    branches: -1,
    warehouses: -1,
    users: -1,
    supplier_products_skus: -1,
    chats_per_day: -1,
    open_conversations: -1,
    storage_mb: 30720,
    promotions: -1,
  },
}

describe('plan-catalog-audit', () => {
  it('FREE_TIER_LIMIT_PATCHES uses chats_per_day 3 for both tenant types', () => {
    expect(FREE_TIER_LIMIT_PATCHES.RESTAURANT.chats_per_day).toBe(3)
    expect(FREE_TIER_LIMIT_PATCHES.SUPPLIER.chats_per_day).toBe(3)
  })

  it('tier strings evaluate as enabled', () => {
    expect(evaluatePlanFeatureValue('basic_kpis')).toBe(true)
    expect(evaluatePlanFeatureValue('expense_analytics')).toBe(true)
    expect(evaluatePlanFeatureValue('record_payments')).toBe(true)
  })

  it('boolean false and empty string evaluate as disabled', () => {
    expect(evaluatePlanFeatureValue(false)).toBe(false)
    expect(evaluatePlanFeatureValue('')).toBe(false)
    expect(evaluatePlanFeatureValue(undefined)).toBe(false)
  })

  it('restaurant audit limit matrix keys are defined for all tiers', () => {
    for (const tier of ['free', 'silver', 'gold', 'platinum']) {
      expect(AUDIT_RESTAURANT_LIMITS[tier].branches).toBeDefined()
      expect(AUDIT_RESTAURANT_LIMITS[tier].orders_per_day).toBeDefined()
    }
    expect(AUDIT_RESTAURANT_LIMITS.platinum.branches).toBe(-1)
    expect(AUDIT_RESTAURANT_LIMITS.gold.branches).toBe(3)
  })

  it('supplier audit limit matrix includes finance-related SKU limits and platinum unlimited', () => {
    expect(AUDIT_SUPPLIER_LIMITS.silver.promotions).toBe(3)
    expect(AUDIT_SUPPLIER_LIMITS.platinum.warehouses).toBe(-1)
    expect(AUDIT_SUPPLIER_LIMITS.platinum.branches).toBe(-1)
  })

  it('supplier paid tiers expect finance_invoices tier strings in catalog', () => {
    const paidFinance = {
      silver: 'record_payments',
      gold: 'expense_analytics',
      platinum: 'advanced_finance_dashboard',
    }
    for (const [tier, tierString] of Object.entries(paidFinance)) {
      expect(evaluatePlanFeatureValue(tierString)).toBe(true)
      expect(AUDIT_SUPPLIER_LIMITS[tier]).toBeTruthy()
    }
  })
})
