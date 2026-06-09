import { describe, expect, it } from 'vitest'
import type { Entitlements } from '../types'
import {
  canUseFinanceInvoices,
  canUseGlobalReports,
  canUseSupplierDeals,
  canUseFulfillment,
  canUseQuickLists,
} from './planFeatureGates'

function ent(partial: Partial<Entitlements>): Entitlements {
  return partial as Entitlements
}

describe('planFeatureGates', () => {
  it('enables reports from planFeatures when features map is off', () => {
    const e = ent({
      features: { reports: false },
      planFeatures: { reports: true },
    })
    expect(canUseGlobalReports(e)).toBe(true)
  })

  it('enables finance_invoices from planFeatures tier string', () => {
    const e = ent({
      features: {},
      planFeatures: { finance_invoices: 'enabled' },
    })
    expect(canUseFinanceInvoices(e)).toBe(true)
  })

  it('enables supplier_deals from planFeatures', () => {
    const e = ent({
      features: { supplier_deals: false },
      planFeatures: { supplier_deals: true },
    })
    expect(canUseSupplierDeals(e)).toBe(true)
  })

  it('gates fulfillment when fulfillment_tools tier string is enabled', () => {
    const e = ent({
      features: { fulfillment_tools: 'warehouse_pick_pack' },
      planFeatures: {},
    })
    expect(canUseFulfillment(e)).toBe(true)
  })

  it('gates quick lists from plan feature key', () => {
    const e = ent({
      features: { quick_lists: 'full_schedule' },
      planFeatures: {},
    })
    expect(canUseQuickLists(e)).toBe(true)
  })
})
