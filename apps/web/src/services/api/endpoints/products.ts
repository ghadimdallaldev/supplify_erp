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

export const productsApi = api.injectEndpoints({
  endpoints: (builder) => ({
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
      keepUnusedDataFor: 300,
    }),
    getProductTags: builder.query<{ tags: string[] }, void>({
      query: () => '/api/products/tags',
      providesTags: ['Product'],
      keepUnusedDataFor: 300,
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
    getProductFavorites: builder.query<{ products: Product[] }, void>({
      query: () => '/api/products/favorites',
      providesTags: ['ProductFavorite'],
    }),
    favoriteProduct: builder.mutation<
      { productId: string; favorited: boolean },
      { productId: string }
    >({
      query: ({ productId }) => ({
        url: '/api/products/favorites',
        method: 'POST',
        body: { productId },
      }),
      invalidatesTags: ['Product', 'ProductFavorite'],
    }),
    unfavoriteProduct: builder.mutation<{ productId: string; favorited: boolean }, string>({
      query: (productId) => ({
        url: `/api/products/favorites/${productId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Product', 'ProductFavorite'],
    }),
  }),
})
