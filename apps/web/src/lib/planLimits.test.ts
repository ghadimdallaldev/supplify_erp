import { describe, it, expect } from 'vitest'
import {
  getOrderPlaceGate,
  formatOrderPlaceGateMessage,
  getOrderUsageBadge,
  isQuickListSchedulingEnabled,
  getQuickListScheduleGate,
  getDealRedeemGate,
  getSupplierPromotionGate,
  canBrowseSupplierDeals,
  getPlanLimitGate,
  featureEnabled,
  evaluatePlanFeatureValue,
  isEntitlementFeatureEnabled,
  multiBranchEnabled,
  multiWarehousePlanEnabled,
  getBranchAddGate,
  canAddWarehouses,
  warehousesFeatureEnabled,
} from './planLimits'
import type { Entitlements } from '../types'

const baseEntitlements = (limits: Record<string, number>, usage: Record<string, number>) =>
  ({
    plan: { name: 'Free', code: 'free' },
    limits,
    usage,
    features: {},
  }) as Entitlements

describe('getOrderPlaceGate', () => {
  it('allows when under limit', () => {
    const gate = getOrderPlaceGate(
      baseEntitlements({ orders_per_day: 3 }, { orders_per_day: 1 }),
      1
    )
    expect(gate.canPlace).toBe(true)
    expect(gate.reason).toBe('ok')
    expect(gate.remaining).toBe(2)
  })

  it('blocks when at limit', () => {
    const gate = getOrderPlaceGate(
      baseEntitlements({ orders_per_day: 3 }, { orders_per_day: 3 }),
      1
    )
    expect(gate.canPlace).toBe(false)
    expect(gate.reason).toBe('at_limit')
  })

  it('blocks when cart would exceed limit (multi-supplier)', () => {
    const gate = getOrderPlaceGate(
      baseEntitlements({ orders_per_day: 3 }, { orders_per_day: 2 }),
      2
    )
    expect(gate.canPlace).toBe(false)
    expect(gate.reason).toBe('would_exceed')
  })

  it('treats unlimited as always allowed', () => {
    const gate = getOrderPlaceGate(
      baseEntitlements({ orders_per_day: -1 }, { orders_per_day: 99 }),
      5
    )
    expect(gate.canPlace).toBe(true)
    expect(gate.reason).toBe('unlimited')
  })
})

describe('formatOrderPlaceGateMessage', () => {
  it('mentions supplier split for would_exceed', () => {
    const gate = getOrderPlaceGate(
      baseEntitlements({ orders_per_day: 3 }, { orders_per_day: 2 }),
      2
    )
    const msg = formatOrderPlaceGateMessage(gate)
    expect(msg).toContain('2 orders')
    expect(msg).toContain('one per supplier')
  })
})

describe('getOrderUsageBadge', () => {
  it('returns null for unlimited', () => {
    expect(getOrderUsageBadge(baseEntitlements({ orders_per_day: -1 }, {}))).toBeNull()
  })

  it('flags at limit', () => {
    const badge = getOrderUsageBadge(baseEntitlements({ orders_per_day: 3 }, { orders_per_day: 3 }))
    expect(badge?.label).toBe('3/3')
    expect(badge?.atLimit).toBe(true)
  })
})

