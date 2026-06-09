import type { Entitlements } from '../types'
import { featureEnabled, isEntitlementFeatureEnabled } from './planLimits'
import { isRemovedFeatureKey } from './removedFeatures'

export function formatFeatureKeyLabel(featureKey: string): string {
  return featureKey
    .split('_')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : ''))
    .join(' ')
}

export type ExternalFeatureOffSource = 'tenant_override' | 'global'

export interface ExternallyDisabledFeature {
  key: string
  label: string
  source: ExternalFeatureOffSource
}

/**
 * Features that are off because of an admin tenant override or a global platform flag,
 * not only because the subscription plan omitted them.
 */
export function getExternallyDisabledFeatures(
  entitlements: Entitlements
): ExternallyDisabledFeature[] {
  const sources = entitlements.featureSources
  if (!sources || typeof sources !== 'object') return []

  const features = entitlements.features ?? {}
  const keys = new Set([...Object.keys(features), ...Object.keys(sources)])
  const out: ExternallyDisabledFeature[] = []

  for (const key of keys) {
    if (isRemovedFeatureKey(key)) continue
    if (featureEnabled(features[key])) continue
    const src = sources[key]
    if (src !== 'tenant_override' && src !== 'global') continue
    out.push({
      key,
      label: formatFeatureKeyLabel(key),
      source: src,
    })
  }

  return out.sort((a, b) => a.label.localeCompare(b.label))
}

export type PlanTierFeatureSource = 'plan' | 'default'

export interface PlanTierDisabledFeature {
  key: string
  label: string
  source: PlanTierFeatureSource
}

const SUPPLIER_ONLY_PLAN_FEATURES = new Set([
  'fulfillment',
  'fulfillment_tools',
  'driver_management',
  'warehouses',
  'multi_warehouse',
  'promotions',
])

const RESTAURANT_ONLY_PLAN_FEATURES = new Set([
  'smart_reorder',
  'receiving_quality',
  'waste_tracking',
  'waitlist_auto_promo',
  'supplier_reviews',
  'supplier_deals',
  'supplier_deals_redeem',
])

/** Plan-tier banner only lists features relevant to the tenant type. */
export function isPlanTierBannerFeatureApplicable(
  featureKey: string,
  tenantType: Entitlements['tenantType']
): boolean {
  if (tenantType === 'RESTAURANT' && SUPPLIER_ONLY_PLAN_FEATURES.has(featureKey)) return false
  if (tenantType === 'SUPPLIER' && RESTAURANT_ONLY_PLAN_FEATURES.has(featureKey)) return false
  return true
}

/**
 * Features that are off because of the subscription plan tier (plan JSON or product default),
 * not because of an admin override or global kill-switch.
 */
export function getPlanTierDisabledFeatures(entitlements: Entitlements): PlanTierDisabledFeature[] {
  const sources = entitlements.featureSources
  if (!sources || typeof sources !== 'object') return []

  const features = entitlements.features ?? {}
  const keys = new Set([...Object.keys(features), ...Object.keys(sources)])
  const out: PlanTierDisabledFeature[] = []

  const planFeatures = entitlements.planFeatures ?? {}

  for (const key of keys) {
    if (isRemovedFeatureKey(key)) continue
    if (!isPlanTierBannerFeatureApplicable(key, entitlements.tenantType)) continue
    const src = sources[key]
    if (src !== 'plan' && src !== 'default') continue
    // Keys never on the plan JSON are N/A for this tier, not "missing from subscription".
    if (src === 'default' && !Object.prototype.hasOwnProperty.call(planFeatures, key)) continue
    if (isEntitlementFeatureEnabled(entitlements, key)) continue
    out.push({
      key,
      label: formatFeatureKeyLabel(key),
      source: src,
    })
  }

  return out.sort((a, b) => a.label.localeCompare(b.label))
}

export function settingsFeaturesTabPath(tenantType: Entitlements['tenantType']): string {
  return tenantType === 'SUPPLIER' ? '/app/settings?tab=plan' : '/app/settings?tab=subscription'
}

/** Normalize API upgrade URLs so bare `/app/settings` opens Plan & usage, not profile. */
export function resolveUpgradeUrl(
  upgradeUrl: string | undefined | null,
  tenantType?: Entitlements['tenantType'] | string | null,
  userRole?: string | null
): string {
  const type: Entitlements['tenantType'] =
    tenantType === 'SUPPLIER' || tenantType === 'RESTAURANT'
      ? tenantType
      : userRole === 'SUPPLIER'
        ? 'SUPPLIER'
        : 'RESTAURANT'
  const fallback = settingsFeaturesTabPath(type)
  if (!upgradeUrl) return fallback
  const normalized = upgradeUrl.startsWith('/') ? upgradeUrl : `/app/${upgradeUrl}`
  if (normalized === '/app/settings' || !normalized.includes('tab=')) {
    return fallback
  }
  return normalized
}
