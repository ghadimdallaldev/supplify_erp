import type { Entitlements } from '../types'
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
    if (features[key] !== false) continue
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

  for (const key of keys) {
    if (isRemovedFeatureKey(key)) continue
    if (features[key] !== false) continue
    const src = sources[key]
    if (src !== 'plan' && src !== 'default') continue
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
