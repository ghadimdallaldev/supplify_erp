import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import {
  normalizeAdminPlanUpdateResult,
  type AdminPlanUpdateResult,
} from '../lib/adminPlanSaveFeedback'
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
  PublicAvailabilityResponse,
  PublicReservationSummary,
  StaffPortalSession,
  StaffPortalDashboard,
  StaffPtoRequest,
  StaffShiftSwap,
  StaffTimeEntry,
  PublicReservationDetails,
  DriverRecord,
  DispatchOrderCard,
} from '../types'

const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? '' : 'http://localhost:4000')

type ApiErrorBody = { error?: { name?: string; message?: string } }

function requestPath(args: unknown): string {
  if (typeof args === 'string') return args
  if (args && typeof args === 'object' && 'url' in args) {
    return String((args as { url: string }).url)
  }
  return ''
}

/** True when the user had a session that is no longer valid (not merely "never logged in"). */
function isSessionExpiredAuthError(error: ApiErrorBody['error']): boolean {
  if (!error?.name) return false
  if (error.name === 'JWT_EXPIRED') return true
  if (error.name !== 'UNAUTHORIZED') return false
  const msg = (error.message || '').toLowerCase()
  return msg.includes('expired') || msg.includes('refresh failed') || msg.includes('invalid token')
}

function redirectToLoginForAuthError(error: ApiErrorBody['error'], requestUrl: string): void {
  if (typeof window === 'undefined' || window.location.pathname.includes('/login')) {
    return
  }
  // AuthGuard already sends unauthenticated users to /login without a full reload.
  if (requestUrl === '/auth/me' && !isSessionExpiredAuthError(error)) {
    return
  }
  const suffix = isSessionExpiredAuthError(error) ? '?expired=true' : ''
  window.location.href = `/login${suffix}`
}

// Custom baseQuery to unwrap API response envelope
const baseQueryWithUnwrap = async (args: any, api: any, extraOptions: any) => {
  const result = await fetchBaseQuery({
    baseUrl: API_URL,
    credentials: 'include',
    prepareHeaders: (headers) => {
      headers.set('X-Requested-With', 'Supplify')
      return headers
    },
  })(args, api, extraOptions)

  const requestUrl = requestPath(args)

  // Handle 401 — distinguish "not logged in" from "session expired"
  const err = result.error as { status?: number | string; data?: unknown } | undefined
  if (err?.status === 401) {
    const errorData = err.data
    if (typeof errorData === 'object' && errorData !== null) {
      const apiError = (errorData as ApiErrorBody).error
      if (apiError?.name === 'UNAUTHORIZED' || apiError?.name === 'JWT_EXPIRED') {
        redirectToLoginForAuthError(apiError, requestUrl)
        return { ...result }
      }
    }
  }

  // Unwrap the API response envelope { ok: true/false, data: ..., error: ... }
  const data = result.data as
    | { ok?: boolean; data?: unknown; error?: { name?: string } }
    | undefined
  if (data && typeof data === 'object' && 'ok' in data) {
    if (data.ok) {
      // Return the actual data
      return { ...result, data: data.data }
    } else {
      if (data.error?.name === 'UNAUTHORIZED' || data.error?.name === 'JWT_EXPIRED') {
        redirectToLoginForAuthError(data.error, requestUrl)
      }
      // Dispatch monetization soft-wall when blocked by plan/limit (Phase B)
      const respErr = data.error
      if (respErr?.name === 'ACCOUNT_LOCKED') {
        try {
          const details = (respErr as { details?: { pendingActivation?: boolean } }).details
          if (details?.pendingActivation) {
            if (
              typeof window !== 'undefined' &&
              !window.location.pathname.startsWith('/app/activate')
            ) {
              window.location.href = '/app/activate'
            }
          } else {
            const { openPayOverdueModal } = await import(
              /* @vite-ignore */ '../features/billing/billingSlice'
            )
            api.dispatch(openPayOverdueModal())
          }
        } catch {
          void 0
        }
      }
      if (
        respErr?.name === 'LIMIT_EXCEEDED' ||
        respErr?.name === 'FEATURE_NOT_AVAILABLE' ||
        respErr?.name === 'BRANCH_LIMIT_REACHED'
      ) {
        try {
          const { showMonetizationBlock } = await import(
            /* @vite-ignore */ '../features/monetization/monetizationSlice'
          )
          const details = (respErr as { details?: Record<string, unknown> }).details || {}
          const isLimit =
            respErr.name === 'LIMIT_EXCEEDED' || respErr.name === 'BRANCH_LIMIT_REACHED'
          api.dispatch(
            showMonetizationBlock({
              type: isLimit ? 'limit' : 'feature',
              payload: (isLimit
                ? {
                    limitKey: (details.limitKey as string) || 'branches',
                    limitValue: Number(details.limitValue ?? details.limit ?? 0),
                    currentUsage: Number(details.currentUsage ?? details.current ?? 0),
                    currentPlan: (details.currentPlan as string) ?? null,
                    recommendedPlans: (details.recommendedPlans as string[]) ?? ['Gold'],
                    upgradeUrl: (details.upgradeUrl as string) ?? '/app/settings?tab=subscription',
                  }
                : details) as
                | import('../features/monetization/monetizationSlice').LimitExceededPayload
                | import('../features/monetization/monetizationSlice').FeatureNotAvailablePayload,
            })
          )
        } catch {
          // Ignore dynamic import or dispatch errors for monetization block
          void 0
        }
      }
      return { ...result, error: { status: 'CUSTOM_ERROR', data: respErr } }
    }
  }

  return result
}

