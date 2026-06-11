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

export const disputesApi = api.injectEndpoints({
  endpoints: (builder) => ({
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
  }),
})
