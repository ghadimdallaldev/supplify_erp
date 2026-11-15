import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SupplierWarehouse } from '../../../types/supplierSettings'
import { api } from '../client'
import { queryKeys } from './keys'

export function useSupplierWarehouses(enabled = true) {
  return useQuery({
    queryKey: queryKeys.supplierWarehouses,
    queryFn: () => api.get<{ warehouses: SupplierWarehouse[] }>('/api/warehouses'),
    enabled,
  })
}

export type SupplierWarehouseAssignment = {
  id: string
  order_id: string
  order_item_id?: string | null
  warehouse_id: string
  status: string
  assignment_source?: 'automatic' | 'manual' | 'legacy' | string
  assignment_reason?: Record<string, unknown> | null
  version?: number
}

export function useOrderWarehouseAssignments(orderId: string, enabled = true) {
  return useQuery({
    queryKey: ['supplier', 'order-warehouses', orderId],
    queryFn: () =>
      api.get<{
        assignments: SupplierWarehouseAssignment[]
        multiLocation: boolean
      }>(`/api/orders/${orderId}/warehouses`),
    enabled: Boolean(orderId) && enabled,
  })
}

export function useReassignOrderWarehouse() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      orderId,
      assignmentId,
      warehouseId,
      reason,
    }: {
      orderId: string
      assignmentId: string
      warehouseId: string
      reason: string
    }) =>
      api.patch<{ assignment: SupplierWarehouseAssignment }>(
        `/api/orders/${orderId}/warehouses/${assignmentId}`,
        { warehouse_id: warehouseId, reason }
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['supplier', 'order-warehouses', variables.orderId],
      })
      void queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
  })
}
