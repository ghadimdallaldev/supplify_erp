import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    'Chat',
    'Receiving',
    'RestaurantFinance',
    'Notification',
    'Branch',
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
      invalidatesTags: ['User', 'RegisterStatus'],
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
        const tags: Array<{ type: 'Order'; id: string } | 'Order' | 'Receiving'> = [
          { type: 'Order', id },
          'Order',
        ]
        if (data?.status === 'COMPLETED') {
          tags.push('Receiving')
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
      void
    >({
      query: () => '/api/fulfillment/board',
      providesTags: ['Fulfillment'],
    }),
    getFulfillmentWaves: builder.query<
      {
        waves: Array<{
          id: string
          waveNumber: string
          scheduledDate: string
          status: string
          orderCount: number
        }>
      },
      void
    >({
      query: () => '/api/fulfillment/waves',
      providesTags: ['Fulfillment'],
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
      void
    >({
      query: () => '/api/fulfillment/routes',
      providesTags: ['Fulfillment'],
    }),
    getFulfillmentExceptions: builder.query<
      {
        exceptions: Array<{
          id: string
          orderId: string
          orderLabel: string
          exceptionType: string
          productName?: string | null
          quantityExpected?: number | null
          quantityActual?: number | null
          damageDescription?: string | null
          notes?: string | null
          createdAt: string
        }>
      },
      void
    >({
      query: () => '/api/fulfillment/exceptions',
      providesTags: ['Fulfillment'],
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
      }
    >({
      query: (body) => ({
        url: '/api/warehouses',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Inventory'],
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
      }
    >({
      query: (body) => ({
        url: '/api/restaurant-inventory/adjust',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['RestaurantInventory'],
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
      { restaurantId: string; partySize: number; date: string }
    >({
      query: ({ restaurantId, partySize, date }) => ({
        url: '/api/public/reservations/availability',
        params: { restaurantId, partySize, date },
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
        customerEmail?: string
        customerPhone?: string
        notes?: string
      }
    >({
      query: (body) => ({
        url: '/api/public/reservations',
        method: 'POST',
        body,
        credentials: 'omit',
      }),
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
      invalidatesTags: (_result, _error, { token }) => [{ type: 'Reservation', id: token }],
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
      invalidatesTags: (_result, _error, { token }) => [{ type: 'Reservation', id: token }],
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
      { id: string; reason?: string }
    >({
      query: ({ id, reason }) => ({
        url: `/api/admin-dashboard/subscriptions/${id}/unlock`,
        method: 'POST',
        body: { reason },
      }),
      invalidatesTags: ['Admin', 'Billing', 'Subscription'],
    }),

    // Admin Dashboard endpoints
    getAdminOverview: builder.query<any, void>({
      query: () => '/api/admin-dashboard/overview',
      providesTags: ['Admin'],
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
    updateAdminPlan: builder.mutation<SubscriptionPlan, { id: string; data: any }>({
      query: ({ id, data }) => ({
        url: `/api/admin-dashboard/plans/${id}`,
        method: 'PATCH',
        body: data,
      }),
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
  useGetFulfillmentWavesQuery,
  useGetFulfillmentRoutesQuery,
  useGetFulfillmentExceptionsQuery,
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
  useGetRestaurantTeamQuery,
  useAddRestaurantTeamMemberMutation,
  useDeleteRestaurantTeamMemberMutation,
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
  useGetSubscriptionUsageQuery,
  useCheckFeatureQuery,
  useGetAdminOverviewQuery,
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} = api as any