describe('quick list scheduling', () => {
  it('enables scheduling for basic_single_schedule', () => {
    const ent = {
      ...baseEntitlements({ scheduled_quick_lists: 1 }, { scheduled_quick_lists: 0 }),
      features: { quick_lists: 'basic_single_schedule' },
    } as Entitlements
    expect(isQuickListSchedulingEnabled(ent)).toBe(true)
  })

  it('blocks scheduling for basic_manual_only', () => {
    const ent = {
      ...baseEntitlements({}, {}),
      features: { quick_lists: 'basic_manual_only' },
    } as Entitlements
    expect(isQuickListSchedulingEnabled(ent)).toBe(false)
  })

  it('enables scheduling when planFeatures has full_schedule but features is false', () => {
    const ent = {
      ...baseEntitlements({}, {}),
      features: { quick_lists: false },
      planFeatures: { quick_lists: 'full_schedule' },
    } as Entitlements
    expect(isQuickListSchedulingEnabled(ent)).toBe(true)
  })

  it('allows one scheduled list on Free', () => {
    const ent = {
      ...baseEntitlements({ scheduled_quick_lists: 1 }, { scheduled_quick_lists: 0 }),
      features: { quick_lists: 'basic_single_schedule' },
    } as Entitlements
    expect(getQuickListScheduleGate(ent, false).canSchedule).toBe(true)
    expect(getQuickListScheduleGate(ent, true).canSchedule).toBe(true)
  })

  it('blocks a second scheduled list on Free', () => {
    const ent = {
      ...baseEntitlements({ scheduled_quick_lists: 1 }, { scheduled_quick_lists: 1 }),
      features: { quick_lists: 'basic_single_schedule' },
    } as Entitlements
    expect(getQuickListScheduleGate(ent, false).canSchedule).toBe(false)
    expect(getQuickListScheduleGate(ent, true).canSchedule).toBe(true)
  })
})

describe('deal and promotion limits', () => {
  it('restaurant with supplier_deals can redeem until daily cap (PLN / RST-75)', () => {
    const ent = {
      ...baseEntitlements({ deal_redemptions_per_day: 1 }, { deal_redemptions_per_day: 0 }),
      features: { supplier_deals: true },
    } as Entitlements
    expect(canBrowseSupplierDeals(ent)).toBe(true)
    expect(getDealRedeemGate(ent).canRedeem).toBe(true)
    const blocked = getDealRedeemGate({ ...ent, usage: { deal_redemptions_per_day: 1 } })
    expect(blocked.canRedeem).toBe(false)
    expect(blocked.message).toContain('deal redemption')
  })

  it('restaurant without supplier_deals cannot browse deals (GATE-R19)', () => {
    const ent = {
      ...baseEntitlements({}, {}),
      features: { supplier_deals: false },
    } as Entitlements
    expect(canBrowseSupplierDeals(ent)).toBe(false)
  })

  it('supplier can create one promotion on capped plan (GATE-S13 / SUP-52)', () => {
    const ent = {
      ...baseEntitlements({ promotions: 1 }, { promotions: 0 }),
      features: { promotions: true },
    } as Entitlements
    expect(getSupplierPromotionGate(ent).canCreate).toBe(true)
    const blocked = getSupplierPromotionGate({ ...ent, usage: { promotions: 1 } })
    expect(blocked.canCreate).toBe(false)
    expect(blocked.message).toContain('promotion')
  })

  it('getPlanLimitGate labels deal_redemptions_per_day for upgrade messaging', () => {
    const ent = baseEntitlements({ deal_redemptions_per_day: 1 }, { deal_redemptions_per_day: 1 })
    const gate = getPlanLimitGate(ent, 'deal_redemptions_per_day', 1)
    expect(gate.canUse).toBe(false)
    expect(gate.message).toContain('deal redemption')
  })
})

describe('featureEnabled / evaluatePlanFeatureValue', () => {
  it('featureEnabled(true) is true', () => {
    expect(featureEnabled(true)).toBe(true)
    expect(evaluatePlanFeatureValue(true)).toBe(true)
  })

  it('featureEnabled("central_purchasing") is true', () => {
    expect(featureEnabled('central_purchasing')).toBe(true)
  })

  it('featureEnabled("full_api_webhooks") is true', () => {
    expect(featureEnabled('full_api_webhooks')).toBe(true)
  })

  it('featureEnabled(false) is false', () => {
    expect(featureEnabled(false)).toBe(false)
  })

  it('featureEnabled("false") is false', () => {
    expect(featureEnabled('false')).toBe(false)
  })

  it('featureEnabled("disabled") is false', () => {
    expect(featureEnabled('disabled')).toBe(false)
  })

  it('isEntitlementFeatureEnabled uses planFeatures when features is false', () => {
    const ent = {
      plan: { name: 'Platinum', code: 'platinum' },
      features: { multi_branch: false },
      planFeatures: { multi_branch: 'central_purchasing' },
    } as Entitlements
    expect(isEntitlementFeatureEnabled(ent, 'multi_branch')).toBe(true)
  })
})

