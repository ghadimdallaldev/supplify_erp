import { useQuery } from '@tanstack/react-query'
import { api } from '../../services/api/client'

export type PublicPlatformFeatures = {
  mobile_public_shop: boolean
}

/**
 * Admin platform flag `mobile_public_shop` (Admin → Features).
 * Fail-closed: false while loading or on error.
 */
export function useMobilePublicShopEnabled() {
  const query = useQuery({
    queryKey: ['public-shop', 'platform-features'],
    queryFn: () => api.get<PublicPlatformFeatures>('/api/public/features', false),
    staleTime: 60_000,
    retry: 1,
  })

  return {
    enabled: query.data?.mobile_public_shop === true,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  }
}
