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
  SubscriptionPlanChangePreview,
  UsageMeter,
  PublicRestaurant,
  PublicAvailabilityResponse,
  PublicReservationSummary,
  StaffPortalSession,
  StaffPortalDashboard,
  StaffPtoRequest,
  StaffShiftSwap,
  PublicReservationDetails,
} from '../types'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

// Custom baseQuery to unwrap API response envelope
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const baseQueryWithUnwrap = async (args: any, api: any, extraOptions: any) => {
  const result = await fetchBaseQuery({
    baseUrl: API_URL,
    credentials: 'include',
    prepareHeaders: (headers) => {
      // CSRF token will be handled by the server
      return headers
    },
  })(args, api, extraOptions)

  // Handle 401 Unauthorized errors (token expired or invalid)
  const err = result.error as { status?: number | string; data?: unknown } | undefined
  if (err && (err.status === 401 || err.status === 'FETCH_ERROR')) {
    // Check if it's an authentication error
    const errorData = err.data
    if (
      typeof errorData === 'object' &&
      (errorData as { error?: { name?: string } })?.error?.name === 'UNAUTHORIZED'
    ) {
      // Token expired or invalid - redirect to login
      if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
        // Clear any auth state
        window.location.href = '/login?expired=true'
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
      // Check for authentication errors in the response
      if (data.error?.name === 'UNAUTHORIZED' || data.error?.name === 'JWT_EXPIRED') {
        // Redirect to login on auth errors
        if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
          window.location.href = '/login?expired=true'
        }
      }
      // Dispatch monetization soft-wall when blocked by plan/limit (Phase B)
      const respErr = data.error
      if (respErr?.name === 'LIMIT_EXCEEDED' || respErr?.name === 'FEATURE_NOT_AVAILABLE') {
        try {
          const { showMonetizationBlock } = await import(
            /* @vite-ignore */ '../features/monetization/monetizationSlice'
          )
          api.dispatch(
            showMonetizationBlock({
              type: respErr.name === 'LIMIT_EXCEEDED' ? 'limit' : 'feature',
              payload: ((respErr as { details?: unknown }).details || {}) as
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
    'Subscription',
    'Admin',
    'Reservation',
    'OrdersCalendar',
    'QuickList',
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
    logout: builder.mutation<void, void>({
      query: () => ({
        url: '/auth/logout',
        method: 'POST',
      }),
      invalidatesTags: ['User'],
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

    // Warehouse endpoints
    getWarehouses: builder.query<{ warehouses: any[] }, void>({
      query: () => '/api/warehouses',
      providesTags: ['Inventory'],
    }),

    // Admin endpoints
    getDashboardStats: builder.query<any, void>({
      query: () => '/api/admin/dashboard',
      providesTags: ['User'],
      transformResponse: (response: any) => {
        console.log('Dashboard transformResponse - raw response:', response)
        const stats = response?.stats || {}
        console.log('Dashboard transformResponse - extracted stats:', stats)
        return stats
      },
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
      { sessionToken: string; expiresAt: string },
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
    recordConversionEvent: builder.mutation<
      { recorded: boolean },
      { eventType: 'VIEW_PLANS' | 'OPEN_UPGRADE'; metadata?: Record<string, unknown> }
    >({
      query: (body) => ({
        url: '/api/subscriptions/conversion-event',
        method: 'POST',
        body,
      }),
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
    getAdminAuditLogs: builder.query<{ logs: any[]; limit: number; offset: number }, any>({
      query: (params) => ({
        url: '/api/admin-dashboard/audit-logs',
        params,
      }),
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
  }),
})

export const {
  useGetMeQuery,
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
  useGetWarehousesQuery,
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
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
  useGetPublicRestaurantsQuery,
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
  useSubmitStaffPortalPtoMutation,
  useSubmitStaffPortalSwapMutation,
  useGetStaffSelfDashboardQuery,
  useSubmitStaffSelfPtoMutation,
  useSubmitStaffSelfSwapMutation,
  useGetCurrentSubscriptionQuery,
  useGetEntitlementsQuery,
  useGetRecommendationQuery,
  useRecordConversionEventMutation,
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
  useGetAdminSuppliersQuery,
  useGetAdminRestaurantsQuery,
  useGetSupplierUsageQuery,
  useGetRestaurantUsageQuery,
  useGetImpersonationStatusQuery,
  useStartImpersonationMutation,
  useStopImpersonationMutation,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} = api as any
