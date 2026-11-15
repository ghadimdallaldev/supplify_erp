import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../../services/api/client'
import type {
  PublicCheckoutPayload,
  PublicOrder,
  PublicOrderPreview,
  PublicProduct,
  PublicSupplierProfile,
  PublicSupplierSummary,
  ConsumerAddress,
} from './types'

export function usePublicSuppliers(search = '') {
  return useQuery({
    queryKey: ['public-shop', 'suppliers', search],
    queryFn: () =>
      api.get<{ suppliers: PublicSupplierSummary[] }>(
        `/api/public/suppliers?q=${encodeURIComponent(search)}`,
        false
      ),
  })
}

export function usePublicSupplier(idOrSlug: string) {
  return useQuery({
    queryKey: ['public-shop', 'supplier', idOrSlug],
    queryFn: () => api.get<PublicSupplierProfile>(`/api/public/suppliers/${encodeURIComponent(idOrSlug)}`, false),
    enabled: Boolean(idOrSlug),
  })
}

export function usePublicProducts(idOrSlug: string, search = '', category = '') {
  return useQuery({
    queryKey: ['public-shop', 'products', idOrSlug, search, category],
    queryFn: () =>
      api.get<{ products: PublicProduct[]; categories: string[] }>(
        `/api/public/suppliers/${encodeURIComponent(idOrSlug)}/products?q=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}&limit=48`,
        false
      ),
    enabled: Boolean(idOrSlug),
  })
}

export function usePreviewPublicOrder(idOrSlug: string) {
  return useMutation({
    mutationFn: (payload: PublicCheckoutPayload) =>
      api.post<PublicOrderPreview>(
        `/api/public/suppliers/${encodeURIComponent(idOrSlug)}/orders/preview`,
        payload,
        false
      ),
  })
}

export function usePlacePublicOrder(idOrSlug: string, authenticated: boolean) {
  return useMutation({
    mutationFn: ({
      payload,
      idempotencyKey,
    }: {
      payload: PublicCheckoutPayload & {
        customer: { name: string; phone: string; email?: string; whatsappConsent?: boolean }
      }
      idempotencyKey: string
    }) =>
      api.post<{
        order: PublicOrder
        trackingToken?: string | null
        replay: boolean
        bankTransferInstructions?: string | null
      }>(
        `/api/public/suppliers/${encodeURIComponent(idOrSlug)}/orders`,
        payload,
        authenticated,
        { 'Idempotency-Key': idempotencyKey }
      ),
  })
}

export function useGuestPublicOrder(token: string) {
  return useQuery({
    queryKey: ['public-shop', 'tracking', token],
    queryFn: () => api.get<PublicOrder>(`/api/public/orders/${encodeURIComponent(token)}`, false),
    enabled: Boolean(token),
    refetchInterval: 30_000,
  })
}

export function useConsumerPublicOrders(enabled = true) {
  return useQuery({
    queryKey: ['public-shop', 'consumer-orders'],
    queryFn: () => api.get<{ orders: PublicOrder[] }>('/api/consumer/orders'),
    enabled,
  })
}

export function useConsumerPublicOrder(id: string) {
  return useQuery({
    queryKey: ['public-shop', 'consumer-order', id],
    queryFn: () => api.get<{ order: PublicOrder }>(`/api/consumer/orders/${id}`),
    enabled: Boolean(id),
  })
}

export function useConsumerAddresses(enabled = true) {
  return useQuery({
    queryKey: ['public-shop', 'consumer-addresses'],
    queryFn: () => api.get<{ addresses: ConsumerAddress[] }>('/api/consumer/addresses'),
    enabled,
  })
}

export function useSupplierPublicSales() {
  return useQuery({
    queryKey: ['supplier', 'public-sales'],
    queryFn: () => api.get<any>('/api/supplier/public-sales'),
  })
}

export function useUpdateSupplierPublicSales() {
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.patch<any>('/api/supplier/public-sales', payload),
  })
}
