import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ContractPriceRow,
  ContractPricingListResponse,
  ContractPricingRecordResponse,
} from '../../../types/contractPricing'
import { api } from '../client'
import { queryKeys, qs } from './keys'

export function useContractPricing(params?: {
  restaurantId?: string
  productId?: string
  q?: string
  status?: string
}) {
  const queryParams: Record<string, string> = {}
  if (params?.restaurantId) queryParams.restaurantId = params.restaurantId
  if (params?.productId) queryParams.productId = params.productId
  if (params?.q) queryParams.q = params.q
  if (params?.status) queryParams.status = params.status

  return useQuery({
    queryKey: queryKeys.contractPricing(queryParams),
    queryFn: () =>
      api.get<ContractPricingListResponse>(`/api/restaurant-pricing${qs(queryParams)}`),
  })
}

export function useCreateContractPricing() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: {
      restaurantId: string
      productId: string
      price: number
      currency?: string
      notes?: string
    }) => api.post<ContractPricingRecordResponse>('/api/restaurant-pricing', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplier', 'contract-pricing'] }),
  })
}

export function useUpdateContractPricing() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string
      price?: number
      isActive?: boolean
      notes?: string | null
    }) => api.patch<ContractPricingRecordResponse>(`/api/restaurant-pricing/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplier', 'contract-pricing'] }),
  })
}

export function useDeactivateContractPricing() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<ContractPricingRecordResponse>(`/api/restaurant-pricing/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplier', 'contract-pricing'] }),
  })
}

export type { ContractPriceRow }