export const api = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithUnwrap as any,
  tagTypes: [
    'User',
    'RegisterStatus',
    'Product',
    'Order',
    'Supplier',
    'Restaurant',
    'Price',
    'Inventory',
    'RestaurantInventory',
    'RestaurantWaste',
    'Chat',
    'Receiving',
    'RestaurantFinance',
    'Notification',
    'Branch',
    'BranchInvitations',
    'RestaurantInvitations',
    'RestaurantOrg',
    'Org',
    'RestaurantTeam',
    'Subscription',
    'Billing',
    'Admin',
    'AdminFeatureFlags',
    'AdminTenantFeatures',
    'Reservation',
    'OrdersCalendar',
    'QuickList',
    'Fulfillment',
    'Driver',
    'Reviews',
    'Reports',
    'Disputes',
    'Promotions',
    'Audit',
    'TenantRoles',
    'Amendments',
    'CreditNotes',
    'StaffMember',
    'StaffShift',
    'StaffTimeEntry',
    'StaffPto',
    'StaffAvailability',
    'StaffSwap',
    'StaffAnnouncement',
    'StaffDocument',
    'StaffIncident',
    'StaffPerformance',
    'StaffPayroll',
  ],
  endpoints: (builder) => ({
    // Auth endpoints
    getMe: builder.query<User, void>({
      query: () => '/auth/me',
      providesTags: ['User'],
      // Cache for 5 minutes to reduce requests
      keepUnusedDataFor: 300,
    }),
    getInviteSession: builder.query<
      { id: string; email: string; displayName: string } | null,
      void
    >({
      query: () => '/auth/session',
    }),
    logout: builder.mutation<{ message?: string; keycloakLogoutUrl?: string }, void>({
      query: () => ({
        url: '/auth/logout',
        method: 'POST',
      }),
      invalidatesTags: ['User'],
    }),
    getRegisterStatus: builder.query<{ needsSetup: boolean }, void>({
      query: () => '/api/register/status',
      providesTags: ['RegisterStatus'],
      transformResponse: (response: { data?: { needsSetup?: boolean } }) => ({
        needsSetup: Boolean(response?.data?.needsSetup),
      }),
    }),
    completeRegistration: builder.mutation<
      { tenantType: string; tenant: unknown },
      { accountType: 'RESTAURANT' | 'SUPPLIER'; businessName: string; phone?: string }
    >({
      query: (body) => ({
        url: '/api/register/complete',
        method: 'POST',
        body,
      }),
      transformResponse: (response: { data?: { tenantType: string; tenant: unknown } }) =>
        response.data as { tenantType: string; tenant: unknown },
      invalidatesTags: ['User', 'RegisterStatus', 'Billing', 'Subscription'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled
          await dispatch(api.endpoints.getMe.initiate(undefined, { forceRefetch: true })).unwrap()
        } catch {
          // Leave cache as-is on failure
        }
      },
    }),

    // Product endpoints
    getProducts: builder.query<ProductsResponse, ProductFilters>({
      query: (params) => ({
        url: '/api/products',
        params,
      }),
      providesTags: ['Product'],
    }),
    getProductCategories: builder.query<
      {
        categories: Array<{
          id: string
          name: string
          slug: string
          description?: string
          display_order: number
          product_count?: number
        }>
      },
      void
    >({
      query: () => '/api/products/categories',
      providesTags: ['Product'],
    }),
    getProductTags: builder.query<{ tags: string[] }, void>({
      query: () => '/api/products/tags',
      providesTags: ['Product'],
    }),
    getProduct: builder.query<Product, string>({
      query: (id) => `/api/products/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Product', id }],
    }),
    createProduct: builder.mutation<Product, CreateProductRequest>({
      query: (body) => ({
        url: '/api/products',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Product'],
    }),
    updateProduct: builder.mutation<Product, { id: string; data: UpdateProductRequest }>({
      query: ({ id, data }) => ({
        url: `/api/products/${id}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Product', id }, 'Product'],
    }),

    // Order endpoints
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
      async onQueryStarted({ id, data }, { dispatch, queryFulfilled }) {
        if (data?.status == null) return
        const patchResult = dispatch(
          api.util.updateQueryData('getOrder', id, (draft) => {
            Object.assign(draft, { status: data.status })
          })
        )
        try {
          const { data: updated } = await queryFulfilled
          dispatch(
            api.util.updateQueryData('getOrder', id, (draft) => {
              Object.assign(draft, updated)
            })
          )
        } catch {
          patchResult.undo()
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
    getFulfillmentRoutes: builder.query<
      {
        routes: Array<{
          id: string
          routeNumber: string
          driver: string
          vehicle: string
          status: string
          stops: number
          scheduledDate?: string
        }>
      },
      { warehouseId?: string } | void
    >({
      query: (arg) => {
        const id = arg && typeof arg === 'object' ? arg.warehouseId : undefined
        const qs = id ? `?warehouse_id=${encodeURIComponent(id)}` : ''
        return `/api/fulfillment/routes${qs}`
      },
      providesTags: ['Fulfillment'],
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
        status: 'picked_up' | 'out_for_delivery' | 'delivered' | 'failed'
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

    // Supplier endpoints
    getSuppliers: builder.query<SuppliersResponse, SupplierFilters>({
      query: (params) => ({
        url: '/api/suppliers',
        params,
      }),
      providesTags: ['Supplier'],
    }),
    getSupplier: builder.query<Supplier, string>({
      query: (id) => `/api/suppliers/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Supplier', id }],
    }),
    getSupplierStatistics: builder.query<
      { totalOrders: number; totalSpent: number; averageOrderValue: number },
      string
    >({
      query: (id) => `/api/suppliers/${id}/statistics`,
      providesTags: (_result, _error, id) => [{ type: 'Supplier', id }],
    }),
    followSupplier: builder.mutation<any, string>({
      query: (id) => ({
        url: `/api/suppliers/${id}/follow`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, id) => [
        { type: 'Supplier', id },
        { type: 'Supplier', id: 'LIST' },
        'Subscription',
      ],
    }),
    unfollowSupplier: builder.mutation<any, string>({
      query: (id) => ({
        url: `/api/suppliers/${id}/follow`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, id) => [
        { type: 'Supplier', id },
        { type: 'Supplier', id: 'LIST' },
        'Subscription',
      ],
    }),
    getSupplierMe: builder.query<{ supplier: Supplier }, void>({
      query: () => '/api/suppliers/me',
      providesTags: ['Supplier'],
    }),
    updateSupplier: builder.mutation<Supplier, { id: string; data: Partial<Supplier> }>({
      query: ({ id, data }) => ({
        url: `/api/suppliers/${id}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Supplier', id },
        { type: 'Supplier', id: 'LIST' },
      ],
    }),
    uploadSupplierLogo: builder.mutation<Supplier, { id: string; logoUrl: string }>({
      query: ({ id, logoUrl }) => ({
        url: `/api/suppliers/${id}/logo`,
        method: 'POST',
        body: { logoUrl },
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Supplier', id },
        { type: 'Supplier', id: 'LIST' },
      ],
    }),
    getPresignedUrl: builder.mutation<
      { presignedUrl: string; fileKey: string; fileName: string; fileType: string },
      { fileName: string; fileType: string; fileSize?: number }
    >({
      query: (body) => ({
        url: '/api/files/presign',
        method: 'POST',
        body,
      }),
    }),

    // Restaurant endpoints
    getRestaurants: builder.query<RestaurantsResponse, RestaurantFilters>({
      query: (params) => ({
        url: '/api/restaurants',
        params,
      }),
      providesTags: ['Restaurant'],
    }),
    getRestaurant: builder.query<Restaurant, string>({
      query: (id) => `/api/restaurants/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Restaurant', id }],
    }),
    getRestaurantMe: builder.query<{ restaurant: Restaurant }, void>({
      query: () => '/api/restaurants/me',
      providesTags: ['Restaurant'],
    }),
    updateRestaurant: builder.mutation<Restaurant, { id: string; data: Partial<Restaurant> }>({
      query: ({ id, data }) => ({
        url: `/api/restaurants/${id}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Restaurant', id },
        { type: 'Restaurant', id: 'LIST' },
      ],
    }),
    uploadRestaurantLogo: builder.mutation<Restaurant, { id: string; logoUrl: string }>({
      query: ({ id, logoUrl }) => ({
        url: `/api/restaurants/${id}/logo`,
        method: 'POST',
        body: { logoUrl },
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Restaurant', id },
        { type: 'Restaurant', id: 'LIST' },
      ],
    }),

    // Price endpoints
    getPrices: builder.query<Price[], string>({
      query: (productId) => `/api/prices/product/${productId}`,
      providesTags: ['Price'],
    }),
    createPrice: builder.mutation<Price, CreatePriceRequest>({
      query: (body) => ({
        url: '/api/prices',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Price'],
    }),

    // Inventory endpoints
    getInventoryList: builder.query<{ inventory: any[] }, void>({
      query: () => '/api/inventory',
      providesTags: ['Inventory'],
    }),
    getInventory: builder.query<Inventory, string>({
      query: (productId) => `/api/inventory/product/${productId}`,
      providesTags: ['Inventory'],
    }),
    updateInventory: builder.mutation<
      Inventory,
      { productId: string; data: UpdateInventoryRequest }
    >({
      query: ({ productId, data }) => ({
        url: `/api/inventory/product/${productId}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: ['Inventory'],
    }),
    createInventoryAdjustment: builder.mutation<
      any,
      {
        productId: string
        adjustmentType: 'IN' | 'OUT'
        quantity: number
        reason: string
        notes?: string
      }
    >({
      query: ({ productId, ...body }) => ({
        url: `/api/inventory/product/${productId}/adjustment`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Inventory'],
    }),

    // Warehouse endpoints
    getWarehouses: builder.query<{ warehouses: any[] }, void>({
      query: () => '/api/warehouses',
      providesTags: ['Inventory'],
    }),
    createWarehouse: builder.mutation<
      { warehouse: any },
      {
        name: string
        code?: string
        address?: string
        city?: string
        country?: string
        capacity?: number
        contact_name?: string
        contact_email?: string
        contact_phone?: string
        type?: string
      }
    >({
      query: (body) => ({
        url: '/api/warehouses',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Inventory'],
    }),
    setDefaultWarehouse: builder.mutation<{ warehouse: any }, string>({
      query: (id) => ({ url: `/api/warehouses/${id}/set-default`, method: 'POST' }),
      invalidatesTags: ['Inventory'],
    }),
    getSupplierFulfillment: builder.query<{ fulfillment: any }, void>({
      query: () => '/api/suppliers/me/fulfillment',
    }),
    updateSupplierFulfillment: builder.mutation<
      { fulfillment: any },
      {
        multi_warehouse_enabled?: boolean
        fulfillment_mode?: 'single' | 'multi'
        confirm_disable?: boolean
      }
    >({
      query: (body) => ({ url: '/api/suppliers/me/fulfillment', method: 'PATCH', body }),
      invalidatesTags: ['User'],
    }),
    getWarehouseRoutingRules: builder.query<{ rules: any[] }, void>({
      query: () => '/api/warehouses/routing/rules',
    }),
    simulateWarehouseRouting: builder.mutation<
      { preview: any[] },
      { items: Array<{ productId: string; quantity: number }>; restaurant_id?: string }
    >({
      query: (body) => ({
        url: '/api/warehouses/routing/simulate',
        method: 'POST',
        body: {
          items: body.items.map((i) => ({ product_id: i.productId, quantity: i.quantity })),
          restaurant_id: body.restaurant_id,
        },
      }),
    }),
    getOrderWarehouseAssignments: builder.query<
      { assignments: any[]; multiLocation: boolean },
      string
    >({
      query: (orderId) => `/api/orders/${orderId}/warehouses`,
    }),

    // Admin endpoints
    getDashboardStats: builder.query<any, void>({
      query: () => '/api/admin/dashboard',
      providesTags: ['User'],
      transformResponse: (response: any) => response?.stats || {},
    }),
    getAuditLogs: builder.query<AuditLogsResponse, AuditLogFilters>({
      query: (params) => ({
        url: '/api/admin/audit',
        params,
      }),
      providesTags: ['User'],
    }),

    // File endpoints
    generatePresignedUrl: builder.mutation<PresignedUrlResponse, PresignedUrlRequest>({
      query: (body) => ({
        url: '/api/files/presign',
        method: 'POST',
        body,
      }),
    }),
    attachFileToProduct: builder.mutation<
      Attachment,
      { productId: string; data: AttachFileRequest }
    >({
      query: ({ productId, data }) => ({
        url: `/api/files/product/${productId}/attach`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['Product'],
    }),

    // Chat endpoints
    getConversations: builder.query<any, void>({
      query: () => '/api/chat/conversations',
      providesTags: ['Chat'],
    }),
    getMessages: builder.query<any, { conversationId: string }>({
      query: ({ conversationId }) => `/api/chat/conversations/${conversationId}/messages`,
      providesTags: ['Chat'],
    }),
    createConversation: builder.mutation<any, { supplierId: string }>({
      query: (body) => ({
        url: '/api/chat/conversations',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Chat'],
    }),
    sendMessage: builder.mutation<
      any,
      {
        conversationId: string
        content: string
        messageType?: string
        orderId?: string
        replyTo?: string
        attachments?: Array<{
          fileUrl: string
          fileType: string
          fileName: string
          fileSize?: number
        }>
      }
    >({
      query: ({ conversationId, ...body }) => ({
        url: `/api/chat/conversations/${conversationId}/messages`,
        method: 'POST',
        body,
      }),
      async onQueryStarted({ conversationId, content, ...rest }, { dispatch, queryFulfilled }) {
        const tempId = `opt-${Date.now()}`
        const optimisticMessage = {
          id: tempId,
          content,
          ...rest,
          created_at: new Date().toISOString(),
          isOptimistic: true,
        }
        const patchResult = dispatch(
          api.util.updateQueryData('getMessages', { conversationId }, (draft: any) => {
            if (!draft?.messages) return
            draft.messages = [...(draft.messages || []), optimisticMessage]
          })
        )
        try {
          await queryFulfilled
        } catch {
          patchResult.undo()
        }
      },
      invalidatesTags: ['Chat'],
    }),
    markConversationRead: builder.mutation<any, string>({
      query: (conversationId) => ({
        url: `/api/chat/conversations/${conversationId}/read`,
        method: 'PATCH',
      }),
      invalidatesTags: ['Chat'],
    }),
    markMessageRead: builder.mutation<any, string>({
      query: (messageId) => ({
        url: `/api/chat/messages/${messageId}/read`,
        method: 'PATCH',
      }),
      invalidatesTags: ['Chat'],
    }),
    pinConversation: builder.mutation<any, string>({
      query: (conversationId) => ({
        url: `/api/chat/conversations/${conversationId}/pin`,
        method: 'PATCH',
      }),
      invalidatesTags: ['Chat'],
    }),
    archiveConversation: builder.mutation<any, string>({
      query: (conversationId) => ({
        url: `/api/chat/conversations/${conversationId}/archive`,
        method: 'PATCH',
      }),
      invalidatesTags: ['Chat'],
    }),
    deleteConversation: builder.mutation<any, string>({
      query: (conversationId) => ({
        url: `/api/chat/conversations/${conversationId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Chat'],
    }),

    // Restaurant Inventory endpoints
    getRestaurantInventory: builder.query<any, void>({
      query: () => '/api/restaurant-inventory',
      providesTags: ['RestaurantInventory'],
    }),
    getRestaurantInventoryHistory: builder.query<any, { limit?: number }>({
      query: (params) => ({
        url: '/api/restaurant-inventory/history',
        params,
      }),
      providesTags: ['RestaurantInventory'],
    }),
    addRestaurantInventory: builder.mutation<
      any,
      { productId: string; quantity: number; reason?: string }
    >({
      query: (body) => ({
        url: '/api/restaurant-inventory/add',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['RestaurantInventory'],
    }),
    adjustRestaurantInventory: builder.mutation<
      any,
      {
        productId: string
        adjustmentType: 'WASTAGE' | 'SPOILAGE' | 'COUNT_CORRECTION' | 'OTHER'
        quantity: number
        reason?: string
        unitCost?: number
        wasteCategory?:
          | 'OVER_PRODUCTION'
          | 'SPOILAGE'
          | 'BREAKAGE'
          | 'EXPIRED'
          | 'OVERPORTIONING'
          | 'OTHER'
      }
    >({
      query: (body) => ({
        url: '/api/restaurant-inventory/adjust',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['RestaurantInventory', 'RestaurantWaste'],
    }),
    getRestaurantWasteAnalytics: builder.query<
      {
        analytics: Array<Record<string, unknown>>
        summary: Record<string, unknown>
        trend: Array<Record<string, unknown>>
        period: number
      },
      { period?: number }
    >({
      query: ({ period = 30 } = {}) => ({
        url: '/api/restaurant-inventory/waste-analytics',
        params: { period },
      }),
      providesTags: ['RestaurantWaste'],
    }),
    getReorderSuggestions: builder.query<ReorderSuggestionsResponse, void>({
      query: () => '/api/restaurant-inventory/reorder-suggestions',
      providesTags: ['RestaurantInventory'],
    }),
    // Receiving endpoints
    getPendingOrdersForReceiving: builder.query<any, void>({
      query: () => '/api/receiving/pending-orders',
      providesTags: ['Receiving'],
      ...({ pollingInterval: 15000 } as { pollingInterval?: number }),
    }),
    getReceivingHistory: builder.query<any, void>({
      query: () => '/api/receiving/history',
      providesTags: ['Receiving'],
    }),
    createReceivingReport: builder.mutation<any, any>({
      query: (body) => ({
        url: '/api/receiving/receive',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Receiving', 'RestaurantInventory', 'Order'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled
          // Force immediate refetch of receiving history
          dispatch(api.util.invalidateTags(['Receiving']))
        } catch {
          // Error will be handled by the component
        }
      },
    }),

    // Quick Lists endpoints
    getQuickLists: builder.query<any, void>({
      query: () => '/api/quick-lists',
      providesTags: ['QuickList'],
    }),
    getQuickList: builder.query<any, string>({
      query: (id) => `/api/quick-lists/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'QuickList', id }],
    }),
    createQuickList: builder.mutation<any, any>({
      query: (body) => ({
        url: '/api/quick-lists',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['QuickList'],
    }),
    updateQuickList: builder.mutation<any, { id: string; data: any }>({
      query: ({ id, data }) => ({
        url: `/api/quick-lists/${id}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'QuickList', id }],
    }),
    deleteQuickList: builder.mutation<any, string>({
      query: (id) => ({
        url: `/api/quick-lists/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['QuickList'],
    }),
    addItemToQuickList: builder.mutation<any, { quickListId: string; body: any }>({
      query: ({ quickListId, body }) => ({
        url: `/api/quick-lists/${quickListId}/items`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['QuickList'],
    }),
    removeItemFromQuickList: builder.mutation<any, { quickListId: string; itemId: string }>({
      query: ({ quickListId, itemId }) => ({
        url: `/api/quick-lists/${quickListId}/items/${itemId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['QuickList'],
    }),
    scheduleQuickList: builder.mutation<any, { quickListId: string; body: any }>({
      query: ({ quickListId, body }) => ({
        url: `/api/quick-lists/${quickListId}/schedule`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['QuickList'],
    }),
    unscheduleQuickList: builder.mutation<any, string>({
      query: (quickListId) => ({
        url: `/api/quick-lists/${quickListId}/schedule`,
        method: 'DELETE',
      }),
      invalidatesTags: ['QuickList'],
    }),

    // Restaurant Finance endpoints
    getRestaurantInvoices: builder.query<any, any>({
      query: (params) => ({
        url: '/api/restaurant-finance/invoices',
        params,
      }),
      providesTags: ['RestaurantFinance'],
    }),
    getRestaurantInvoice: builder.query<any, string>({
      query: (id) => `/api/restaurant-finance/invoices/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'RestaurantFinance', id }],
    }),
    // Enhanced payment with partial payment, credits, and HQ support
    markInvoicePaid: builder.mutation<any, { invoiceId: string; data: any }>({
      query: ({ invoiceId, data }) => ({
        url: `/api/restaurant-finance/invoices/${invoiceId}/pay`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (_result, _error, { invoiceId }) => [
        { type: 'RestaurantFinance', id: invoiceId },
        'RestaurantFinance',
        'Order',
      ],
    }),
    getInvoiceCredits: builder.query<any, string>({
      query: (invoiceId) => `/api/restaurant-finance/invoices/${invoiceId}/credits`,
      providesTags: ['RestaurantFinance'],
    }),
    getInvoiceAnalytics: builder.query<any, { period?: number }>({
      query: ({ period = 30 }) => ({
        url: '/api/restaurant-finance/invoices/analytics',
        params: { period },
      }),
      providesTags: ['RestaurantFinance'],
    }),
    getOrderInvoices: builder.query<any, string>({
      query: (orderId) => `/api/restaurant-finance/orders/${orderId}/invoices`,
      providesTags: (_result, _error, orderId) => [
        { type: 'Order', id: orderId },
        'RestaurantFinance',
      ],
    }),
    getSupplierStatement: builder.query<any, { supplierId: string; params?: any }>({
      query: ({ supplierId, params }) => ({
        url: `/api/restaurant-finance/suppliers/${supplierId}/statement`,
        params,
      }),
      providesTags: ['RestaurantFinance'],
    }),
    getRestaurantExpenses: builder.query<any, any>({
      query: (params) => ({
        url: '/api/restaurant-finance/expenses',
        params,
      }),
      providesTags: ['RestaurantFinance'],
    }),
    getOverdueInvoices: builder.query<any, void>({
      query: () => '/api/restaurant-finance/overdue',
      providesTags: ['RestaurantFinance'],
    }),

    // Supplier invoices
    getSupplierInvoices: builder.query<any, any>({
      query: (params) => ({ url: '/api/invoices', params }),
      providesTags: ['RestaurantFinance'],
    }),

    // Notification endpoints
    getBranches: builder.query<{ branches: Array<Record<string, unknown>> }, void>({
      query: () => '/api/branches',
      providesTags: ['Branch'],
    }),
    createBranch: builder.mutation<any, Record<string, unknown>>({
      query: (body) => ({
        url: '/api/branches',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Branch'],
    }),
    updateBranch: builder.mutation<any, { id: string; data: Record<string, unknown> }>({
      query: ({ id, data }) => ({
        url: `/api/branches/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: ['Branch'],
    }),
    deleteBranch: builder.mutation<any, string>({
      query: (id) => ({
        url: `/api/branches/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Branch'],
    }),
    switchBranchAccount: builder.mutation<
      { activeAccountId: string | null; tenantName?: string },
      { tenantId: string | null; tenantType?: string }
    >({
      query: (body) => ({
        url: '/api/branches/switch',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Branch', 'Restaurant', 'Supplier', 'Order', 'Reservation', 'Notification'],
    }),
    getOrg: builder.query<
      {
        organization: { id: string; name: string }
        orgRole: string
        branches: Array<Record<string, unknown>>
        primarySupplierId: string
      },
      void
    >({
      query: () => '/api/org',
      providesTags: ['Branch', 'Org'],
    }),
    getOrgBranches: builder.query<
      {
        branches: Array<Record<string, unknown>>
        activeSupplierId: string | null
        organizationId: string
      },
      void
    >({
      query: () => '/api/org/branches',
      providesTags: ['Branch', 'Org'],
    }),
    createOrgBranch: builder.mutation<any, Record<string, unknown>>({
      query: (body) => ({ url: '/api/org/branches', method: 'POST', body }),
      invalidatesTags: ['Branch', 'Org', 'Supplier'],
    }),
    deactivateOrgBranch: builder.mutation<{ deactivated: boolean }, string>({
      query: (supplierId) => ({
        url: `/api/org/branches/${supplierId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Branch', 'Org', 'Supplier'],
    }),
    switchOrgBranchContext: builder.mutation<
      { activeSupplierId: string | null; tenantName?: string },
      { supplier_id: string | null }
    >({
      query: (body) => ({
        url: '/api/org/context/switch',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Branch', 'Org', 'Restaurant', 'Supplier', 'Order', 'Notification'],
    }),
    getBranchInviteRoles: builder.query<
      { roles: Array<{ id: string; name: string; description?: string }> },
      { supplier_id: string }
    >({
      query: ({ supplier_id }) =>
        `/api/org/invitations/roles?supplier_id=${encodeURIComponent(supplier_id)}`,
    }),
    getBranchInvitations: builder.query<
      {
        invitations: Array<{
          id: string
          supplier_id: string
          invited_name?: string
          invited_email?: string
          status: string
          expires_at: string
          created_at: string
          accepted_at?: string
          branch_name: string
          role_name: string
          accepted_by_name?: string
        }>
      },
      { supplier_id?: string } | void
    >({
      query: (params) => {
        const supplierId = params && 'supplier_id' in params ? params.supplier_id : undefined
        return supplierId
          ? `/api/org/invitations?supplier_id=${encodeURIComponent(supplierId)}`
          : '/api/org/invitations'
      },
      providesTags: ['BranchInvitations'],
    }),
    createBranchInvitation: builder.mutation<
      { invitation_id: string; invite_url: string; expires_at: string },
      {
        supplier_id: string
        invited_name?: string
        invited_email?: string
        role_id: string
      }
    >({
      query: (body) => ({ url: '/api/org/invitations', method: 'POST', body }),
      invalidatesTags: ['BranchInvitations'],
    }),
    revokeBranchInvitation: builder.mutation<{ revoked: boolean }, string>({
      query: (id) => ({ url: `/api/org/invitations/${id}`, method: 'DELETE' }),
      invalidatesTags: ['BranchInvitations'],
    }),
    regenerateBranchInvitation: builder.mutation<
      { invitation_id: string; invite_url: string; expires_at: string },
      string
    >({
      query: (id) => ({ url: `/api/org/invitations/${id}/regenerate`, method: 'POST' }),
      invalidatesTags: ['BranchInvitations'],
    }),
    validateBranchInvite: builder.query<
      {
        valid: boolean
        reason?: string
        branch_name?: string
        org_name?: string
        invited_name?: string
        role_name?: string
        invited_email?: string
        expires_at?: string
      },
      string
    >({
      query: (token) => `/api/public/invitations/branch?token=${encodeURIComponent(token)}`,
    }),
    acceptBranchInvite: builder.mutation<
      { user?: { email?: string; displayName?: string }; activeSupplierId: string },
      { token: string; full_name?: string; email?: string; password?: string }
    >({
      query: (body) => ({
        url: '/api/public/invitations/branch/accept',
        method: 'POST',
        body,
      }),
    }),
    validateInvite: builder.query<
      {
        valid: boolean
        reason?: string
        branch_name?: string
        restaurant_name?: string
        org_name?: string
        invited_name?: string
        role_name?: string
        invited_email?: string
        expires_at?: string
      },
      { token: string; type: string }
    >({
      query: ({ token, type }) =>
        `/api/public/invitations?token=${encodeURIComponent(token)}&type=${encodeURIComponent(type)}`,
    }),
    acceptInvite: builder.mutation<
      {
        user?: { email?: string; displayName?: string }
        activeSupplierId?: string
        activeRestaurantId?: string
        needsManualLogin?: boolean
        loginMessage?: string
      },
      {
        token: string
        type: string
        full_name?: string
        email?: string
        password?: string
      }
    >({
      query: (body) => ({
        url: '/api/public/invitations/accept',
        method: 'POST',
        body,
      }),
    }),
    getRestaurantOrg: builder.query<
      {
        organization: { id: string; name: string }
        orgRole: string
        branches: Array<Record<string, unknown>>
        primaryRestaurantId: string
      },
      void
    >({
      query: () => '/api/restaurant-org',
      providesTags: ['RestaurantOrg', 'Branch'],
    }),
    getRestaurantOrgBranches: builder.query<
      {
        branches: Array<Record<string, unknown>>
        activeRestaurantId: string | null
        organizationId: string
      },
      void
    >({
      query: () => '/api/restaurant-org/branches',
      providesTags: ['RestaurantOrg', 'Branch'],
    }),
    createRestaurantOrgBranch: builder.mutation<any, Record<string, unknown>>({
      query: (body) => ({ url: '/api/restaurant-org/branches', method: 'POST', body }),
      invalidatesTags: ['RestaurantOrg', 'Branch', 'Restaurant'],
    }),
    switchRestaurantOrgBranchContext: builder.mutation<
      { activeRestaurantId: string | null; tenantName?: string },
      { restaurant_id: string | null }
    >({
      query: (body) => ({
        url: '/api/restaurant-org/context/switch',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['RestaurantOrg', 'Branch', 'Restaurant', 'Order', 'Notification'],
    }),
    deactivateRestaurantOrgBranch: builder.mutation<{ deactivated: boolean }, string>({
      query: (restaurantId) => ({
        url: `/api/restaurant-org/branches/${restaurantId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['RestaurantOrg', 'Branch'],
    }),
    getRestaurantMemberInviteRoles: builder.query<
      { roles: Array<{ id: string; name: string; description?: string }> },
      void
    >({
      query: () => '/api/restaurants/invitations/members/roles',
    }),
    getRestaurantBranchInviteRoles: builder.query<
      { roles: Array<{ id: string; name: string; description?: string }> },
      { restaurant_id: string }
    >({
      query: ({ restaurant_id }) =>
        `/api/restaurants/invitations/branches/roles?restaurant_id=${encodeURIComponent(restaurant_id)}`,
    }),
    getRestaurantMemberInvitations: builder.query<
      {
        invitations: Array<{
          id: string
          invited_name?: string
          invited_email?: string
          status: string
          invitation_type: string
          expires_at: string
          created_at: string
          accepted_at?: string
          role_name: string
          accepted_by_name?: string
        }>
      },
      void
    >({
      query: () => '/api/restaurants/invitations/members',
      providesTags: ['RestaurantInvitations'],
    }),
    createRestaurantMemberInvitation: builder.mutation<
      { invitation_id: string; invite_url: string; expires_at: string },
      { invited_name?: string; invited_email?: string; role_id: string }
    >({
      query: (body) => ({
        url: '/api/restaurants/invitations/members',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['RestaurantInvitations'],
    }),
    revokeRestaurantMemberInvitation: builder.mutation<{ revoked: boolean }, string>({
      query: (id) => ({ url: `/api/restaurants/invitations/members/${id}`, method: 'DELETE' }),
      invalidatesTags: ['RestaurantInvitations'],
    }),
    regenerateRestaurantMemberInvitation: builder.mutation<
      { invitation_id: string; invite_url: string; expires_at: string },
      string
    >({
      query: (id) => ({
        url: `/api/restaurants/invitations/members/${id}/regenerate`,
        method: 'POST',
      }),
      invalidatesTags: ['RestaurantInvitations'],
    }),
    getRestaurantBranchInvitations: builder.query<
      {
        invitations: Array<{
          id: string
          restaurant_id: string
          invited_name?: string
          invited_email?: string
          status: string
          expires_at: string
          created_at: string
          accepted_at?: string
          branch_name: string
          role_name: string
          accepted_by_name?: string
        }>
      },
      void
    >({
      query: () => '/api/restaurants/invitations/branches',
      providesTags: ['RestaurantInvitations'],
    }),
    createRestaurantBranchInvitation: builder.mutation<
      { invitation_id: string; invite_url: string; expires_at: string },
      {
        restaurant_id: string
        invited_name?: string
        invited_email?: string
        role_id: string
      }
    >({
      query: (body) => ({
        url: '/api/restaurants/invitations/branches',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['RestaurantInvitations'],
    }),
    revokeRestaurantBranchInvitation: builder.mutation<{ revoked: boolean }, string>({
      query: (id) => ({ url: `/api/restaurants/invitations/branches/${id}`, method: 'DELETE' }),
      invalidatesTags: ['RestaurantInvitations'],
    }),
    regenerateRestaurantBranchInvitation: builder.mutation<
      { invitation_id: string; invite_url: string; expires_at: string },
      string
    >({
      query: (id) => ({
        url: `/api/restaurants/invitations/branches/${id}/regenerate`,
        method: 'POST',
      }),
      invalidatesTags: ['RestaurantInvitations'],
    }),

    getRestaurantTeam: builder.query<
      {
        team: Array<{
          id: string
          name: string
          email: string
          phone?: string | null
          role: string
          is_primary: boolean
          branch_name?: string | null
        }>
      },
      void
    >({
      query: () => '/api/restaurant-onboarding/team',
      providesTags: ['RestaurantTeam'],
    }),
    addRestaurantTeamMember: builder.mutation<
      { member: Record<string, unknown> },
      { name: string; email: string; phone?: string; role: string; isPrimary?: boolean }
    >({
      query: (body) => ({
        url: '/api/restaurant-onboarding/team',
        method: 'POST',
        body: {
          name: body.name,
          email: body.email,
          phone: body.phone,
          role: body.role,
          isPrimary: body.isPrimary,
        },
      }),
      invalidatesTags: ['RestaurantTeam'],
    }),
    deleteRestaurantTeamMember: builder.mutation<{ deleted: boolean }, string>({
      query: (id) => ({
        url: `/api/restaurant-onboarding/team/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['RestaurantTeam'],
    }),

    getTenantRoles: builder.query<
      {
        roles: Array<{
          id: string
          name: string
          description?: string
          is_system: boolean
          permissions: string[]
          user_count: number
        }>
      },
      void
    >({
      query: () => '/api/roles',
      providesTags: ['TenantRoles'],
    }),
    getTenantRoleUsers: builder.query<
      {
        users: Array<{
          id: string
          email: string
          display_name: string
          role_id?: string
          role_name?: string
        }>
      },
      void
    >({
      query: () => '/api/roles/users',
      providesTags: ['TenantRoles'],
    }),
    createTenantRole: builder.mutation<
      { role: Record<string, unknown> },
      { name: string; description?: string; permissions: string[] }
    >({
      query: (body) => ({
        url: '/api/roles',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['TenantRoles'],
    }),
    updateTenantRole: builder.mutation<
      { role: Record<string, unknown> },
      { id: string; name?: string; description?: string; permissions?: string[] }
    >({
      query: ({ id, ...body }) => ({
        url: `/api/roles/${id}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['TenantRoles'],
    }),
    deleteTenantRole: builder.mutation<{ deleted: boolean }, string>({
      query: (id) => ({
        url: `/api/roles/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['TenantRoles'],
    }),
    assignTenantUserRole: builder.mutation<
      { userId: string; roleId: string; roleName: string },
      { userId: string; role_id: string }
    >({
      query: ({ userId, role_id }) => ({
        url: `/api/roles/users/${userId}/assign`,
        method: 'POST',
        body: { role_id },
      }),
      invalidatesTags: ['TenantRoles', 'User'],
    }),

    // Notification endpoints
    getNotifications: builder.query<any, any>({
      query: (params) => ({
        url: '/api/notifications',
        params,
      }),
      providesTags: ['Notification'],
    }),
    getNotificationPreferences: builder.query<any, void>({
      query: () => '/api/notifications/preferences',
      providesTags: ['Notification'],
    }),
    updateNotificationPreferences: builder.mutation<any, any>({
      query: (data) => ({
        url: '/api/notifications/preferences',
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: ['Notification'],
    }),
    markNotificationRead: builder.mutation<any, string>({
      query: (id) => ({
        url: `/api/notifications/${id}/read`,
        method: 'POST',
      }),
      invalidatesTags: ['Notification'],
    }),
    markAllNotificationsRead: builder.mutation<any, void>({
      query: () => ({
        url: '/api/notifications/read-all',
        method: 'POST',
      }),
      invalidatesTags: ['Notification'],
    }),

    // Public reservation portal
    getPublicRestaurants: builder.query<PublicRestaurant[], void>({
      query: () => ({
        url: '/api/public/restaurants',
        credentials: 'omit',
      }),
    }),
    getPublicRestaurant: builder.query<PublicRestaurant, string>({
      query: (idOrSlug) => ({
        url: `/api/public/restaurants/${encodeURIComponent(idOrSlug)}`,
        credentials: 'omit',
      }),
    }),
    getPublicReservationAvailability: builder.query<
      PublicAvailabilityResponse,
      { restaurantId: string; partySize: number; date: string; manageToken?: string }
    >({
      query: ({ restaurantId, partySize, date, manageToken }) => ({
        url: '/api/public/reservations/availability',
        params: {
          restaurantId,
          partySize,
          date,
          ...(manageToken ? { manageToken } : {}),
        },
        credentials: 'omit',
      }),
    }),
    joinPublicWaitlist: builder.mutation<
      { message: string },
      {
        restaurantId: string
        partySize: number
        desiredAt?: string
        customerName: string
        customerPhone: string
        notes?: string
      }
    >({
      query: (body) => ({
        url: '/api/public/reservations/waitlist',
        method: 'POST',
        body,
        credentials: 'omit',
      }),
    }),
    createPublicReservation: builder.mutation<
      { reservation: PublicReservationSummary },
      {
        restaurantId: string
        partySize: number
        scheduledAt: string
        durationMinutes?: number
        customerName: string
        customerEmail: string
        customerPhone: string
        notes?: string
      }
    >({
      query: (body) => ({
        url: '/api/public/reservations',
        method: 'POST',
        body,
        credentials: 'omit',
      }),
      invalidatesTags: [{ type: 'Reservation', id: 'BOARD' }],
    }),
    getPublicReservationDetails: builder.query<{ reservation: PublicReservationDetails }, string>({
      query: (token) => ({
        url: '/api/public/reservations/manage',
        params: { token },
        credentials: 'omit',
      }),
      providesTags: (_result, _error, token) => [{ type: 'Reservation', id: token }],
    }),
    cancelPublicReservation: builder.mutation<
      { reservation: PublicReservationDetails },
      { token: string }
    >({
      query: (body) => ({
        url: '/api/public/reservations/manage/cancel',
        method: 'POST',
        body,
        credentials: 'omit',
      }),
      invalidatesTags: (_result, _error, { token }) => [
        { type: 'Reservation', id: token },
        { type: 'Reservation', id: 'BOARD' },
      ],
    }),
    reschedulePublicReservation: builder.mutation<
      { reservation: PublicReservationDetails },
      { token: string; scheduledAt: string }
    >({
      query: (body) => ({
        url: '/api/public/reservations/manage/reschedule',
        method: 'POST',
        body,
        credentials: 'omit',
      }),
      invalidatesTags: (_result, _error, { token }) => [
        { type: 'Reservation', id: token },
        { type: 'Reservation', id: 'BOARD' },
      ],
    }),

    // Staff self-service portal
    requestStaffPortalLink: builder.mutation<
      { message: string; sessionToken?: string; expiresAt?: string },
      { email: string }
    >({
      query: (body) => ({
        url: '/api/public/staff/request-link',
        method: 'POST',
        body,
        credentials: 'omit',
      }),
    }),
    createStaffPortalSession: builder.mutation<StaffPortalSession, { token: string }>({
      query: (body) => ({
        url: '/api/public/staff/session',
        method: 'POST',
        body,
        credentials: 'omit',
      }),
    }),
    getStaffPortalDashboard: builder.query<StaffPortalDashboard, { token: string }>({
      query: ({ token }) => ({
        url: '/api/public/staff/dashboard',
        params: { token },
        credentials: 'omit',
      }),
    }),
    submitStaffPortalPto: builder.mutation<
      StaffPtoRequest,
      {
        token: string
        type: StaffPtoRequest['type']
        startDate: string
        endDate: string
        hoursRequested?: number
        reason?: string
      }
    >({
      query: (body) => ({
        url: '/api/public/staff/pto',
        method: 'POST',
        body,
        credentials: 'omit',
      }),
    }),
    submitStaffPortalSwap: builder.mutation<
      StaffShiftSwap,
      {
        token: string
        shiftId: string
        proposedCoverId?: string
        reason?: string
      }
    >({
      query: (body) => ({
        url: '/api/public/staff/swaps',
        method: 'POST',
        body,
        credentials: 'omit',
      }),
    }),
    getStaffPortalTimeEntries: builder.query<StaffTimeEntry[], { token: string }>({
      query: ({ token }) => ({
        url: '/api/public/staff/time-entries',
        params: { token },
        credentials: 'omit',
      }),
    }),
    staffPortalCheckIn: builder.mutation<StaffTimeEntry, { token: string; note?: string }>({
      query: (body) => ({
        url: '/api/public/staff/check-in',
        method: 'POST',
        body,
        credentials: 'omit',
      }),
    }),
    staffPortalCheckOut: builder.mutation<StaffTimeEntry, { token: string; id: string }>({
      query: ({ token, id }) => ({
        url: `/api/public/staff/time-entries/${id}/check-out`,
        method: 'POST',
        body: { token },
        credentials: 'omit',
      }),
    }),
    getStaffSelfDashboard: builder.query<StaffPortalDashboard, void>({
      query: () => ({
        url: '/api/staff/self/dashboard',
      }),
      providesTags: [
        'StaffMember',
        'StaffShift',
        'StaffPto',
        'StaffSwap',
        'StaffAnnouncement',
        'StaffDocument',
      ],
    }),
    getStaffSelfTimeEntries: builder.query<StaffTimeEntry[], void>({
      query: () => '/api/staff/self/time-entries',
      providesTags: ['StaffTimeEntry'],
    }),
    staffSelfCheckIn: builder.mutation<StaffTimeEntry, { note?: string }>({
      query: (body) => ({
        url: '/api/staff/self/check-in',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['StaffTimeEntry'],
    }),
    staffSelfCheckOut: builder.mutation<StaffTimeEntry, { id: string }>({
      query: ({ id }) => ({
        url: `/api/staff/self/time-entries/${id}/check-out`,
        method: 'POST',
        body: {},
      }),
      invalidatesTags: ['StaffTimeEntry'],
    }),
    submitStaffSelfPto: builder.mutation<
      StaffPtoRequest,
      {
        type: StaffPtoRequest['type']
        startDate: string
        endDate: string
        hoursRequested?: number
        reason?: string
      }
    >({
      query: (body) => ({
        url: '/api/staff/self/pto',
        method: 'POST',
        body,
      }),
    }),
    submitStaffSelfSwap: builder.mutation<
      StaffShiftSwap,
      {
        shiftId: string
        proposedCoverId?: string
        reason?: string
      }
    >({
      query: (body) => ({
        url: '/api/staff/self/swaps',
        method: 'POST',
        body,
      }),
    }),

    // Reports
    getRestaurantReport: builder.query<
      { data: Array<Record<string, unknown>>; meta?: Record<string, unknown> },
      { path: string; from?: string; to?: string; branchId?: string; granularity?: string }
    >({
      query: ({ path, from, to, branchId, granularity }) => ({
        url: `/api/reports/restaurant/${path}`,
        params: { from, to, branch_id: branchId, granularity },
      }),
      providesTags: ['Reports'],
    }),
    getSupplierReport: builder.query<
      { data: Array<Record<string, unknown>>; meta?: Record<string, unknown> },
      { path: string; from?: string; to?: string; granularity?: string }
    >({
      query: ({ path, from, to, granularity }) => ({
        url: `/api/reports/supplier/${path}`,
        params: { from, to, granularity },
      }),
      providesTags: ['Reports'],
    }),

    // Disputes
    getDisputes: builder.query<
      { disputes: Array<Record<string, unknown>> },
      { status?: string } | void
    >({
      query: (params) => ({ url: '/api/disputes', params: params || {} }),
      providesTags: ['Disputes'],
    }),
    getIncomingDisputes: builder.query<
      { disputes: Array<Record<string, unknown>> },
      { status?: string } | void
    >({
      query: (params) => ({ url: '/api/disputes/incoming', params: params || {} }),
      providesTags: ['Disputes'],
    }),
    getDispute: builder.query<Record<string, unknown>, string>({
      query: (id) => `/api/disputes/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'Disputes', id }],
    }),
    createDispute: builder.mutation<Record<string, unknown>, Record<string, unknown>>({
      query: (body) => ({ url: '/api/disputes', method: 'POST', body }),
      invalidatesTags: ['Disputes', 'Order', 'Receiving'],
    }),
    cancelDispute: builder.mutation<Record<string, unknown>, string>({
      query: (id) => ({ url: `/api/disputes/${id}/cancel`, method: 'POST' }),
      invalidatesTags: ['Disputes'],
    }),
    reviewDispute: builder.mutation<Record<string, unknown>, string>({
      query: (id) => ({ url: `/api/disputes/${id}/review`, method: 'POST' }),
      invalidatesTags: ['Disputes'],
    }),
    resolveDispute: builder.mutation<
      Record<string, unknown>,
      { id: string; body: Record<string, unknown> }
    >({
      query: ({ id, body }) => ({ url: `/api/disputes/${id}/resolve`, method: 'POST', body }),
      invalidatesTags: ['Disputes', 'CreditNotes', 'Order'],
    }),
    rejectDispute: builder.mutation<
      Record<string, unknown>,
      { id: string; resolutionNotes: string }
    >({
      query: ({ id, resolutionNotes }) => ({
        url: `/api/disputes/${id}/reject`,
        method: 'POST',
        body: { resolutionNotes },
      }),
      invalidatesTags: ['Disputes'],
    }),

    // Credit notes
    getCreditNotes: builder.query<{ creditNotes: Array<Record<string, unknown>> }, void>({
      query: () => '/api/credit-notes',
      providesTags: ['CreditNotes'],
    }),
    applyCreditNote: builder.mutation<
      { creditNote: Record<string, unknown> },
      { id: string; invoiceId?: string }
    >({
      query: ({ id, invoiceId }) => ({
        url: `/api/credit-notes/${id}/apply`,
        method: 'POST',
        body: invoiceId ? { invoiceId } : {},
      }),
      invalidatesTags: ['CreditNotes', 'RestaurantFinance'],
    }),

    // Promotions
    getPromotions: builder.query<
      { promotions: Array<Record<string, unknown>> },
      { status?: string } | void
    >({
      query: (params) => ({ url: '/api/promotions', params: params || {} }),
      providesTags: ['Promotions'],
    }),
    getActivePromotions: builder.query<
      { promotions: Array<Record<string, unknown>> },
      { supplierId?: string; categoryId?: string; sort?: string; expiringSoon?: string } | void
    >({
      query: (params) => ({ url: '/api/promotions/active', params: params || {} }),
      providesTags: ['Promotions'],
    }),
    createPromotion: builder.mutation<
      { promotion: Record<string, unknown> },
      Record<string, unknown>
    >({
      query: (body) => ({ url: '/api/promotions', method: 'POST', body }),
      invalidatesTags: ['Promotions'],
    }),
    updatePromotion: builder.mutation<
      { promotion: Record<string, unknown> },
      { id: string; data: Record<string, unknown> }
    >({
      query: ({ id, data }) => ({ url: `/api/promotions/${id}`, method: 'PATCH', body: data }),
      invalidatesTags: ['Promotions'],
    }),
    activatePromotion: builder.mutation<{ promotion: Record<string, unknown> }, string>({
      query: (id) => ({ url: `/api/promotions/${id}/activate`, method: 'POST' }),
      invalidatesTags: ['Promotions'],
    }),
    pausePromotion: builder.mutation<{ promotion: Record<string, unknown> }, string>({
      query: (id) => ({ url: `/api/promotions/${id}/pause`, method: 'POST' }),
      invalidatesTags: ['Promotions'],
    }),
    deletePromotion: builder.mutation<{ deleted: boolean }, string>({
      query: (id) => ({ url: `/api/promotions/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Promotions'],
    }),
    getPromotionAnalytics: builder.query<{ analytics: Record<string, unknown> }, string>({
      query: (id) => `/api/promotions/${id}/analytics`,
      providesTags: (_r, _e, id) => [{ type: 'Promotions', id }],
    }),
    getPromotionPricing: builder.query<{ pricing: Array<Record<string, unknown>> }, void>({
      query: () => '/api/promotions/pricing',
    }),
    getDealDetail: builder.query<{ deal: Record<string, unknown> }, string>({
      query: (id) => `/api/promotions/${id}/detail`,
      providesTags: (_r, _e, id) => [{ type: 'Promotions', id }],
    }),
    getEligibleDealProducts: builder.query<
      { products: Array<Record<string, unknown>>; dealId: string; supplierId: string },
      string
    >({
      query: (id) => `/api/promotions/${id}/eligible-products`,
    }),
    recordDealInteraction: builder.mutation<
      { interaction: Record<string, unknown> },
      { id: string; interactionType: string; metadata?: Record<string, unknown> }
    >({
      query: ({ id, ...body }) => ({
        url: `/api/promotions/${id}/interact`,
        method: 'POST',
        body,
      }),
    }),
    useDealCoupon: builder.mutation<
      { couponCode: string; dealId: string; supplierId: string },
      string
    >({
      query: (id) => ({ url: `/api/promotions/${id}/use-coupon`, method: 'POST' }),
    }),
    messageFromDeal: builder.mutation<
      {
        conversation: Record<string, unknown>
        message: Record<string, unknown>
        initialMessage: string
      },
      string
    >({
      query: (id) => ({ url: `/api/promotions/${id}/message`, method: 'POST' }),
      invalidatesTags: ['Conversations'],
    }),
    promoteDeal: builder.mutation<
      { promotion: Record<string, unknown> },
      { id: string; pricingKey?: string; budget?: number; targetAudience?: Record<string, unknown> }
    >({
      query: ({ id, ...body }) => ({
        url: `/api/promotions/${id}/promote`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Promotions'],
    }),
    resumePromotion: builder.mutation<{ promotion: Record<string, unknown> }, string>({
      query: (id) => ({ url: `/api/promotions/${id}/resume`, method: 'POST' }),
      invalidatesTags: ['Promotions'],
    }),
    previewDeal: builder.query<{ deal: Record<string, unknown> }, string>({
      query: (id) => `/api/promotions/${id}/preview`,
    }),
    getAdminDeals: builder.query<
      { deals: Array<Record<string, unknown>> },
      {
        status?: string
        supplierId?: string
        type?: string
        search?: string
        fromDate?: string
        toDate?: string
      }
    >({
      query: (params) => ({ url: '/api/promotions/admin/deals', params: params || {} }),
      providesTags: ['Promotions'],
    }),
    getAdminDealInsights: builder.query<{ insights: Record<string, unknown> }, void>({
      query: () => '/api/promotions/admin/deals/insights',
      providesTags: ['Promotions'],
    }),
    getAdminPendingDeals: builder.query<{ deals: Array<Record<string, unknown>> }, void>({
      query: () => '/api/promotions/admin/pending',
      providesTags: ['Promotions'],
    }),
    approveAdminDeal: builder.mutation<{ deal: Record<string, unknown> }, string>({
      query: (id) => ({ url: `/api/promotions/admin/${id}/approve`, method: 'POST' }),
      invalidatesTags: ['Promotions'],
    }),
    rejectAdminDeal: builder.mutation<
      { deal: Record<string, unknown> },
      { id: string; rejectionReason?: string; adminNotes?: string }
    >({
      query: ({ id, ...body }) => ({
        url: `/api/promotions/admin/${id}/reject`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Promotions'],
    }),
    pauseAdminDeal: builder.mutation<{ deal: Record<string, unknown> }, string>({
      query: (id) => ({ url: `/api/promotions/admin/${id}/pause`, method: 'POST' }),
      invalidatesTags: ['Promotions'],
    }),
    submitPromotion: builder.mutation<{ promotion: Record<string, unknown> }, string>({
      query: (id) => ({ url: `/api/promotions/${id}/submit`, method: 'POST' }),
      invalidatesTags: ['Promotions'],
    }),
    previewCartDeal: builder.mutation<
      { preview: Record<string, unknown> },
      {
        supplierId: string
        subtotal: number
        promotionId?: string
        couponCode?: string
        lineItems?: Array<Record<string, unknown>>
      }
    >({
      query: (body) => ({ url: '/api/promotions/cart-preview', method: 'POST', body }),
    }),
    updateAdminPromotionPricing: builder.mutation<
      { pricing: Record<string, unknown> },
      {
        key: string
        amount?: number
        durationDays?: number
        isActive?: boolean
        displayName?: string
        description?: string
      }
    >({
      query: ({ key, ...body }) => ({
        url: `/api/promotions/admin/pricing/${key}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Promotions'],
    }),

    getAdminLimitKeys: builder.query<
      { keys: string[] },
      { tenantType?: 'RESTAURANT' | 'SUPPLIER' } | void
    >({
      query: (params) => ({
        url: '/api/admin-dashboard/limit-keys',
        params: params || {},
      }),
    }),
    getAdminLimitOverrides: builder.query<
      {
        tenantOverrides: Array<Record<string, unknown>>
        planOverrides: Array<Record<string, unknown>>
      },
      {
        tenantType?: string
        tenantId?: string
        planId?: string
        limitKey?: string
        active?: string
      } | void
    >({
      query: (params) => ({
        url: '/api/admin-dashboard/limit-overrides',
        params: params || {},
      }),
    }),
    createAdminPlanLimitOverride: builder.mutation<
      { override: Record<string, unknown> },
      {
        planId: string
        limit_type: string
        override_value: number
        expiration_date?: string | null
        reason?: string | null
      }
    >({
      query: ({ planId, ...body }) => ({
        url: `/api/admin-dashboard/plans/${planId}/override-limit`,
        method: 'POST',
        body,
      }),
    }),
    updateAdminTenantLimitOverride: builder.mutation<
      { override: Record<string, unknown> },
      {
        id: string
        override_value?: number
        expiration_date?: string | null
        reason?: string | null
        is_active?: boolean
      }
    >({
      query: ({ id, ...body }) => ({
        url: `/api/admin-dashboard/tenant-overrides/${id}`,
        method: 'PATCH',
        body,
      }),
    }),
    updateAdminPlanLimitOverride: builder.mutation<
      { override: Record<string, unknown> },
      {
        id: string
        override_value?: number
        expiration_date?: string | null
        reason?: string | null
        is_active?: boolean
      }
    >({
      query: ({ id, ...body }) => ({
        url: `/api/admin-dashboard/plan-overrides/${id}`,
        method: 'PATCH',
        body,
      }),
    }),

    // Reviews
    getSupplierReviews: builder.query<
      { reviews: Array<Record<string, unknown>>; total?: number },
      { supplierId: string; limit?: number; offset?: number }
    >({
      query: ({ supplierId, limit, offset }) => ({
        url: `/api/reviews/suppliers/${supplierId}`,
        params: { limit, offset },
      }),
      providesTags: (_r, _e, { supplierId }) => [{ type: 'Reviews', id: supplierId }],
    }),
    getSupplierRatingSummary: builder.query<{ summary: Record<string, unknown> }, string>({
      query: (supplierId) => `/api/reviews/suppliers/${supplierId}/summary`,
      providesTags: (_r, _e, supplierId) => [{ type: 'Reviews', id: `summary-${supplierId}` }],
    }),
    getMyReviews: builder.query<
      { reviews: Array<Record<string, unknown>> },
      { limit?: number; offset?: number } | void
    >({
      query: (params) => ({ url: '/api/reviews/my', params: params || {} }),
      providesTags: ['Reviews'],
    }),
    createSupplierReview: builder.mutation<
      { review: Record<string, unknown> },
      { supplierId: string; body: Record<string, unknown> }
    >({
      query: ({ supplierId, body }) => ({
        url: `/api/reviews/suppliers/${supplierId}`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_r, _e, { supplierId }) => [
        { type: 'Reviews', id: supplierId },
        { type: 'Reviews', id: `summary-${supplierId}` },
        'Reviews',
      ],
    }),
    updateReview: builder.mutation<
      { review: Record<string, unknown> },
      { id: string; body: Record<string, unknown> }
    >({
      query: ({ id, body }) => ({ url: `/api/reviews/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Reviews'],
    }),
    deleteReview: builder.mutation<{ deleted: boolean }, string>({
      query: (id) => ({ url: `/api/reviews/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Reviews'],
    }),

    // Tenant audit log
    getTenantAuditLogFilters: builder.query<
      {
        actions: Array<{ value: string; label: string }>
        resourceTypes: Array<{ value: string; label: string }>
      },
      void
    >({
      query: () => '/api/audit/logs/filters',
      providesTags: ['Audit'],
    }),
    getTenantAuditLogs: builder.query<
      { logs: Array<Record<string, unknown>>; total: number; limit: number; offset: number },
      {
        userId?: string
        action?: string
        resourceType?: string
        from?: string
        to?: string
        limit?: number
        offset?: number
      } | void
    >({
      query: (params) => ({ url: '/api/audit/logs', params: params || {} }),
      providesTags: ['Audit'],
    }),

    // Order amendments
    getOrderAmendments: builder.query<{ amendments: Array<Record<string, unknown>> }, string>({
      query: (orderId) => `/api/orders/${orderId}/amendments`,
      providesTags: (_r, _e, orderId) => [{ type: 'Amendments', id: orderId }],
    }),
    createOrderAmendment: builder.mutation<
      { amendment: Record<string, unknown> },
      { orderId: string; body: Record<string, unknown> }
    >({
      query: ({ orderId, body }) => ({
        url: `/api/orders/${orderId}/amendments`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_r, _e, { orderId }) => [{ type: 'Amendments', id: orderId }, 'Order'],
    }),
    acceptOrderAmendment: builder.mutation<
      { amendment: Record<string, unknown>; orderTotal?: number },
      { orderId: string; amendmentId: string; responseNotes?: string }
    >({
      query: ({ orderId, amendmentId, responseNotes }) => ({
        url: `/api/orders/${orderId}/amendments/${amendmentId}/accept`,
        method: 'POST',
        body: responseNotes ? { responseNotes } : {},
      }),
      invalidatesTags: (_r, _e, { orderId }) => [{ type: 'Amendments', id: orderId }, 'Order'],
    }),
    rejectOrderAmendment: builder.mutation<
      { amendment: Record<string, unknown> },
      { orderId: string; amendmentId: string; responseNotes: string }
    >({
      query: ({ orderId, amendmentId, responseNotes }) => ({
        url: `/api/orders/${orderId}/amendments/${amendmentId}/reject`,
        method: 'POST',
        body: { responseNotes },
      }),
      invalidatesTags: (_r, _e, { orderId }) => [{ type: 'Amendments', id: orderId }],
    }),
    cancelOrderAmendment: builder.mutation<
      { amendment: Record<string, unknown> },
      { orderId: string; amendmentId: string }
    >({
      query: ({ orderId, amendmentId }) => ({
        url: `/api/orders/${orderId}/amendments/${amendmentId}/cancel`,
        method: 'POST',
      }),
      invalidatesTags: (_r, _e, { orderId }) => [{ type: 'Amendments', id: orderId }],
    }),

    // Web push
    getVapidPublicKey: builder.query<{ publicKey: string }, void>({
      query: () => '/api/push/vapid-public-key',
    }),
    subscribePush: builder.mutation<
      { subscription: Record<string, unknown> },
      { endpoint: string; keys: { p256dh: string; auth: string } }
    >({
      query: (body) => ({ url: '/api/push/subscribe', method: 'POST', body }),
    }),
    unsubscribePush: builder.mutation<{ removed: boolean }, { endpoint: string }>({
      query: (body) => ({ url: '/api/push/unsubscribe', method: 'DELETE', body }),
    }),

    acceptWaitlistOffer: builder.mutation<
      { reservation: Record<string, unknown>; waitlist: Record<string, unknown> },
      string
    >({
      query: (token) => ({
        url: `/api/public/reservations/waitlist/${token}/accept`,
        method: 'POST',
        credentials: 'omit',
      }),
      invalidatesTags: ['Reservation'],
    }),
    declineWaitlistOffer: builder.mutation<
      { message: string; waitlist: Record<string, unknown> },
      string
    >({
      query: (token) => ({
        url: `/api/public/reservations/waitlist/${token}/decline`,
        method: 'POST',
        credentials: 'omit',
      }),
      invalidatesTags: ['Reservation'],
    }),

    // Subscription endpoints
    getCurrentSubscription: builder.query<{ subscription: Subscription }, void>({
      query: () => '/api/subscriptions/current',
      providesTags: ['Subscription'],
    }),
    getEntitlements: builder.query<{ entitlements: Entitlements }, void>({
      query: () => '/api/subscriptions/entitlements',
      providesTags: ['Subscription'],
      keepUnusedDataFor: 5 * 60, // Cache 5 min per session to avoid repeated calls
    }),
    getSubscriptionUsage: builder.query<UsageMeter & { meterType: string }, string>({
      query: (meterType) => `/api/subscriptions/usage/${meterType}`,
      providesTags: ['Subscription'],
    }),
    checkFeature: builder.query<{ featureKey: string; isEnabled: boolean }, string>({
      query: (featureKey) => `/api/subscriptions/features/${featureKey}`,
      providesTags: ['Subscription'],
    }),
    getRecommendation: builder.query<import('../types').PlanRecommendation, { blocked?: string }>({
      query: (params) => ({
        url: '/api/subscriptions/recommendation',
        params: params ?? {},
      }),
      providesTags: ['Subscription'],
    }),
    getSubscriptionPlans: builder.query<
      {
        plans: Array<{
          id: string
          code: string
          name: string
          limits: Record<string, unknown>
          features: Record<string, unknown>
        }>
      },
      void
    >({
      query: () => '/api/subscriptions/plans',
      providesTags: ['Subscription'],
    }),
    recordConversionEvent: builder.mutation<
      { recorded: boolean },
      { eventType: string; metadata?: Record<string, unknown> }
    >({
      query: (body) => ({
        url: '/api/subscriptions/conversion-event',
        method: 'POST',
        body,
      }),
    }),

    getBillingStatus: builder.query<BillingStatus, void>({
      query: () => '/api/billing/status',
      providesTags: ['Billing', 'Subscription'],
    }),
    getBillingPaymentMethods: builder.query<{ paymentMethods: BillingPaymentMethod[] }, void>({
      query: () => '/api/billing/payment-methods',
      providesTags: ['Billing'],
    }),
    addBillingPaymentMethod: builder.mutation<
      { paymentMethod: BillingPaymentMethod },
      {
        type: 'CARD' | 'BANK_ACCOUNT'
        setAsDefault?: boolean
        provider?: string
        card?: {
          number?: string
          expMonth?: string | number
          expYear?: string | number
          accountLast4?: string
          bankName?: string
        }
      }
    >({
      query: (body) => ({
        url: '/api/billing/payment-methods',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Billing'],
    }),
    removeBillingPaymentMethod: builder.mutation<{ removed: boolean }, string>({
      query: (id) => ({
        url: `/api/billing/payment-methods/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Billing'],
    }),
    billingCheckout: builder.mutation<
      { success: boolean },
      {
        planId: string
        billingCycle: 'MONTHLY' | 'YEARLY'
        paymentMethodId?: string
        idempotencyKey?: string
      }
    >({
      query: (body) => ({
        url: '/api/billing/checkout',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Billing', 'Subscription'],
    }),
    billingPayNow: builder.mutation<
      { allPaid: boolean },
      { paymentMethodId?: string; idempotencyKey?: string }
    >({
      query: (body) => ({
        url: '/api/billing/pay-now',
        method: 'POST',
        body: body ?? {},
      }),
      invalidatesTags: ['Billing', 'Subscription'],
    }),
    setBillingAutoRenew: builder.mutation<{ autoRenew: boolean }, { autoRenew: boolean }>({
      query: (body) => ({
        url: '/api/billing/auto-renew',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Billing', 'Subscription'],
    }),
    unlockAdminSubscription: builder.mutation<
      { subscription: Subscription },
      { id: string; reason?: string; freeTrialDays?: number }
    >({
      query: ({ id, reason, freeTrialDays }) => ({
        url: `/api/admin-dashboard/subscriptions/${id}/unlock`,
        method: 'POST',
        body: { reason, freeTrialDays },
      }),
      invalidatesTags: ['Admin', 'Billing', 'Subscription'],
    }),

    extendAdminFreeTrial: builder.mutation<
      {
        subscription: Subscription
        freeTrialDays: number
        freeSandboxExpiresAt: string | null
      },
      { id: string; days?: number }
    >({
      query: ({ id, days }) => ({
        url: `/api/admin-dashboard/subscriptions/${id}/extend-free-trial`,
        method: 'POST',
        body: days != null ? { days } : {},
      }),
      invalidatesTags: ['Admin', 'Billing', 'Subscription'],
    }),

    // Admin Dashboard endpoints
    getAdminOverview: builder.query<import('../lib/adminOverview').AdminOverview, void>({
      query: () => '/api/admin-dashboard/overview',
      providesTags: ['Admin'],
    }),
    getAdminPlatformSettings: builder.query<{ freeSandboxDays: number }, void>({
      query: () => '/api/admin-dashboard/platform-settings',
      providesTags: ['Admin'],
    }),
    updateAdminPlatformSettings: builder.mutation<
      { freeSandboxDays: number },
      { freeSandboxDays: number }
    >({
      query: (body) => ({
        url: '/api/admin-dashboard/platform-settings',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Admin'],
    }),
    getAdminConversionStats: builder.query<
      {
        days: number
        totalBlocks: number
        totalUpgrades: number
        blocksToUpgradesConversionPercent: number
        mostBlockedFeature: string | null
        mostBlockedLimit: string | null
        blocksByFeature: Array<{ key: string; count: number }>
        blocksByLimit: Array<{ key: string; count: number }>
        countsPerEventType?: { '7d': Record<string, number>; '30d': Record<string, number> }
        funnelDropOff?: {
          '7d': {
            blocked: number
            openUpgrade: number
            clickUpgrade: number
            upgradeSuccess: number
          }
          '30d': {
            blocked: number
            openUpgrade: number
            clickUpgrade: number
            upgradeSuccess: number
          }
        }
        recommendationFunnel?: {
          '7d': { shown: number; clicked: number; upgradeSuccess: number }
          '30d': { shown: number; clicked: number; upgradeSuccess: number }
        }
      },
      { days?: number }
    >({
      query: (params) => ({
        url: '/api/admin-dashboard/conversion-stats',
        params: params ?? {},
      }),
      providesTags: ['Admin'],
    }),
    getAdminPlans: builder.query<
      { plans: SubscriptionPlan[] },
      { tenant_type?: 'RESTAURANT' | 'SUPPLIER' }
    >({
      query: (params) => ({
        url: '/api/admin-dashboard/plans',
        params: params ?? {},
      }),
      providesTags: ['Admin'],
    }),
    createAdminPlan: builder.mutation<SubscriptionPlan, any>({
      query: (body) => ({
        url: '/api/admin-dashboard/plans',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Admin'],
    }),
    updateAdminPlan: builder.mutation<
      AdminPlanUpdateResult,
      { id: string; data: Record<string, unknown> }
    >({
      query: ({ id, data }) => ({
        url: `/api/admin-dashboard/plans/${id}`,
        method: 'PATCH',
        body: data,
      }),
      transformResponse: (raw) =>
        normalizeAdminPlanUpdateResult(
          raw as AdminPlanUpdateResult | import('../types').SubscriptionPlan
        ),
      invalidatesTags: ['Admin'],
    }),
    getAdminSubscriptions: builder.query<{ subscriptions: Subscription[] }, any>({
      query: (params) => ({
        url: '/api/admin-dashboard/subscriptions',
        params,
      }),
      providesTags: ['Admin'],
    }),
    updateAdminSubscription: builder.mutation<Subscription, { id: string; data: any }>({
      query: ({ id, data }) => ({
        url: `/api/admin-dashboard/subscriptions/${id}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: ['Admin'],
    }),
    previewSubscriptionPlanChange: builder.mutation<
      SubscriptionPlanChangePreview,
      { subscriptionId: string; targetPlanId: string }
    >({
      query: ({ subscriptionId, targetPlanId }) => ({
        url: `/api/admin-dashboard/subscriptions/${subscriptionId}/preview-change`,
        method: 'POST',
        body: { targetPlanId },
      }),
      invalidatesTags: ['Admin'],
    }),
    getTenantUsage: builder.query<
      { usage: UsageMeter[]; period: string },
      { tenantId: string; tenantType: string; period?: string }
    >({
      query: ({ tenantId, tenantType, period }) => ({
        url: `/api/admin-dashboard/usage/${tenantId}`,
        params: { tenantType, period },
      }),
      providesTags: ['Admin'],
    }),
    getAdminAuditLogs: builder.query<
      { logs: any[]; total: number; limit: number; offset: number; actionTypes: string[] },
      {
        limit?: number
        offset?: number
        tenantId?: string
        actionType?: string
        adminId?: string
        dateFrom?: string
        dateTo?: string
        search?: string
      }
    >({
      query: (params) => ({
        url: '/api/admin-dashboard/audit-logs',
        params,
      }),
      providesTags: ['Admin'],
    }),
    getAdminActivity: builder.query<
      { events: any[]; total: number; limit: number; offset: number },
      { limit?: number; offset?: number; type?: string }
    >({
      query: (params) => ({ url: '/api/admin-dashboard/activity', params }),
      providesTags: ['Admin'],
    }),
    getAdminHealth: builder.query<
      {
        jobFailures: any[] | null
        webhookFailures: any[] | null
        emailFailures: any[] | null
        recentApiErrors: any[]
        dbPool: { total: number; idle: number; waiting: number } | null
      },
      void
    >({
      query: () => '/api/admin-dashboard/health',
      providesTags: ['Admin'],
    }),
    getAdminFinancialOverview: builder.query<
      {
        gmv: number
        outstanding: number
        overdue: number
        revenueByPlan: any[]
        mrr: number
        arr: number
        topTenantsByRevenue: any[]
        topTenantsByOverdue: any[]
      },
      void
    >({
      query: () => '/api/admin-dashboard/financial-overview',
      providesTags: ['Admin'],
    }),
    getAdminSuppliers: builder.query<{ suppliers: any[] }, void>({
      query: () => '/api/admin-dashboard/tenants/suppliers',
      providesTags: ['Admin'],
    }),
    getAdminRestaurants: builder.query<{ restaurants: any[] }, void>({
      query: () => '/api/admin-dashboard/tenants/restaurants',
      providesTags: ['Admin'],
    }),
    getSupplierUsage: builder.query<{ usage: UsageMeter[] }, string>({
      query: (id) => `/api/admin-dashboard/tenants/suppliers/${id}/usage`,
      providesTags: ['Admin'],
    }),
    getRestaurantUsage: builder.query<{ usage: UsageMeter[] }, string>({
      query: (id) => `/api/admin-dashboard/tenants/restaurants/${id}/usage`,
      providesTags: ['Admin'],
    }),
    // Impersonation (admin "view as" tenant)
    getImpersonationStatus: builder.query<
      {
        active: boolean
        tenantId?: string
        tenantType?: string
        tenantName?: string
        expiresAt?: string
      },
      void
    >({
      query: () => '/api/admin-dashboard/impersonate',
      providesTags: ['Admin', 'User'],
    }),
    startImpersonation: builder.mutation<
      { tenantId: string; tenantType: string; tenantName: string; expiresAt: string },
      { tenantId: string; tenantType: 'RESTAURANT' | 'SUPPLIER' }
    >({
      query: (body) => ({
        url: '/api/admin-dashboard/impersonate',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Admin', 'User'],
    }),
    stopImpersonation: builder.mutation<{ stopped: boolean }, void>({
      query: () => ({
        url: '/api/admin-dashboard/impersonate/stop',
        method: 'POST',
      }),
      invalidatesTags: ['Admin', 'User'],
    }),
    getAdminFeatureFlags: builder.query<{ flags: AdminFeatureFlag[] }, void>({
      query: () => '/api/admin-dashboard/feature-flags',
      providesTags: ['AdminFeatureFlags'],
    }),
    updateAdminFeatureFlag: builder.mutation<
      { flag: AdminFeatureFlag },
      { featureKey: string; mode: 'inherit' | 'on' | 'off' }
    >({
      query: ({ featureKey, mode }) => ({
        url: `/api/admin-dashboard/feature-flags/${featureKey}`,
        method: 'PATCH',
        body: { mode },
      }),
      invalidatesTags: ['AdminFeatureFlags', 'AdminTenantFeatures', 'Subscription'],
    }),
    getTenantFeatureOverrides: builder.query<
      { overrides: unknown[]; effectiveFeatures: EffectiveFeature[] },
      { tenantType: 'RESTAURANT' | 'SUPPLIER'; tenantId: string }
    >({
      query: ({ tenantType, tenantId }) =>
        `/api/admin-dashboard/tenants/${tenantType}/${tenantId}/feature-overrides`,
      providesTags: (_r, _e, arg) => [
        { type: 'AdminTenantFeatures' as const, id: `${arg.tenantType}:${arg.tenantId}` },
      ],
    }),
    setTenantFeatureOverride: builder.mutation<
      unknown,
      {
        tenantType: 'RESTAURANT' | 'SUPPLIER'
        tenantId: string
        featureKey: string
        enabled: boolean
        reason?: string
      }
    >({
      query: ({ tenantType, tenantId, featureKey, enabled, reason }) => ({
        url: `/api/admin-dashboard/tenants/${tenantType}/${tenantId}/feature-overrides/${featureKey}`,
        method: 'PUT',
        body: { enabled, reason },
      }),
      invalidatesTags: (_r, _e, arg) => [
        { type: 'AdminTenantFeatures', id: `${arg.tenantType}:${arg.tenantId}` },
        'Subscription',
      ],
    }),
    clearTenantFeatureOverride: builder.mutation<
      unknown,
      { tenantType: 'RESTAURANT' | 'SUPPLIER'; tenantId: string; featureKey: string }
    >({
      query: ({ tenantType, tenantId, featureKey }) => ({
        url: `/api/admin-dashboard/tenants/${tenantType}/${tenantId}/feature-overrides/${featureKey}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_r, _e, arg) => [
        { type: 'AdminTenantFeatures', id: `${arg.tenantType}:${arg.tenantId}` },
        'Subscription',
      ],
    }),
  }),
})

export const {
  useGetMeQuery,
  useGetInviteSessionQuery,
  useGetRegisterStatusQuery,
  useCompleteRegistrationMutation,
  useLogoutMutation,
  useGetProductsQuery,
  useGetProductCategoriesQuery,
  useGetProductTagsQuery,
  useGetProductQuery,
  useCreateProductMutation,
  useUpdateProductMutation,
  useGetOrdersQuery,
  useGetOrderQuery,
  useCreateOrderMutation,
  useCreateManualOrderMutation,
  useUpdateOrderMutation,
  useSendOrderReminderMutation,
  useGetFulfillmentBoardQuery,
  useGetFulfillmentRoutesQuery,
  useGetFulfillmentExceptionsQuery,
  useGetFulfillmentDispatchQuery,
  useGetDriversQuery,
  useCreateDriverMutation,
  useUpdateDriverMutation,
  useDeactivateDriverMutation,
  useAssignDriverToOrderMutation,
  useReassignDriverOnOrderMutation,
  useUpdateOrderDeliveryStatusMutation,
  useSubmitOrderProofOfDeliveryMutation,
  useResolveFulfillmentExceptionMutation,
  useIgnoreFulfillmentExceptionMutation,
  useGetSuppliersQuery,
  useGetSupplierQuery,
  useGetSupplierStatisticsQuery,
  useFollowSupplierMutation,
  useUnfollowSupplierMutation,
  useGetSupplierMeQuery,
  useUpdateSupplierMutation,
  useUploadSupplierLogoMutation,
  useGetRestaurantMeQuery,
  useUpdateRestaurantMutation,
  useUploadRestaurantLogoMutation,
  useGetPresignedUrlMutation,
  useGetRestaurantsQuery,
  useGetRestaurantQuery,
  useGetPricesQuery,
  useCreatePriceMutation,
  useGetInventoryListQuery,
  useGetInventoryQuery,
  useUpdateInventoryMutation,
  useCreateInventoryAdjustmentMutation,
  useGetWarehousesQuery,
  useCreateWarehouseMutation,
  useSetDefaultWarehouseMutation,
  useGetSupplierFulfillmentQuery,
  useUpdateSupplierFulfillmentMutation,
  useGetWarehouseRoutingRulesQuery,
  useSimulateWarehouseRoutingMutation,
  useGetOrderWarehouseAssignmentsQuery,
  useGetDashboardStatsQuery,
  useGetAuditLogsQuery,
  useGeneratePresignedUrlMutation,
  useAttachFileToProductMutation,
  useGetConversationsQuery,
  useGetMessagesQuery,
  useCreateConversationMutation,
  useSendMessageMutation,
  useMarkConversationReadMutation,
  useMarkMessageReadMutation,
  usePinConversationMutation,
  useArchiveConversationMutation,
  useDeleteConversationMutation,
  useGetQuickListsQuery,
  useGetQuickListQuery,
  useCreateQuickListMutation,
  useUpdateQuickListMutation,
  useDeleteQuickListMutation,
  useAddItemToQuickListMutation,
  useRemoveItemFromQuickListMutation,
  useScheduleQuickListMutation,
  useUnscheduleQuickListMutation,
  useGetRestaurantInventoryQuery,
  useGetRestaurantInventoryHistoryQuery,
  useAddRestaurantInventoryMutation,
  useAdjustRestaurantInventoryMutation,
  useGetRestaurantWasteAnalyticsQuery,
  useGetReorderSuggestionsQuery,
  useGetPendingOrdersForReceivingQuery,
  useGetReceivingHistoryQuery,
  useCreateReceivingReportMutation,
  useGetRestaurantInvoicesQuery,
  useGetRestaurantInvoiceQuery,
  useMarkInvoicePaidMutation,
  useGetInvoiceCreditsQuery,
  useGetInvoiceAnalyticsQuery,
  useGetOrderInvoicesQuery,
  useGetSupplierStatementQuery,
  useGetRestaurantExpensesQuery,
  useGetOverdueInvoicesQuery,
  useGetSupplierInvoicesQuery,
  useGetNotificationsQuery,
  useGetNotificationPreferencesQuery,
  useUpdateNotificationPreferencesMutation,
  useGetBranchesQuery,
  useCreateBranchMutation,
  useUpdateBranchMutation,
  useDeleteBranchMutation,
  useSwitchBranchAccountMutation,
  useGetOrgQuery,
  useGetOrgBranchesQuery,
  useCreateOrgBranchMutation,
  useDeactivateOrgBranchMutation,
  useSwitchOrgBranchContextMutation,
  useGetBranchInviteRolesQuery,
  useGetBranchInvitationsQuery,
  useCreateBranchInvitationMutation,
  useRevokeBranchInvitationMutation,
  useRegenerateBranchInvitationMutation,
  useValidateBranchInviteQuery,
  useAcceptBranchInviteMutation,
  useValidateInviteQuery,
  useAcceptInviteMutation,
  useGetRestaurantOrgQuery,
  useGetRestaurantOrgBranchesQuery,
  useCreateRestaurantOrgBranchMutation,
  useSwitchRestaurantOrgBranchContextMutation,
  useDeactivateRestaurantOrgBranchMutation,
  useGetRestaurantMemberInviteRolesQuery,
  useGetRestaurantBranchInviteRolesQuery,
  useGetRestaurantMemberInvitationsQuery,
  useCreateRestaurantMemberInvitationMutation,
  useRevokeRestaurantMemberInvitationMutation,
  useRegenerateRestaurantMemberInvitationMutation,
  useGetRestaurantBranchInvitationsQuery,
  useCreateRestaurantBranchInvitationMutation,
  useRevokeRestaurantBranchInvitationMutation,
  useRegenerateRestaurantBranchInvitationMutation,
  useGetRestaurantTeamQuery,
  useAddRestaurantTeamMemberMutation,
  useDeleteRestaurantTeamMemberMutation,
  useGetTenantRolesQuery,
  useGetTenantRoleUsersQuery,
  useCreateTenantRoleMutation,
  useUpdateTenantRoleMutation,
  useDeleteTenantRoleMutation,
  useAssignTenantUserRoleMutation,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
  useGetPublicRestaurantsQuery,
  useGetPublicRestaurantQuery,
  useGetPublicReservationAvailabilityQuery,
  useLazyGetPublicReservationAvailabilityQuery,
  useCreatePublicReservationMutation,
  useJoinPublicWaitlistMutation,
  useGetPublicReservationDetailsQuery,
  useCancelPublicReservationMutation,
  useReschedulePublicReservationMutation,
  useRequestStaffPortalLinkMutation,
  useCreateStaffPortalSessionMutation,
  useGetStaffPortalDashboardQuery,
  useGetStaffPortalTimeEntriesQuery,
  useStaffPortalCheckInMutation,
  useStaffPortalCheckOutMutation,
  useSubmitStaffPortalPtoMutation,
  useSubmitStaffPortalSwapMutation,
  useGetStaffSelfDashboardQuery,
  useGetStaffSelfTimeEntriesQuery,
  useStaffSelfCheckInMutation,
  useStaffSelfCheckOutMutation,
  useSubmitStaffSelfPtoMutation,
  useSubmitStaffSelfSwapMutation,
  useGetCurrentSubscriptionQuery,
  useGetEntitlementsQuery,
  useGetRecommendationQuery,
  useGetSubscriptionPlansQuery,
  useRecordConversionEventMutation,
  useGetBillingStatusQuery,
  useGetBillingPaymentMethodsQuery,
  useAddBillingPaymentMethodMutation,
  useRemoveBillingPaymentMethodMutation,
  useBillingCheckoutMutation,
  useBillingPayNowMutation,
  useSetBillingAutoRenewMutation,
  useUnlockAdminSubscriptionMutation,
  useExtendAdminFreeTrialMutation,
  useGetSubscriptionUsageQuery,
  useCheckFeatureQuery,
  useGetRestaurantReportQuery,
  useGetSupplierReportQuery,
  useGetDisputesQuery,
  useGetIncomingDisputesQuery,
  useGetDisputeQuery,
  useCreateDisputeMutation,
  useCancelDisputeMutation,
  useReviewDisputeMutation,
  useResolveDisputeMutation,
  useRejectDisputeMutation,
  useGetCreditNotesQuery,
  useApplyCreditNoteMutation,
  useGetPromotionsQuery,
  useGetActivePromotionsQuery,
  useCreatePromotionMutation,
  useUpdatePromotionMutation,
  useActivatePromotionMutation,
  usePausePromotionMutation,
  useDeletePromotionMutation,
  useGetPromotionAnalyticsQuery,
  useGetPromotionPricingQuery,
  useGetDealDetailQuery,
  useGetEligibleDealProductsQuery,
  useRecordDealInteractionMutation,
  useUseDealCouponMutation,
  useMessageFromDealMutation,
  usePromoteDealMutation,
  useResumePromotionMutation,
  usePreviewDealQuery,
  useGetAdminDealsQuery,
  useGetAdminDealInsightsQuery,
  useGetAdminPendingDealsQuery,
  useApproveAdminDealMutation,
  useRejectAdminDealMutation,
  usePauseAdminDealMutation,
  useSubmitPromotionMutation,
  usePreviewCartDealMutation,
  useGetAdminLimitKeysQuery,
  useGetAdminLimitOverridesQuery,
  useCreateAdminPlanLimitOverrideMutation,
  useUpdateAdminTenantLimitOverrideMutation,
  useUpdateAdminPlanLimitOverrideMutation,
  useUpdateAdminPromotionPricingMutation,
  useGetSupplierReviewsQuery,
  useGetSupplierRatingSummaryQuery,
  useGetMyReviewsQuery,
  useCreateSupplierReviewMutation,
  useUpdateReviewMutation,
  useDeleteReviewMutation,
  useGetTenantAuditLogFiltersQuery,
  useGetTenantAuditLogsQuery,
  useGetOrderAmendmentsQuery,
  useCreateOrderAmendmentMutation,
  useAcceptOrderAmendmentMutation,
  useRejectOrderAmendmentMutation,
  useCancelOrderAmendmentMutation,
  useGetVapidPublicKeyQuery,
  useSubscribePushMutation,
  useUnsubscribePushMutation,
  useAcceptWaitlistOfferMutation,
  useDeclineWaitlistOfferMutation,
  useGetAdminOverviewQuery,
  useGetAdminPlatformSettingsQuery,
  useUpdateAdminPlatformSettingsMutation,
  useGetAdminConversionStatsQuery,
  useGetAdminPlansQuery,
  useCreateAdminPlanMutation,
  useUpdateAdminPlanMutation,
  useGetAdminSubscriptionsQuery,
  useUpdateAdminSubscriptionMutation,
  usePreviewSubscriptionPlanChangeMutation,
  useGetTenantUsageQuery,
  useGetAdminAuditLogsQuery,
  useGetAdminActivityQuery,
  useGetAdminHealthQuery,
  useGetAdminSuppliersQuery,
  useGetAdminRestaurantsQuery,
  useGetSupplierUsageQuery,
  useGetRestaurantUsageQuery,
  useGetImpersonationStatusQuery,
  useStartImpersonationMutation,
  useStopImpersonationMutation,
  useGetAdminFeatureFlagsQuery,
  useUpdateAdminFeatureFlagMutation,
  useGetTenantFeatureOverridesQuery,
  useSetTenantFeatureOverrideMutation,
  useClearTenantFeatureOverrideMutation,
} = api as any
