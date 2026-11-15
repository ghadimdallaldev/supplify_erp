import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  FeaturedPackage,
  FeaturedPayBody,
  FeaturedPlacement,
  FeaturedPurchaseBody,
} from '../../../types/featuredPlacement'
import { api } from '../client'
import { queryKeys } from './keys'

export function useFeaturedPackages() {
  return useQuery({
    queryKey: queryKeys.featuredPackages,
    queryFn: async () => {
      const data = await api.get<{ packages?: FeaturedPackage[] }>(
        '/api/suppliers/featured-placement/packages'
      )
      return data.packages ?? []
    },
  })
}

export function useMyFeaturedPlacements() {
  return useQuery({
    queryKey: queryKeys.featuredPlacements,
    queryFn: async () => {
      const data = await api.get<{ placements?: FeaturedPlacement[] }>(
        '/api/suppliers/featured-placement/mine'
      )
      return data.placements ?? []
    },
  })
}

export function usePurchaseFeaturedPlacement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: FeaturedPurchaseBody) =>
      api.post<{ placement: FeaturedPlacement }>(
        '/api/suppliers/featured-placement/purchase',
        body
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.featuredPlacements })
    },
  })
}

export function usePayFeaturedPlacement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & FeaturedPayBody) =>
      api.post<{ placement: FeaturedPlacement }>(
        `/api/suppliers/featured-placement/${id}/pay`,
        body
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.featuredPlacements })
    },
  })
}

export function useBillingPaymentMethods() {
  return useQuery({
    queryKey: ['billing', 'payment-methods'],
    queryFn: () =>
      api.get<{
        paymentMethods: Array<{
          id: string
          type: string
          brand?: string | null
          last4?: string | null
          is_default: boolean
        }>
      }>('/api/billing/payment-methods'),
  })
}

export function useAddBillingPaymentMethod() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: {
      type: 'CARD'
      setAsDefault?: boolean
      card: { number: string; expMonth: string; expYear: string }
    }) =>
      api.post<{
        paymentMethod: { id: string }
      }>('/api/billing/payment-methods', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['billing', 'payment-methods'] }),
  })
}
