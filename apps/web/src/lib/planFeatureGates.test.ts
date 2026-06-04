import { describe, expect, it } from 'vitest'
import type { Entitlements } from '../types'
import { canUseFinanceInvoices, canUseGlobalReports, canUseSupplierDeals } from './planFeatureGates'

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
})
