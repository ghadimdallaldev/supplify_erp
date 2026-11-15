import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  AddInventoryBody,
  AdjustInventoryBody,
  ExpirySummary,
  PatchInventoryBody,
  RestaurantInventoryItem,
} from '../../../types/inventory'
import { api } from '../client'
import { queryKeys } from './keys'

function normalizeInventoryItem(raw: Record<string, unknown>): RestaurantInventoryItem {
  const productId = String(raw.product_id ?? raw.productId ?? raw.id ?? '')
  const quantity = Number(raw.quantity ?? raw.quantity_on_hand ?? 0)
  const par =
    raw.low_stock_threshold != null
      ? Number(raw.low_stock_threshold)
      : raw.par_level != null
        ? Number(raw.par_level)
        : undefined

  return {
    id: String(raw.id ?? productId),
    product_id: productId,
    product_name: raw.product_name != null ? String(raw.product_name) : undefined,
    sku: raw.product_sku != null ? String(raw.product_sku) : raw.sku != null ? String(raw.sku) : undefined,
    quantity,
    quantity_on_hand: quantity,
    unit:
      raw.product_unit != null
        ? String(raw.product_unit)
        : raw.unit != null
          ? String(raw.unit)
          : undefined,
    low_stock_threshold: par,
    par_level: par,
    category:
      raw.product_category != null
        ? String(raw.product_category)
        : raw.product_category_legacy != null
          ? String(raw.product_category_legacy)
          : raw.category != null
            ? String(raw.category)
            : undefined,
    updated_at: raw.updated_at != null ? String(raw.updated_at) : undefined,
  }
}

function normalizeExpirySummary(raw: Record<string, unknown>): ExpirySummary {
  const summary = (raw.summary ?? raw) as Record<string, unknown>
  return {
    expiringSoon: Number(summary.expiringSoonCount ?? summary.expiringSoon ?? 0),
    expired: Number(summary.expiredCount ?? summary.expired ?? 0),
    totalLots: summary.totalLots != null ? Number(summary.totalLots) : undefined,
    expiringSoonCount:
      summary.expiringSoonCount != null ? Number(summary.expiringSoonCount) : undefined,
    expiredCount: summary.expiredCount != null ? Number(summary.expiredCount) : undefined,
  }
}

export function useRestaurantInventory() {
  return useQuery({
    queryKey: queryKeys.inventory,
    queryFn: async () => {
      const data = await api.get<{ items?: unknown[]; inventory?: unknown[] }>(
        '/api/restaurant-inventory'
      )
      const rows = (data.items ?? data.inventory ?? []) as Record<string, unknown>[]
      return rows.map(normalizeInventoryItem)
    },
  })
}

export function useExpirySummary() {
  return useQuery({
    queryKey: queryKeys.expirySummary,
    queryFn: async () => {
      const data = await api.get<Record<string, unknown>>('/api/restaurant-inventory/expiry/summary')
      return normalizeExpirySummary(data)
    },
  })
}

function invalidateInventory(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: queryKeys.inventory })
  void qc.invalidateQueries({ queryKey: queryKeys.expirySummary })
}

export function useAddRestaurantInventory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: AddInventoryBody) =>
      api.post<{ message?: string }>('/api/restaurant-inventory/add', body),
    onSuccess: () => invalidateInventory(qc),
  })
}

export function useAdjustRestaurantInventory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: AdjustInventoryBody) =>
      api.post<{ adjustment?: unknown }>('/api/restaurant-inventory/adjust', body),
    onSuccess: () => invalidateInventory(qc),
  })
}

export function usePatchRestaurantInventory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ productId, ...body }: PatchInventoryBody) =>
      api.patch<{ inventory?: RestaurantInventoryItem }>(
        `/api/restaurant-inventory/${productId}`,
        body
      ),
    onSuccess: () => invalidateInventory(qc),
  })
}
