import { useGetEntitlementsQuery } from '../services/api'
import type { Entitlements } from '../types'
import { useImpersonation } from './useImpersonation'

/** Current tenant subscription entitlements (features + limits). */
export function useEntitlements() {
  const { user, shouldLoadTenantEntitlements } = useImpersonation()
  const { data, isLoading, error, refetch } = useGetEntitlementsQuery(undefined, {
    skip: !shouldLoadTenantEntitlements,
  })

  return {
    entitlements: data?.entitlements as Entitlements | undefined,
    isLoading,
    error,
    refetch,
    user,
  }
}
