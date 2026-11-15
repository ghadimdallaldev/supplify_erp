import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { SupplierDeliveryBoard, DeliveryRouteDetail, DriverDeliveryDetail } from '../../../types/supplify'
import type { SupplierRunSheetResponse } from '../../../types/runSheet'
import { api } from '../client'
import { queryKeys, qs } from './keys'

export function useDriverBoard() {
  return useQuery({
    queryKey: queryKeys.driverBoard,
    queryFn: () => api.get<SupplierDeliveryBoard>('/api/supplier/deliveries/board'),
    refetchInterval: 60_000,
  })
}

export function useDriverDetail(orderId: string) {
  return useQuery({
    queryKey: queryKeys.driverDetail(orderId),
    queryFn: () => api.get<DriverDeliveryDetail>(`/api/orders/${orderId}/driver-detail`),
    enabled: Boolean(orderId),
  })
}
export function useDriverActiveRoute() {
  return useQuery({
    queryKey: queryKeys.driverRoute,
    queryFn: async () => {
      try {
        return await api.get<{ route: DeliveryRouteDetail | null }>('/api/fulfillment/routes/active')
      } catch {
        return { route: null }
      }
    },
  })
}

export function useRetryFailedDelivery() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { orderId: string; source_driver_assignment_id: string; driver_id: string; warehouse_id?: string; reason: string }) => api.post(`/api/orders/${body.orderId}/delivery-retry`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.driverBoard }); qc.invalidateQueries({ queryKey: queryKeys.driverRoute }) },
  })
}
export function useUpdateDeliveryStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      orderId,
      status,
      notes,
      failure_reason,
      driver_assignment_id,
      warehouse_assignment_id,
    }: {
      orderId: string
      status: string
      notes?: string
      failure_reason?: string
      driver_assignment_id?: string
      warehouse_assignment_id?: string
    }) =>
      api.patch(`/api/orders/${orderId}/delivery-status`, {
        status,
        notes,
        failure_reason,
        driver_assignment_id,
        warehouse_assignment_id,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.driverBoard })
      qc.invalidateQueries({ queryKey: queryKeys.driverRoute })
    },
  })
}

export function useSendDriverLocation() {
  return useMutation({
    mutationFn: ({
      orderId,
      latitude,
      longitude,
      accuracyMeters,
      recordedAt,
    }: {
      orderId: string
      latitude: number
      longitude: number
      accuracyMeters?: number
      recordedAt?: string
    }) =>
      api.post(`/api/orders/${orderId}/location`, {
        latitude,
        longitude,
        accuracyMeters,
        recordedAt,
      }),
  })
}

export function useBuildDriverRoute() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post('/api/fulfillment/routes/build-from-assignments', {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.driverRoute })
      qc.invalidateQueries({ queryKey: queryKeys.driverBoard })
    },
  })
}

export function useReorderRouteStops() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ routeId, stop_ids }: { routeId: string; stop_ids: string[] }) =>
      api.patch(`/api/fulfillment/routes/${routeId}/stops/reorder`, { stop_ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.driverRoute }),
  })
}

export function useSetNextStop() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ routeId, orderId }: { routeId: string; orderId: string }) =>
      api.patch(`/api/fulfillment/routes/${routeId}/next-stop`, { order_id: orderId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.driverRoute }),
  })
}

export function useOptimizeRoute() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ routeId, apply }: { routeId: string; apply?: boolean }) =>
      api.post<{ savedKm?: number; applied?: boolean }>(
        `/api/fulfillment/routes/${routeId}/optimize`,
        { apply: apply ?? false }
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.driverRoute }),
  })
}

export function useRunSheet(date?: string) {
  return useQuery({
    queryKey: queryKeys.runSheet(date),
    queryFn: () => api.get<SupplierRunSheetResponse>(`/api/supplier/run-sheet${qs({ date })}`),
  })
}

/** Captures the final proof and transitions its exact assigned delivery leg atomically. */
export function useCompleteDelivery() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      orderId,
      recipient_name,
      notes,
      file_key,
      signature_file_key,
      driver_assignment_id,
      warehouse_assignment_id,
      latitude,
      longitude,
    }: {
      orderId: string
      recipient_name?: string
      notes?: string
      file_key?: string
      signature_file_key?: string
      driver_assignment_id?: string
      warehouse_assignment_id?: string
      latitude?: number
      longitude?: number
    }) =>
      api.post<{ proof: unknown; assignment: unknown }>(`/api/orders/${orderId}/complete-delivery`, {
        recipient_name,
        notes,
        file_key,
        signature_file_key,
        driver_assignment_id,
        warehouse_assignment_id,
        latitude,
        longitude,
      }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.order(variables.orderId) })
      qc.invalidateQueries({ queryKey: queryKeys.driverDetail(variables.orderId) })
      qc.invalidateQueries({ queryKey: queryKeys.driverBoard })
      qc.invalidateQueries({ queryKey: queryKeys.driverRoute })
    },
  })
}
