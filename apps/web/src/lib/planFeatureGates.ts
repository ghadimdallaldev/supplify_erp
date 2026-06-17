import type { Entitlements } from '../types'
import { isEntitlementFeatureEnabled } from './planLimits'

/**
 * Cross-tenant Reports hub (/app/reports) — not charts embedded in other modules.
 */
export function canUseGlobalReports(entitlements?: Entitlements | null): boolean {
  return isEntitlementFeatureEnabled(entitlements, 'reports')
}

/** Restaurant finance module (invoices list, overdue, invoice analytics on finance/dashboard). */
export function canUseFinanceInvoices(entitlements?: Entitlements | null): boolean {
  return isEntitlementFeatureEnabled(entitlements, 'finance_invoices')
}

/** Restaurant supplier deals browse/redeem (features + planFeatures). */
export function canUseSupplierDeals(entitlements?: Entitlements | null): boolean {
  return isEntitlementFeatureEnabled(entitlements, 'supplier_deals')
}

/** Fulfillment hub and logistics routes. */
export function canUseFulfillment(entitlements?: Entitlements | null): boolean {
  return (
    isEntitlementFeatureEnabled(entitlements, 'fulfillment') ||
    isEntitlementFeatureEnabled(entitlements, 'fulfillment_tools')
  )
}

/** Quick lists module. */
export function canUseQuickLists(entitlements?: Entitlements | null): boolean {
  return isEntitlementFeatureEnabled(entitlements, 'quick_lists')
}

/** Supplier customer growth (import, invite, sponsor, metrics). */
export function canUseSupplierGrowth(entitlements?: Entitlements | null): boolean {
  return isEntitlementFeatureEnabled(entitlements, 'supplier_growth')
}
