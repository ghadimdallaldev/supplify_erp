import { useGetEntitlementsQuery } from '../services/api'
import type { Entitlements } from '../types'
import { useAppSelector } from './redux'

/** Current tenant subscription entitlements (features + limits). */
export function useEntitlements() {
  const { user } = useAppSelector((state) => state.auth)
  const { data, isLoading, error, refetch } = useGetEntitlementsQuery(undefined, {
    skip: !user?.id || user?.role === 'ADMIN',
  })

  return {
    entitlements: data?.entitlements as Entitlements | undefined,
    isLoading,
    error,
    refetch,
  }
}
