import { api } from '../base'
import type { LegalAcceptancePayload } from '../../../lib/legalDocuments'
import type {
  User,
  Product,
  CreateProductRequest,
  UpdateProductRequest,
  ProductFilters,
  ProductsResponse,
  Order,
  CreateOrderRequest,
  CreateManualOrderRequest,
  UpdateOrderRequest,
  OrderFilters,
  OrdersResponse,
  Supplier,
  SupplierFilters,
  SuppliersResponse,
  Restaurant,
  RestaurantFilters,
  RestaurantsResponse,
  Price,
  CreatePriceRequest,
  Inventory,
  UpdateInventoryRequest,
  AuditLogFilters,
  AuditLogsResponse,
  PresignedUrlRequest,
  PresignedUrlResponse,
  AttachFileRequest,
  Attachment,
  ReorderSuggestionsResponse,
  ReorderAssistanceItem,
  SubscriptionPlan,
  Subscription,
  Entitlements,
  AdminFeatureFlag,
  EffectiveFeature,
  SubscriptionPlanChangePreview,
  BillingStatus,
  BillingPaymentMethod,
  UsageMeter,
  PublicRestaurant,
  PublicSupplier,
  PublicSupplierProductsResponse,
  QuoteRequestSummary,
  QuoteRequestDetail,
  SupplierQuoteInboxEntry,
  SupplierQuoteRequestDetail,
  QuoteCartPayload,
  PublicAvailabilityResponse,
  PublicReservationSummary,
  StaffPortalSession,
  StaffPortalDashboard,
  StaffPtoRequest,
  StaffShiftSwap,
  StaffTimeEntry,
  PublicReservationDetails,
  DispatchOrderCard,
  DeliveryRouteSummary,
  DeliveryRouteDetail,
  OrderTrackingResponse,
  AdminUserPreferences,
} from '../../../types'
import {
  normalizeAdminPlanUpdateResult,
  type AdminPlanUpdateResult,
} from '../../../lib/adminPlanSaveFeedback'
import { normalizeListResponse } from '../../../lib/apiError'
import {
  normalizeContractPricingList,
  normalizeContractPricingRecord,
  normalizeMyContractPricing,
  normalizeResolvedContractPrices,
} from '../../../lib/contractPricingResponse'
import { normalizeReportResponse } from '../../../lib/reportResponse'
import { resolveUpgradeUrl } from '../../../lib/externallyControlledFeatures'

type OrderDetailCache = { order: Order } | Order

function patchOrderStatusInDetailCache(draft: OrderDetailCache, status: string) {
  if (draft && typeof draft === 'object' && 'order' in draft && draft.order) {
    draft.order.status = status as Order['status']
    return
  }
  if (draft && typeof draft === 'object') {
    ;(draft as Order).status = status as Order['status']
  }
}

function mergeOrderIntoDetailCache(draft: OrderDetailCache, updated: unknown) {
  const order =
    updated && typeof updated === 'object' && 'order' in updated
      ? (updated as { order: Order }).order
      : (updated as Order)
  if (!order) return
  if (draft && typeof draft === 'object' && 'order' in draft && draft.order) {
    Object.assign(draft.order, order)
    return
  }
  if (draft && typeof draft === 'object') {
    Object.assign(draft as Order, order)
  }
}

