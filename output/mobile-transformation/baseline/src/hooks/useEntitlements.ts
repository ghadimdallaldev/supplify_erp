import { useMemo } from 'react'
import { useEntitlements } from '../services/api/queries'
import type { EntitlementValue } from '../services/api/queries/auth'

/**
 * Mirror of the API's `evaluatePlanFeatureValue`
 * (apps/api/src/lib/feature-flags.js). Keep the three implementations —
 * API, web `featureEnabled`, and this one — behaviourally identical, or a
 * plan value will gate differently on mobile than the backend enforces.
 *
 * Notably: an absent key is disabled (never fail open), and the strings
 * 'false' and 'disabled' are disabled even though they are non-empty.
 */
export function isEntitlementEnabled(value: EntitlementValue | undefined): boolean {
  if (value === undefined) return false
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    return value !== 'false' && value !== 'disabled' && value !== ''
  }
  return Boolean(value)
}

export function useFeatureEnabled(featureKey: string, enabled = true): boolean {
  const { data } = useEntitlements(enabled)
  if (!enabled) return false
  const features = data?.features ?? {}
  return isEntitlementEnabled(features[featureKey])
}

export function useEntitlementMap(enabled = true) {
  const query = useEntitlements(enabled)
  const { data, isLoading } = query
  return useMemo(
    () => ({
      features: data?.features ?? {},
      plan: data?.plan,
      isLoading,
      error: query.error,
      refetch: query.refetch,
      isEnabled: (key: string) => isEntitlementEnabled((data?.features ?? {})[key]),
    }),
    [data, isLoading, query.error, query.refetch]
  )
}
