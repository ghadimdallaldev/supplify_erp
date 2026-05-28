import type { Entitlements } from '../types'
import { featureEnabled } from './planLimits'

type FeatureMap = Entitlements['features'] | Record<string, unknown> | undefined

/** Plan includes a subscription feature key. */
export function hasPlanFeature(features: FeatureMap, key: string): boolean {
  return featureEnabled(features?.[key as keyof typeof features])
}

/**
 * Cross-tenant Reports hub (/app/reports) — not charts embedded in other modules.
 */
export function canUseGlobalReports(entitlements?: Entitlements | null): boolean {
  return hasPlanFeature(entitlements?.features, 'reports')
}

/** Restaurant finance module (invoices list, overdue, invoice analytics on finance/dashboard). */
export function canUseFinanceInvoices(entitlements?: Entitlements | null): boolean {
  return hasPlanFeature(entitlements?.features, 'finance_invoices')
}
