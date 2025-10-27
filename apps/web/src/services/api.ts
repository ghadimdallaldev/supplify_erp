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
  tagTypes: ['User', 'Product', 'Order', 'Supplier', 'Restaurant', 'Price', 'Inventory', 'RestaurantInventory', 'Chat', 'Receiving'],
  endpoints: (builder) => ({
    // Auth endpoints
    getMe: builder.query<User, void>({
      query: () => '/auth/me',
      providesTags: ['User'],
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
      invalidatesTags: (result, error, { id }) => [{ type: 'Order', id }],
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
      invalidatesTags: ['Supplier'],
    }),
    unfollowSupplier: builder.mutation<any, string>({
      query: (id) => ({
        url: `/api/suppliers/${id}/follow`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Supplier'],
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
      transformResponse: (response: any) => response.data?.stats || {},
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
    // Receiving endpoints
    getPendingOrdersForReceiving: builder.query<any, void>({
      query: () => '/api/receiving/pending-orders',
      providesTags: ['Receiving'],
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
      invalidatesTags: ['Receiving', 'RestaurantInventory'],
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
  useGetRestaurantInventoryQuery,
  useGetRestaurantInventoryHistoryQuery,
  useAddRestaurantInventoryMutation,
  useAdjustRestaurantInventoryMutation,
  useGetPendingOrdersForReceivingQuery,
  useGetReceivingHistoryQuery,
  useCreateReceivingReportMutation,
} = api
