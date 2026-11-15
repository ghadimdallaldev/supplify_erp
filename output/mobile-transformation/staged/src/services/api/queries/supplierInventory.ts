import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SupplierInventoryItem, UpdateSupplierInventoryBody } from '../../../types/supplierInventory'
import { api } from '../client'
import { queryKeys } from './keys'

function normalizeSupplierInventoryItem(raw: Record<string, unknown>): SupplierInventoryItem {
  const productId = String(raw.product_id ?? raw.id ?? '')
  return {
    id: String(raw.id ?? productId),
    product_id: productId,
    product_name: raw.product_name != null ? String(raw.product_name) : undefined,
    sku: raw.sku != null ? String(raw.sku) : undefined,
    available_qty: Number(raw.available_qty ?? 0),
    reserved_qty: raw.reserved_qty != null ? Number(raw.reserved_qty) : undefined,
    low_stock_threshold:
      raw.low_stock_threshold != null ? Number(raw.low_stock_threshold) : undefined,
    isLowStock: raw.isLowStock != null ? Boolean(raw.isLowStock) : undefined,
    isOutOfStock: raw.isOutOfStock != null ? Boolean(raw.isOutOfStock) : undefined,
    isInStock: raw.isInStock != null ? Boolean(raw.isInStock) : undefined,
    stockStatus: raw.stockStatus != null ? String(raw.stockStatus) : undefined,
    updated_at: raw.updated_at != null ? String(raw.updated_at) : undefined,
  }
}

export function useSupplierInventoryList(enabled = true) {
  return useQuery({
    queryKey: queryKeys.supplierInventory,
    queryFn: async () => {
      const data = await api.get<{ inventory?: unknown[] }>('/api/inventory')
      const rows = (data.inventory ?? []) as Record<string, unknown>[]
      return rows.map(normalizeSupplierInventoryItem)
    },
    enabled,
  })
}

export function useUpdateSupplierInventory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ productId, availableQty }: UpdateSupplierInventoryBody) =>
      api.patch<{ inventory?: SupplierInventoryItem }>(`/api/inventory/product/${productId}`, {
        availableQty,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.supplierInventory })
    },
  })
}
