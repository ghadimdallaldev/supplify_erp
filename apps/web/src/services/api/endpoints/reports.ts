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

export const reportsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getRestaurantReport: builder.query<
      { data: Array<Record<string, unknown>>; meta?: Record<string, unknown> },
      { path: string; from?: string; to?: string; branchId?: string; granularity?: string }
    >({
      query: ({ path, from, to, branchId, granularity }) => ({
        url: `/api/reports/restaurant/${path}`,
        params: { from, to, branch_id: branchId, granularity },
      }),
      transformResponse: (response: unknown) => normalizeReportResponse(response),
      providesTags: ['Reports'],
    }),
    getSupplierReport: builder.query<
      { data: Array<Record<string, unknown>>; meta?: Record<string, unknown> },
      { path: string; from?: string; to?: string; granularity?: string }
    >({
      query: ({ path, from, to, granularity }) => ({
        url: `/api/reports/supplier/${path}`,
        params: { from, to, granularity },
      }),
      transformResponse: (response: unknown) => normalizeReportResponse(response),
      providesTags: ['Reports'],
    }),
  }),
})
