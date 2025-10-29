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
  DashboardStats,
  AuditLog,
  AuditLogFilters,
  AuditLogsResponse,
  PresignedUrlRequest,
  PresignedUrlResponse,
  AttachFileRequest,
  Attachment,
  ReorderSuggestionsResponse,
  SubscriptionPlan,
  Subscription,
  FeatureFlag,
  FeatureFlagOverride,
  UsageMeter,
} from '../types'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

// Custom baseQuery to unwrap API response envelope
const baseQueryWithUnwrap = async (args, api, extraOptions) => {
  const result = await fetchBaseQuery({
    baseUrl: API_URL,
    credentials: 'include',
    prepareHeaders: (headers) => {
      // CSRF token will be handled by the server
      return headers
    },
  })(args, api, extraOptions);
  
  // Unwrap the API response envelope { ok: true/false, data: ..., error: ... }
  if (result.data && typeof result.data === 'object' && 'ok' in result.data) {
    if (result.data.ok) {
      // Return the actual data
      return { ...result, data: result.data.data };
    } else {
      // Return an error
      return { ...result, error: { status: 'CUSTOM_ERROR', data: result.data.error } };
    }
  }
  
  return result;
};

export const api = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithUnwrap,
  tagTypes: ['User', 'Product', 'Order', 'Supplier', 'Restaurant', 'Price', 'Inventory', 'RestaurantInventory', 'Chat', 'Receiving', 'RestaurantFinance', 'Notification', 'Subscription', 'Admin'],
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
    getProduct: builder.query<Product, string>({
      query: (id) => `/api/products/${id}`,
      providesTags: (result, error, id) => [{ type: 'Product', id }],
    }),
    createProduct: builder.mutation<Product, CreateProductRequest>({
      query: (body) => ({
        url: '/api/products',
        method: 'POST',
        body,
      }),
      async onQueryStarted(arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled
          // Manually invalidate and refetch all product lists
          dispatch(
            api.util.invalidateTags(['Product'])
          )
        } catch {
          // Error handling
        }
      },
    }),
    updateProduct: builder.mutation<Product, { id: string; data: UpdateProductRequest }>({
      query: ({ id, data }) => ({
        url: `/api/products/${id}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: (result, error, { id }) => [{ type: 'Product', id }, 'Product'],
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
      providesTags: (result, error, id) => [{ type: 'Order', id }],
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
      invalidatesTags: (result, error, { id }) => [
        { type: 'Order', id },
        'Order', // Also invalidate all orders list
      ],
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
      providesTags: (result, error, id) => [{ type: 'Supplier', id }],
    }),
    followSupplier: builder.mutation<any, string>({
      query: (id) => ({
        url: `/api/suppliers/${id}/follow`,
        method: 'POST',
      }),
      invalidatesTags: (result, error, id) => [
        { type: 'Supplier', id },
        'Supplier',
      ],
    }),
    unfollowSupplier: builder.mutation<any, string>({
      query: (id) => ({
        url: `/api/suppliers/${id}/follow`,
        method: 'DELETE',
      }),
      invalidatesTags: (result, error, id) => [
        { type: 'Supplier', id },
        'Supplier',
      ],
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
      providesTags: (result, error, id) => [{ type: 'Restaurant', id }],
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
    updateInventory: builder.mutation<Inventory, { productId: string; data: UpdateInventoryRequest }>({
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
        console.log('Dashboard transformResponse - raw response:', response);
        const stats = response?.stats || {};
        console.log('Dashboard transformResponse - extracted stats:', stats);
        return stats;
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
    attachFileToProduct: builder.mutation<Attachment, { productId: string; data: AttachFileRequest }>({
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
    sendMessage: builder.mutation<any, { conversationId: string; content: string; messageType?: string; orderId?: string }>({
      query: ({ conversationId, ...body }) => ({
        url: `/api/chat/conversations/${conversationId}/messages`,
        method: 'POST',
        body,
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
    addRestaurantInventory: builder.mutation<any, { productId: string; quantity: number; reason?: string }>({
      query: (body) => ({
        url: '/api/restaurant-inventory/add',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['RestaurantInventory'],
    }),
    adjustRestaurantInventory: builder.mutation<any, { productId: string; adjustmentType: 'WASTAGE' | 'SPOILAGE' | 'COUNT_CORRECTION' | 'OTHER'; quantity: number; reason?: string }>({
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
    }),
    getReceivingHistory: builder.query<any, void>({
      query: () => '/api/receiving/history',
      providesTags: ['Receiving'],
      // Refetch when component mounts if data is stale
      refetchOnMountOrArgChange: true,
    }),
    createReceivingReport: builder.mutation<any, any>({
      query: (body) => ({
        url: '/api/receiving/receive',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Receiving', 'RestaurantInventory', 'Order'],
    }),

    // Quick Lists endpoints
    getQuickLists: builder.query<any, void>({
      query: () => '/api/quick-lists',
      providesTags: ['QuickList'],
    }),
    getQuickList: builder.query<any, string>({
      query: (id) => `/api/quick-lists/${id}`,
      providesTags: (result, error, id) => [{ type: 'QuickList', id }],
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
      invalidatesTags: (result, error, { id }) => [{ type: 'QuickList', id }],
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
      providesTags: (result, error, id) => [{ type: 'RestaurantFinance', id }],
    }),
    markInvoicePaid: builder.mutation<any, { invoiceId: string; data: any }>({
      query: ({ invoiceId, data }) => ({
        url: `/api/restaurant-finance/invoices/${invoiceId}/pay`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (result, error, { invoiceId }) => [{ type: 'RestaurantFinance', id: invoiceId }, 'RestaurantFinance'],
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

    // Subscription endpoints
    getCurrentSubscription: builder.query<{ subscription: Subscription }, void>({
      query: () => '/api/subscriptions/current',
      providesTags: ['Subscription'],
    }),
    getSubscriptionUsage: builder.query<UsageMeter & { meterType: string }, string>({
      query: (meterType) => `/api/subscriptions/usage/${meterType}`,
      providesTags: ['Subscription'],
    }),
    checkFeature: builder.query<{ featureKey: string; isEnabled: boolean }, string>({
      query: (featureKey) => `/api/subscriptions/features/${featureKey}`,
      providesTags: ['Subscription'],
    }),

    // Admin Dashboard endpoints
    getAdminOverview: builder.query<any, void>({
      query: () => '/api/admin-dashboard/overview',
      providesTags: ['Admin'],
    }),
    getAdminPlans: builder.query<{ plans: SubscriptionPlan[] }, void>({
      query: () => '/api/admin-dashboard/plans',
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
    getAdminFeatureFlags: builder.query<{ flags: FeatureFlag[] }, void>({
      query: () => '/api/admin-dashboard/feature-flags',
      providesTags: ['Admin'],
    }),
    updateAdminFeatureFlag: builder.mutation<FeatureFlag, { key: string; data: any }>({
      query: ({ key, data }) => ({
        url: `/api/admin-dashboard/feature-flags/${key}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: ['Admin'],
    }),
    getTenantFeatureFlags: builder.query<{ overrides: FeatureFlagOverride[] }, { tenantId: string; tenantType: string }>({
      query: ({ tenantId, tenantType }) => ({
        url: `/api/admin-dashboard/tenants/${tenantId}/feature-flags`,
        params: { tenantType },
      }),
      providesTags: ['Admin'],
    }),
    setTenantFeatureFlag: builder.mutation<FeatureFlagOverride, any>({
      query: ({ tenantId, ...body }) => ({
        url: `/api/admin-dashboard/tenants/${tenantId}/feature-flags`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Admin'],
    }),
    deleteTenantFeatureFlag: builder.mutation<any, { tenantId: string; featureKey: string; tenantType: string }>({
      query: ({ tenantId, featureKey, tenantType }) => ({
        url: `/api/admin-dashboard/tenants/${tenantId}/feature-flags/${featureKey}`,
        method: 'DELETE',
        params: { tenantType },
      }),
      invalidatesTags: ['Admin'],
    }),
    getTenantUsage: builder.query<{ usage: UsageMeter[]; period: string }, { tenantId: string; tenantType: string; period?: string }>({
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
  }),
})

export const {
  useGetMeQuery,
  useLogoutMutation,
  useGetProductsQuery,
  useGetProductQuery,
  useCreateProductMutation,
  useUpdateProductMutation,
  useGetOrdersQuery,
  useGetOrderQuery,
  useCreateOrderMutation,
  useCreateManualOrderMutation,
  useUpdateOrderMutation,
  useGetSuppliersQuery,
  useGetSupplierQuery,
  useFollowSupplierMutation,
  useUnfollowSupplierMutation,
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
  useGetPendingOrdersForReceivingQuery,
  useGetReceivingHistoryQuery,
  useCreateReceivingReportMutation,
  useGetRestaurantInvoicesQuery,
  useGetRestaurantInvoiceQuery,
  useMarkInvoicePaidMutation,
  useGetSupplierStatementQuery,
  useGetRestaurantExpensesQuery,
  useGetOverdueInvoicesQuery,
  useGetNotificationsQuery,
  useGetNotificationPreferencesQuery,
  useUpdateNotificationPreferencesMutation,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
  useGetCurrentSubscriptionQuery,
  useGetSubscriptionUsageQuery,
  useCheckFeatureQuery,
  useGetAdminOverviewQuery,
  useGetAdminPlansQuery,
  useCreateAdminPlanMutation,
  useUpdateAdminPlanMutation,
  useGetAdminSubscriptionsQuery,
  useUpdateAdminSubscriptionMutation,
  useGetAdminFeatureFlagsQuery,
  useUpdateAdminFeatureFlagMutation,
  useGetTenantFeatureFlagsQuery,
  useSetTenantFeatureFlagMutation,
  useDeleteTenantFeatureFlagMutation,
    useGetTenantUsageQuery,
    useGetAdminAuditLogsQuery,
    useGetAdminSuppliersQuery,
    useGetAdminRestaurantsQuery,
    useGetSupplierUsageQuery,
    useGetRestaurantUsageQuery,
} = api
