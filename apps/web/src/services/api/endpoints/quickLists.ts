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

export const quickListsApi = api.injectEndpoints({
  endpoints: (builder) => ({
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
  }),
})
