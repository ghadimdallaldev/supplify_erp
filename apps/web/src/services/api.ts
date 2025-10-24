import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: API_URL,
    credentials: 'include',
    prepareHeaders: (headers) => {
      // CSRF token will be handled by the server
      return headers
    },
  }),
  tagTypes: ['User', 'Product', 'Order', 'Supplier', 'Restaurant', 'Price', 'Inventory'],
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
      invalidatesTags: ['Product'],
    }),
    updateProduct: builder.mutation<Product, { id: string; data: UpdateProductRequest }>({
      query: ({ id, data }) => ({
        url: `/api/products/${id}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: (result, error, { id }) => [{ type: 'Product', id }],
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

    // Admin endpoints
    getDashboardStats: builder.query<DashboardStats, void>({
      query: () => '/api/admin/dashboard',
      providesTags: ['User'],
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
  useUpdateOrderMutation,
  useGetSuppliersQuery,
  useGetSupplierQuery,
  useGetRestaurantsQuery,
  useGetRestaurantQuery,
  useGetPricesQuery,
  useCreatePriceMutation,
  useGetInventoryQuery,
  useUpdateInventoryMutation,
  useGetDashboardStatsQuery,
  useGetAuditLogsQuery,
  useGeneratePresignedUrlMutation,
  useAttachFileToProductMutation,
} = api
