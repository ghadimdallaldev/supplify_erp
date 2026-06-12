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
  ReorderAssistanceResponse,
  ReorderAiExplainResult,
  ReorderAiAskResult,
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

export const restaurantInventoryApi = api.injectEndpoints({
  endpoints: (builder) => ({
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
    getExpiryLots: builder.query<
      any,
      { status?: string; supplierId?: string; storageLocation?: string; categoryId?: string }
    >({
      query: (params) => ({
        url: '/api/restaurant-inventory/expiry',
        params,
      }),
      providesTags: ['RestaurantInventory'],
    }),
    getExpirySummary: builder.query<any, void>({
      query: () => '/api/restaurant-inventory/expiry/summary',
      providesTags: ['RestaurantInventory'],
    }),
    createExpiryLot: builder.mutation<any, Record<string, unknown>>({
      query: (body) => ({
        url: '/api/restaurant-inventory/expiry',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['RestaurantInventory'],
    }),
    updateExpiryLot: builder.mutation<any, { lotId: string; data: Record<string, unknown> }>({
      query: ({ lotId, data }) => ({
        url: `/api/restaurant-inventory/expiry/${lotId}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: ['RestaurantInventory'],
    }),
    deleteExpiryLot: builder.mutation<any, string>({
      query: (lotId) => ({
        url: `/api/restaurant-inventory/expiry/${lotId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['RestaurantInventory'],
    }),
    getReorderReminders: builder.query<any, void>({
      query: () => '/api/restaurant-inventory/reorder-reminders',
      providesTags: ['RestaurantInventory'],
    }),
    getReorderAssistance: builder.query<ReorderAssistanceResponse, void>({
      query: () => '/api/restaurant-inventory/reorder-assistance',
      providesTags: ['RestaurantInventory'],
    }),
    explainReorderAssistance: builder.mutation<
      ReorderAiExplainResult,
      { branchId?: string } | void
    >({
      query: (body) => ({
        url: '/api/restaurant-inventory/reorder-assistance/explain',
        method: 'POST',
        body: body ?? {},
      }),
    }),
    askReorderAssistance: builder.mutation<
      ReorderAiAskResult,
      { query: string; branchId?: string }
    >({
      query: (body) => ({
        url: '/api/restaurant-inventory/reorder-assistance/ask',
        method: 'POST',
        body,
      }),
    }),
    suppressReorderSuggestion: builder.mutation<
      unknown,
      {
        scopeType: 'product' | 'cadence' | 'supplier_product'
        scopeId: string
        action: 'snooze' | 'not_needed'
        snoozeDays?: number
      }
    >({
      query: (body) => ({
        url: '/api/restaurant-inventory/reorder-assistance/suppress',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['RestaurantInventory'],
    }),
  }),
})