export const ordersApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getOrders: builder.query<OrdersResponse, OrderFilters>({
      query: (params) => ({
        url: '/api/orders',
        params,
      }),
      providesTags: ['Order'],
    }),
    getOrder: builder.query<Order, string>({
      query: (id) => `/api/orders/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Order', id }],
    }),
    createOrder: builder.mutation<Order, CreateOrderRequest>({
      query: (body) => ({
        url: '/api/orders',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Order'],
    }),
    createManualOrder: builder.mutation<Order, CreateManualOrderRequest>({
      query: (body) => ({
        url: '/api/orders/manual',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Order'],
    }),
    updateOrder: builder.mutation<Order, { id: string; data: UpdateOrderRequest }>({
      query: ({ id, data }) => ({
        url: `/api/orders/${id}`,
        method: 'PATCH',
        body: data,
      }),
      async onQueryStarted({ id, data }, { dispatch, queryFulfilled, getState }) {
        if (data?.status == null) return
        const patchResults = [
          dispatch(
            (api.util.updateQueryData as any)('getOrder', id, (draft: OrderDetailCache) => {
              patchOrderStatusInDetailCache(draft, data.status!)
            })
          ),
        ]
        const cachedListArgs = (api.util.selectCachedArgsForQuery as any)(getState(), 'getOrders')
        for (const args of cachedListArgs) {
          patchResults.push(
            dispatch(
              (api.util.updateQueryData as any)('getOrders', args, (draft: OrdersResponse) => {
                const order = draft.orders?.find((entry) => entry.id === id)
                if (order) order.status = data.status! as Order['status']
              })
            )
          )
        }
        try {
          const { data: updated } = await queryFulfilled
          dispatch(
            (api.util.updateQueryData as any)('getOrder', id, (draft: OrderDetailCache) => {
              mergeOrderIntoDetailCache(draft, updated)
            })
          )
        } catch {
          patchResults.forEach((patch) => patch.undo())
        }
      },
      invalidatesTags: (_result, _error, { id, data }) => {
        const tags: Array<{ type: 'Order'; id: string } | 'Order' | 'Receiving' | 'Fulfillment'> = [
          { type: 'Order', id },
          'Order',
        ]
        if (data?.status === 'COMPLETED') {
          tags.push('Receiving')
        }
        if (data?.delivery_status) {
          tags.push('Fulfillment')
        }
        return tags
      },
    }),
    sendOrderReminder: builder.mutation<{ order: Order; message: string }, string>({
      query: (id) => ({
        url: `/api/orders/${id}/remind`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, id) => [{ type: 'Order', id }, 'Order', 'Notification'],
    }),

    getFulfillmentBoard: builder.query<
      {
        drivers: Array<{
          id: string
          name: string
          phone?: string | null
          vehicle?: string | null
          status: string
          activeRoute?: unknown
        }>
        routes: Array<unknown>
        unassignedOrders: Array<{
          id: string
          status: string
          total_amount: number
          created_at: string
          restaurant_name: string
          item_count: number
        }>
        stats: { pending: number; outForDelivery: number; deliveredToday: number }
      },
      { warehouseId?: string } | void
    >({
      query: (arg) => {
        const id = arg && typeof arg === 'object' ? arg.warehouseId : undefined
        const qs = id ? `?warehouse_id=${encodeURIComponent(id)}` : ''
        return `/api/fulfillment/board${qs}`
      },
      providesTags: ['Fulfillment'],
    }),
    getFulfillmentDispatch: builder.query<
      {
        pending: DispatchOrderCard[]
        assigned: DispatchOrderCard[]
        out_for_delivery: DispatchOrderCard[]
        delivered_today: DispatchOrderCard[]
        stats: {
          pending: number
          assigned: number
          outForDelivery: number
          deliveredToday: number
        }
      },
      { warehouseId?: string } | void
    >({
      query: (arg) => {
        const id = arg && typeof arg === 'object' ? arg.warehouseId : undefined
        const qs = id ? `?warehouse_id=${encodeURIComponent(id)}` : ''
        return `/api/fulfillment/dispatch${qs}`
      },
      providesTags: ['Fulfillment'],
    }),
    getUnlinkedDrivers: builder.query<
      {
        drivers: Array<{
          id: string
          full_name: string
          phone?: string | null
          vehicle_type?: string | null
          is_active?: boolean
        }>
      },
      void
    >({
      query: () => '/api/drivers/unlinked',
      providesTags: ['Driver'],
    }),
    getDrivers: builder.query<
      {
        drivers: Array<{
          id: string
          fullName: string
          phone?: string | null
          vehicleType?: string | null
          vehiclePlate?: string | null
          warehouseId?: string | null
          warehouseName?: string | null
          isActive: boolean
          notes?: string | null
        }>
      },
      { warehouseId?: string; active?: boolean } | void
    >({
      query: (arg) => {
        const params = new URLSearchParams()
        if (arg && typeof arg === 'object') {
          if (arg.warehouseId) params.set('warehouse_id', arg.warehouseId)
          if (arg.active === false) params.set('active', 'false')
        }
        const qs = params.toString()
        return `/api/drivers${qs ? `?${qs}` : ''}`
      },
      providesTags: ['Driver'],
    }),
    createDriver: builder.mutation<
      { driver: { id: string; fullName: string } },
      {
        full_name: string
        phone?: string
        vehicle_type?: string
        vehicle_plate?: string
        warehouse_id?: string
        notes?: string
        user_id?: string | null
      }
    >({
      query: (body) => ({ url: '/api/drivers', method: 'POST', body }),
      invalidatesTags: ['Driver', 'Fulfillment'],
    }),
    updateDriver: builder.mutation<
      { driver: { id: string } },
      {
        id: string
        data: Partial<{
          full_name: string
          phone: string
          vehicle_type: string
          vehicle_plate: string
          warehouse_id: string
          notes: string
          is_active: boolean
          user_id?: string | null
        }>
      }
    >({
      query: ({ id, data }) => ({ url: `/api/drivers/${id}`, method: 'PATCH', body: data }),
      invalidatesTags: ['Driver', 'Fulfillment'],
    }),
    deactivateDriver: builder.mutation<{ driver: { id: string } }, string>({
      query: (id) => ({ url: `/api/drivers/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Driver', 'Fulfillment'],
    }),
    assignDriverToOrder: builder.mutation<
      { assignment: unknown },
      { orderId: string; driver_id: string }
    >({
      query: ({ orderId, driver_id }) => ({
        url: `/api/orders/${orderId}/assign-driver`,
        method: 'POST',
        body: { driver_id },
      }),
      invalidatesTags: ['Fulfillment', 'Order'],
    }),
    reassignDriverOnOrder: builder.mutation<
      { assignment: unknown },
      { orderId: string; driver_id: string; reason?: string }
    >({
      query: ({ orderId, driver_id, reason }) => ({
        url: `/api/orders/${orderId}/reassign-driver`,
        method: 'POST',
        body: { driver_id, reason },
      }),
      invalidatesTags: ['Fulfillment', 'Order'],
    }),
    submitOrderProofOfDelivery: builder.mutation<
      { proof: unknown },
      {
        orderId: string
        recipient_name?: string
        notes?: string
        file_key?: string
        latitude?: number
        longitude?: number
      }
    >({
      query: ({ orderId, ...body }) => ({
        url: `/api/orders/${orderId}/proof-of-delivery`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Fulfillment', 'Order'],
    }),
    resolveFulfillmentException: builder.mutation<
      { exception: unknown },
      { id: string; resolution_notes?: string }
    >({
      query: ({ id, resolution_notes }) => ({
        url: `/api/fulfillment/exceptions/${id}/resolve`,
        method: 'POST',
        body: { resolution_notes },
      }),
      invalidatesTags: ['Fulfillment'],
    }),
    ignoreFulfillmentException: builder.mutation<{ exception: unknown }, string>({
      query: (id) => ({
        url: `/api/fulfillment/exceptions/${id}/ignore`,
        method: 'POST',
      }),
      invalidatesTags: ['Fulfillment'],
    }),
    getFulfillmentRoutes: builder.query<{ routes: DeliveryRouteSummary[] }, void>({
      query: () => '/api/fulfillment/routes',
      providesTags: ['Fulfillment'],
    }),
    getFulfillmentRoute: builder.query<{ route: DeliveryRouteDetail }, string>({
      query: (id) => `/api/fulfillment/routes/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'Fulfillment', id }],
    }),
    getDriverActiveRoute: builder.query<{ route: DeliveryRouteDetail | null }, void>({
      query: () => '/api/fulfillment/routes/active',
      providesTags: ['Fulfillment'],
    }),
    buildDriverRouteFromAssignments: builder.mutation<
      { route: DeliveryRouteDetail },
      { date?: string } | void
    >({
      query: (body) => ({
        url: '/api/fulfillment/routes/build-from-assignments',
        method: 'POST',
        body: body ?? {},
      }),
      invalidatesTags: ['Fulfillment', 'Order'],
    }),
    createFulfillmentRoute: builder.mutation<
      { route: DeliveryRouteDetail },
      {
        order_ids: string[]
        driver_id: string
        scheduled_date: string
        route_label?: string
        area?: string
      }
    >({
      query: (body) => ({
        url: '/api/fulfillment/routes',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Fulfillment', 'Order'],
    }),
    updateFulfillmentRoute: builder.mutation<
      { route: DeliveryRouteDetail },
      {
        id: string
        route_label?: string
        area?: string
        scheduled_date?: string
        driver_id?: string
        status?: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
      }
    >({
      query: ({ id, ...body }) => ({
        url: `/api/fulfillment/routes/${id}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Fulfillment', 'Order'],
    }),
    cancelFulfillmentRoute: builder.mutation<{ route: DeliveryRouteDetail }, string>({
      query: (id) => ({
        url: `/api/fulfillment/routes/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Fulfillment', 'Order'],
    }),
    reorderFulfillmentRouteStops: builder.mutation<
      { route: DeliveryRouteDetail },
      { routeId: string; stop_ids: string[] }
    >({
      query: ({ routeId, stop_ids }) => ({
        url: `/api/fulfillment/routes/${routeId}/stops/reorder`,
        method: 'POST',
        body: { stop_ids },
      }),
      invalidatesTags: ['Fulfillment', 'Order'],
    }),
    setNextFulfillmentRouteStop: builder.mutation<
      { route: DeliveryRouteDetail },
      { routeId: string; orderId: string }
    >({
      query: ({ routeId, orderId }) => ({
        url: `/api/fulfillment/routes/${routeId}/next-stop`,
        method: 'PATCH',
        body: { orderId },
      }),
      invalidatesTags: ['Fulfillment', 'Order'],
    }),
    updateFulfillmentRouteStop: builder.mutation<
      { route: DeliveryRouteDetail },
      {
        routeId: string
        stopId: string
        status?: 'PLANNED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED'
        notes?: string
        failure_reason?: string
      }
    >({
      query: ({ routeId, stopId, ...body }) => ({
        url: `/api/fulfillment/routes/${routeId}/stops/${stopId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Fulfillment', 'Order'],
    }),
    getFulfillmentExceptions: builder.query<
      {
        openCount?: number
        exceptions: Array<{
          id: string
          orderId: string
          orderLabel: string
          exceptionType: string
          status?: string
          restaurantName?: string | null
          description?: string | null
          resolutionNotes?: string | null
          productName?: string | null
          quantityExpected?: number | null
          quantityActual?: number | null
          damageDescription?: string | null
          notes?: string | null
          createdAt: string
          resolvedAt?: string | null
        }>
      },
      { warehouseId?: string; status?: string; type?: string } | void
    >({
      query: (arg) => {
        const params = new URLSearchParams()
        if (arg && typeof arg === 'object') {
          if (arg.warehouseId) params.set('warehouse_id', arg.warehouseId)
          if (arg.status) params.set('status', arg.status)
          if (arg.type) params.set('type', arg.type)
        }
        const qs = params.toString() ? `?${params.toString()}` : ''
        return `/api/fulfillment/exceptions${qs}`
      },
      providesTags: ['Fulfillment'],
    }),
    updateOrderDeliveryStatus: builder.mutation<
      { assignment: unknown },
      {
        orderId: string
        status: 'picked_up' | 'out_for_delivery' | 'delivered' | 'failed' | 'rescheduled'
        notes?: string
        failure_reason?: string
      }
    >({
      query: ({ orderId, status, notes, failure_reason }) => ({
        url: `/api/orders/${orderId}/delivery-status`,
        method: 'PATCH',
        body: { status, notes, failure_reason },
      }),
      invalidatesTags: ['Fulfillment', 'Order'],
    }),
    rolloverAssignmentToTomorrow: builder.mutation<
      { ok: boolean; data: Record<string, unknown> },
      { assignmentId: string; notify_restaurant?: boolean }
    >({
      query: ({ assignmentId, notify_restaurant }) => ({
        url: `/api/fulfillment/assignments/${assignmentId}/rollover-to-tomorrow`,
        method: 'POST',
        body: notify_restaurant ? { notify_restaurant: true } : {},
      }),
      invalidatesTags: ['Fulfillment', 'Order'],
    }),
    sendDriverLocation: builder.mutation<
      {
        trackingEnabled: boolean
        stored?: boolean
        latestLocation?: {
          latitude: number
          longitude: number
          recordedAt: string
        } | null
      },
      {
        orderId: string
        latitude: number
        longitude: number
        accuracyMeters?: number
        speedMps?: number
        headingDegrees?: number
        recordedAt?: string
      }
    >({
      query: ({ orderId, ...body }) => ({
        url: `/api/orders/${orderId}/location`,
        method: 'POST',
        body: {
          latitude: body.latitude,
          longitude: body.longitude,
          accuracyMeters: body.accuracyMeters,
          speedMps: body.speedMps,
          headingDegrees: body.headingDegrees,
          recordedAt: body.recordedAt,
        },
      }),
    }),
    getOrderTracking: builder.query<OrderTrackingResponse, string>({
      query: (orderId) => `/api/orders/${orderId}/tracking`,
      providesTags: (_r, _e, orderId) => [{ type: 'Order', id: orderId }],
    }),
  }),
})
