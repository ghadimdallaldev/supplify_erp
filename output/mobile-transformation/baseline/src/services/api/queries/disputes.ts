import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  CreateDisputeBody,
  Dispute,
  DisputeDetailResponse,
  ResolveDisputeBody,
} from '../../../types/disputes'
import { api } from '../client'
import { queryKeys, qs } from './keys'

export function useDisputes(params?: Record<string, string>) {
  return useQuery({
    queryKey: queryKeys.disputes(params),
    queryFn: async () => {
      const data = await api.get<{ disputes: Dispute[] }>(`/api/disputes${qs(params)}`)
      return data.disputes ?? []
    },
  })
}

export function useIncomingDisputes() {
  return useQuery({
    queryKey: queryKeys.disputes({ incoming: '1' }),
    queryFn: async () => {
      const data = await api.get<{ disputes: Dispute[] }>('/api/disputes/incoming')
      return data.disputes ?? []
    },
  })
}

export function useDispute(id: string) {
  return useQuery({
    queryKey: queryKeys.dispute(id),
    queryFn: () => api.get<DisputeDetailResponse>(`/api/disputes/${id}`),
    enabled: Boolean(id),
  })
}

export function useCreateDispute() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateDisputeBody) => api.post<Dispute>('/api/disputes', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['disputes'] }),
  })
}

export function useReviewDispute() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<DisputeDetailResponse>(`/api/disputes/${id}/review`),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.dispute(id) })
      qc.invalidateQueries({ queryKey: ['disputes'] })
    },
  })
}

export function useResolveDispute() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ResolveDisputeBody }) =>
      api.post<DisputeDetailResponse>(`/api/disputes/${id}/resolve`, body),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.dispute(id) })
      qc.invalidateQueries({ queryKey: ['disputes'] })
    },
  })
}

export function useRejectDispute() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, resolutionNotes }: { id: string; resolutionNotes: string }) =>
      api.post<DisputeDetailResponse>(`/api/disputes/${id}/reject`, { resolutionNotes }),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.dispute(id) })
      qc.invalidateQueries({ queryKey: ['disputes'] })
    },
  })
}

export function useCancelDispute() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<DisputeDetailResponse>(`/api/disputes/${id}/cancel`),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.dispute(id) })
      qc.invalidateQueries({ queryKey: ['disputes'] })
    },
  })
}
