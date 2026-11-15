import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  QuoteCartPayload,
  QuoteRequestDetail,
  QuoteRequestSummary,
  SupplierQuoteInboxResponse,
  SupplierQuoteInboxSort,
  SupplierQuoteInboxStatus,
  SupplierQuoteRequestDetail,
} from '../../../types/quotes'
import { api } from '../client'
import { queryKeys, qs } from './keys'

export function useQuoteRequests(params?: { status?: string; page?: number; limit?: number }) {
  return useQuery({
    queryKey: queryKeys.quoteRequests(params),
    queryFn: () =>
      api.get<{
        quoteRequests: QuoteRequestSummary[]
        pagination: { page: number; limit: number; total: number }
      }>(`/api/quote-requests${qs(params)}`),
  })
}

export function useQuoteRequest(id: string) {
  return useQuery({
    queryKey: queryKeys.quoteRequest(id),
    queryFn: () => api.get<QuoteRequestDetail>(`/api/quote-requests/${id}`),
    enabled: Boolean(id),
  })
}

export function useCreateQuoteRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: {
      items: Array<{ productId: string; quantity: number; unit?: string; notes?: string }>
      supplierIds: string[]
      note?: string
      neededBy?: string
    }) =>
      api.post<{
        quoteRequest: QuoteRequestSummary
        itemCount: number
        supplierCount: number
      }>('/api/quote-requests', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quote-requests'] }),
  })
}

export function useConvertQuoteToCart() {
  return useMutation({
    mutationFn: ({ quoteRequestId, supplierRowId }: { quoteRequestId: string; supplierRowId: string }) =>
      api.post<QuoteCartPayload>(
        `/api/quote-requests/${quoteRequestId}/suppliers/${supplierRowId}/to-cart`
      ),
  })
}

export function useUpdateQuoteRequestStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      quoteRequestId,
      status,
    }: {
      quoteRequestId: string
      status: 'closed' | 'cancelled'
    }) => api.patch<QuoteRequestDetail>(`/api/quote-requests/${quoteRequestId}`, { status }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['quote-requests'] })
      queryClient.invalidateQueries({
        queryKey: queryKeys.quoteRequest(variables.quoteRequestId),
      })
    },
  })
}

export function useSupplierQuoteInbox(params?: {
  status?: SupplierQuoteInboxStatus
  search?: string
  sort?: SupplierQuoteInboxSort
  page?: number
  limit?: number
}) {
  return useQuery({
    queryKey: queryKeys.supplierQuoteInbox(params),
    queryFn: () =>
      api.get<SupplierQuoteInboxResponse>(`/api/quote-requests/supplier/inbox${qs(params)}`),
  })
}

export function useSupplierQuoteRequest(id: string) {
  return useQuery({
    queryKey: queryKeys.supplierQuoteRequest(id),
    queryFn: () =>
      api.get<SupplierQuoteRequestDetail>(`/api/quote-requests/supplier/inbox/${id}`),
    enabled: Boolean(id),
  })
}

/** Supplier declines to quote; `declined` was previously unreachable from any client. */
export function useDeclineSupplierQuoteRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      quoteRequestSupplierId,
      reason,
    }: {
      quoteRequestSupplierId: string
      reason?: string
    }) =>
      api.post<SupplierQuoteRequestDetail>(
        `/api/quote-requests/supplier/inbox/${quoteRequestSupplierId}/decline`,
        reason ? { reason } : {}
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['supplier-quote-inbox'] })
      queryClient.invalidateQueries({
        queryKey: queryKeys.supplierQuoteRequest(variables.quoteRequestSupplierId),
      })
    },
  })
}

export function useSubmitSupplierQuoteResponse() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      quoteRequestSupplierId,
      ...body
    }: {
      quoteRequestSupplierId: string
      note?: string
      items: Array<{
        quoteRequestItemId: string
        isAvailable?: boolean
        unitPrice?: number | null
        currency?: string
        quantity?: number | null
        deliveryDate?: string | null
        note?: string | null
      }>
    }) =>
      api.post<SupplierQuoteRequestDetail>(
        `/api/quote-requests/supplier/inbox/${quoteRequestSupplierId}/respond`,
        body
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['supplier-quote-inbox'] })
      queryClient.invalidateQueries({
        queryKey: queryKeys.supplierQuoteRequest(variables.quoteRequestSupplierId),
      })
    },
  })
}
