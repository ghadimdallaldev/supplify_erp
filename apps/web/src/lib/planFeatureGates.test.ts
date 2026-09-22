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
  it('honours an explicitly disabled feature over the raw plan JSON', () => {
    // `features` is the resolved map (tenant override > global flag > plan JSON).
    // Letting `planFeatures` win re-enabled features an admin had switched off.
    const e = ent({
      features: { reports: false },
      planFeatures: { reports: true },
    })
    expect(canUseGlobalReports(e)).toBe(false)
  })

  it('falls back to planFeatures only when the resolved map omits the key', () => {
    const e = ent({
      features: {},
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

  it('enables supplier_deals from planFeatures when the resolved map omits it', () => {
    const e = ent({
      features: {},
      planFeatures: { supplier_deals: true },
    })
    expect(canUseSupplierDeals(e)).toBe(true)
  })

  it('keeps supplier_deals off when the resolved map disables it', () => {
    const e = ent({
      features: { supplier_deals: false },
      planFeatures: { supplier_deals: true },
    })
    expect(canUseSupplierDeals(e)).toBe(false)
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