describe('multi_branch feature gates', () => {
  const entWithFeature = (multi_branch: unknown) =>
    ({
      plan: { name: 'Test', code: 'test' },
      limits: { branches: 3 },
      usage: { branches: 1 },
      features: { multi_branch },
    }) as Entitlements

  it('enables for Gold (boolean true)', () => {
    expect(multiBranchEnabled(entWithFeature(true))).toBe(true)
    expect(getBranchAddGate(entWithFeature(true), 1).canAdd).toBe(true)
  })

  it('enables for Platinum (central_purchasing string)', () => {
    expect(multiBranchEnabled(entWithFeature('central_purchasing'))).toBe(true)
    expect(getBranchAddGate(entWithFeature('central_purchasing'), 1).canAdd).toBe(true)
  })

  it('blocks for Silver (false) at single-branch limit', () => {
    const silver = {
      plan: { name: 'Silver', code: 'silver' },
      limits: { branches: 1 },
      usage: { branches: 1 },
      features: { multi_branch: false },
    } as Entitlements
    expect(multiBranchEnabled(silver)).toBe(false)
    expect(getBranchAddGate(silver, 1).canAdd).toBe(false)
    expect(getBranchAddGate(silver, 1).reason).toBe('upgrade_to_gold')
  })

  it('Gold at included branch limit suggests add-on', () => {
    const gold = {
      plan: { name: 'Gold', code: 'gold' },
      limits: { branches: 3 },
      limitsBeforeAddons: { branches: 2 },
      locationLimits: {
        branches: {
          included: 2,
          addonQuantity: 1,
          effective: 3,
          current: 3,
        },
      },
      features: { multi_branch: true },
    } as Entitlements
    expect(getBranchAddGate(gold, 3).canAdd).toBe(false)
    expect(getBranchAddGate(gold, 3).reason).toBe('addon_or_upgrade')
  })

  it('blocks 7th branch with enterprise message', () => {
    const ent = {
      plan: { name: 'Platinum', code: 'platinum' },
      limits: { branches: 8 },
      locationLimits: {
        branches: {
          included: 3,
          addonQuantity: 5,
          effective: 8,
          current: 6,
          enterpriseThreshold: 6,
          atEnterpriseThreshold: true,
        },
      },
      features: { multi_branch: true },
    } as Entitlements
    expect(getBranchAddGate(ent, 6).canAdd).toBe(false)
    expect(getBranchAddGate(ent, 6).reason).toBe('contact_enterprise')
  })
})

describe('supplier warehouse and multi_warehouse strings', () => {
  it('enables warehouses for tier string on planFeatures', () => {
    const ent = {
      plan: { name: 'Silver', code: 'silver' },
      features: { warehouses: false },
      planFeatures: { warehouses: true },
      limits: { warehouses: 1 },
      usage: { warehouses: 0 },
    } as Entitlements
    expect(warehousesFeatureEnabled(ent)).toBe(true)
  })

  it('enables multi_warehouse for Gold tier string', () => {
    const ent = {
      plan: { name: 'Gold', code: 'gold' },
      features: { multi_warehouse: 'on' },
    } as Entitlements
    expect(multiWarehousePlanEnabled(ent)).toBe(true)
  })
})

describe('supplier warehouse free tier', () => {
  it('warehouses feature off on Free', () => {
    const ent = {
      plan: { name: 'Free', code: 'free' },
      limits: { warehouses: 0 },
      usage: { warehouses: 0 },
      features: { warehouses: false },
    } as Entitlements
    expect(warehousesFeatureEnabled(ent)).toBe(false)
    expect(canAddWarehouses(ent, 0)).toBe(false)
  })

  it('allows first warehouse on Silver', () => {
    const ent = {
      plan: { name: 'Silver', code: 'silver' },
      limits: { warehouses: 1 },
      usage: { warehouses: 0 },
      features: { warehouses: true },
    } as Entitlements
    expect(canAddWarehouses(ent, 0)).toBe(true)
    expect(canAddWarehouses(ent, 1)).toBe(false)
  })
})
