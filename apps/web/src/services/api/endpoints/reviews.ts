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

export const reviewsApi = api.injectEndpoints({
  endpoints: (builder) => ({
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
  }),
})
