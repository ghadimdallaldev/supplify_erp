import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ConsumerLoyaltyProgram,
  ConsumerMenuAdminResponse,
  ConsumerMenuCategory,
  ConsumerMenuItem,
  ConsumerOrdersListResponse,
  ConsumerOrderStatus,
  UpsertConsumerLoyaltyProgramBody,
} from '../../../types/consumer'
import { api } from '../client'
import { queryKeys, qs } from './keys'

export function useConsumerMenuAdmin(params?: { branchId?: string }) {
  const queryParams: Record<string, string> = {}
  if (params?.branchId) queryParams.branchId = params.branchId

  return useQuery({
    queryKey: queryKeys.consumerMenu(queryParams),
    queryFn: () => api.get<ConsumerMenuAdminResponse>(`/api/consumer/menu${qs(queryParams)}`),
  })
}

export function useCreateConsumerMenuItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: {
      categoryId: string
      name: string
      basePrice: number
      description?: string
    }) => api.post<{ item: ConsumerMenuItem }>('/api/consumer/menu/items', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consumer', 'menu'] }),
  })
}

export function useUpdateConsumerMenuItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string
      name?: string
      basePrice?: number
      isAvailable?: boolean
      description?: string
    }) => api.patch<{ item: ConsumerMenuItem }>(`/api/consumer/menu/items/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consumer', 'menu'] }),
  })
}

export function useConsumerOrders(params?: { branchId?: string; status?: ConsumerOrderStatus }) {
  const queryParams: Record<string, string> = {}
  if (params?.branchId) queryParams.branchId = params.branchId
  if (params?.status) queryParams.status = params.status

  return useQuery({
    queryKey: queryKeys.consumerOrders(queryParams),
    queryFn: () => api.get<ConsumerOrdersListResponse>(`/api/consumer/orders${qs(queryParams)}`),
    refetchInterval: 30_000,
  })
}

export function useUpdateConsumerOrderStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      status,
      notes,
    }: {
      id: string
      status: ConsumerOrderStatus
      notes?: string
    }) => api.patch<{ order: unknown }>(`/api/consumer/orders/${id}/status`, { status, notes }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consumer', 'orders'] }),
  })
}

export function useConsumerLoyaltyProgram() {
  return useQuery({
    queryKey: queryKeys.consumerLoyaltyProgram,
    queryFn: async () => {
      const data = await api.get<{ program: ConsumerLoyaltyProgram | null }>(
        '/api/loyalty/consumer/program'
      )
      return data.program
    },
  })
}

export function useUpsertConsumerLoyaltyProgram() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: UpsertConsumerLoyaltyProgramBody) =>
      api.put<{ program: ConsumerLoyaltyProgram }>('/api/loyalty/consumer/program', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.consumerLoyaltyProgram }),
  })
}

export type { ConsumerMenuCategory, ConsumerMenuItem, ConsumerLoyaltyProgram }
