import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  Order,
  OrdersResponse,
  OrderTrackingResponse,
  NotificationItem,
} from '../../../types/supplify'
import type {
  OrderAmendment,
  PresignedUrlResponse,
} from '../../../types/orders-ext'
import { api } from '../client'
import { queryKeys, qs } from './keys'
import type { CheckoutPayload } from '../../../types/checkout'

export function useOrders(params?: Record<string, string>, enabled = true) {
  return useQuery({
    queryKey: queryKeys.orders(params),
    queryFn: () => api.get<OrdersResponse>(`/api/orders${qs(params)}`),
    enabled,
  })
}

/** GET /api/orders/:id returns `{ order }`, not the order itself. */
export function unwrapOrderDetail(data: { order?: Order | null } | null | undefined): Order {
  const order = data?.order
  if (!order || typeof order.id !== 'string' || !order.id) {
    throw new Error('Order not found')
  }
  return order
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: queryKeys.order(id),
    queryFn: async () => unwrapOrderDetail(await api.get<{ order: Order }>(`/api/orders/${id}`)),
    enabled: Boolean(id),
  })
}

export function useOrderAmendments(orderId: string) {
  return useQuery({
    queryKey: ['orders', orderId, 'amendments'],
    queryFn: () =>
      api.get<{ amendments: OrderAmendment[] }>(`/api/orders/${orderId}/amendments`),
    enabled: Boolean(orderId),
  })
}

export function useReportOrderShortage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      orderId,
      orderItemId,
      orderedQuantity,
    }: {
      orderId: string
      orderItemId: string
      orderedQuantity: number
    }) =>
      api.post(`/api/supplier-ops/orders/${orderId}/fulfillment-issues/shortage`, {
        orderItemId,
        shortageQuantity: orderedQuantity,
        availableQuantity: 0,
      }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.order(variables.orderId) })
      qc.invalidateQueries({ queryKey: ['orders', variables.orderId, 'amendments'] })
    },
  })
}

export function useOrderTracking(id: string, pollMs?: number) {
  return useQuery({
    queryKey: queryKeys.tracking(id),
    queryFn: () => api.get<OrderTrackingResponse>(`/api/orders/${id}/tracking`),
    enabled: Boolean(id),
    refetchInterval: pollMs,
  })
}

export function useNotifications(enabled = true) {
  return useQuery({
    queryKey: queryKeys.notifications,
    queryFn: async () => {
      type NotificationRow = NotificationItem & {
        message?: string
        is_read?: boolean
        notification_type?: string
      }
      const data = await api.get<{ notifications: NotificationRow[] }>(
        '/api/notifications?limit=50'
      )
      return (data.notifications ?? []).map((row) => ({
        ...row,
        body: row.body ?? row.message,
        read: row.read ?? Boolean(row.is_read),
        type: row.type ?? row.notification_type,
      }))
    },
    enabled,
    refetchInterval: 30_000,
    refetchOnMount: 'always',
  })
}

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post(`/api/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.notifications }),
  })
}

export function useCreateOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CheckoutPayload & { idempotencyKey?: string }) => {
      const { idempotencyKey, ...payload } = body
      return api.post<Order[]>(
        '/api/orders',
        payload,
        true,
        idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined
      )
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  })
}

export function useUpdateOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; status?: string; notes?: string }) =>
      api.patch<Order>(`/api/orders/${id}`, body),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: queryKeys.order(v.id) })
      qc.invalidateQueries({ queryKey: ['orders'] })
    },
  })
}

export function usePresignPod() {
  return useMutation({
    mutationFn: ({
      orderId,
      fileName,
      fileType,
      fileSize,
    }: {
      orderId: string
      fileName: string
      fileType: string
      fileSize?: number
    }) =>
      api.post<PresignedUrlResponse>(`/api/orders/${orderId}/proof-of-delivery/presign`, {
        fileName,
        fileType,
        fileSize,
      }),
  })
}

export function useSubmitPod() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      orderId,
      recipient_name,
      notes,
      file_key,
      signature_file_key,
      latitude,
      longitude,
    }: {
      orderId: string
      recipient_name?: string
      notes?: string
      file_key?: string
      signature_file_key?: string
      latitude?: number
      longitude?: number
    }) =>
      api.post(`/api/orders/${orderId}/proof-of-delivery`, {
        recipient_name,
        notes,
        file_key,
        signature_file_key,
        latitude,
        longitude,
      }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: queryKeys.order(v.orderId) })
      qc.invalidateQueries({ queryKey: queryKeys.driverBoard })
    },
  })
}

export function useAssignDriver() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      orderId,
      driver_id,
      warehouse_assignment_id,
    }: {
      orderId: string
      driver_id: string
      warehouse_assignment_id?: string | null
    }) =>
      api.post(`/api/orders/${orderId}/assign-driver`, { driver_id, warehouse_assignment_id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.dispatch })
      qc.invalidateQueries({ queryKey: ['orders'] })
    },
  })
}

export function useReassignDriver() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      orderId,
      driver_id,
      reason,
      driver_assignment_id,
      warehouse_assignment_id,
    }: {
      orderId: string
      driver_id: string
      reason?: string
      driver_assignment_id?: string | null
      warehouse_assignment_id?: string | null
    }) =>
      api.post(`/api/orders/${orderId}/reassign-driver`, {
        driver_id,
        reason,
        driver_assignment_id,
        warehouse_assignment_id,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.dispatch })
      qc.invalidateQueries({ queryKey: ['orders'] })
    },
  })
}

export function useRolloverAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (assignmentId: string) =>
      api.post(`/api/fulfillment/assignments/${assignmentId}/rollover-to-tomorrow`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.dispatch }),
  })
}
