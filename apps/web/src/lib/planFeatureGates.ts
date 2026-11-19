import type { Entitlements } from '../types'
import {
  featureEnabled,
  isEntitlementFeatureEnabled,
  resolveEntitlementFeature,
} from './planLimits'

/**
 * Default-on admin kill switches (see apps/api/src/lib/feature-keys.js DEFAULT_ON_FEATURE_KEYS).
 * ON unless the resolved feature map explicitly says off (admin global / per-account override,
 * or a plan that sets the key false). Missing entitlements or a missing key → ON, so nav does
 * not flicker closed while entitlements load or against an older API.
 */
export function isDefaultOnFeatureEnabled(
  entitlements: Entitlements | null | undefined,
  key: string
): boolean {
  const value = resolveEntitlementFeature(entitlements, key)
  if (value === undefined || value === null) return true
  return featureEnabled(value)
}

/** Sidebar href → default-on feature key that hides the item when an admin turns it off. */
export const NAV_HREF_DEFAULT_ON_FEATURE: Record<string, string> = {
  '/app/orders': 'order_management',
  '/app/products': 'product_catalog',
  '/app/suppliers': 'supplier_directory',
  '/app/restaurants': 'customer_directory',
  '/app/cart': 'ordering',
  '/app/quote-requests': 'quote_requests',
  '/app/quote-requests/supplier': 'quote_requests',
  '/app/contract-pricing': 'contract_pricing',
  '/app/my-prices': 'contract_pricing',
  '/app/loyalty': 'loyalty',
  '/app/reservations': 'reservations',
  '/app/staff': 'staff_management',
  '/app/consumer-menu': 'consumer_storefront',
  '/app/consumer-orders': 'consumer_storefront',
  '/app/consumer-loyalty': 'consumer_storefront',
  '/app/run-sheet': 'ops_dashboard',
}

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

/** Purchasing-linked recipe costing for eligible paid plans. */
export function canUseRecipeCosting(entitlements?: Entitlements | null): boolean {
  return isEntitlementFeatureEnabled(entitlements, 'recipe_costing')
}

/** Supplier customer growth (import, invite, sponsor, metrics). */
export function canUseSupplierGrowth(entitlements?: Entitlements | null): boolean {
  return isEntitlementFeatureEnabled(entitlements, 'supplier_growth')
}
