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

export const authApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getMe: builder.query<User, void>({
      query: () => '/auth/me',
      providesTags: ['User'],
      keepUnusedDataFor: 120,
    }),
    getAdminPreferences: builder.query<{ preferences: AdminUserPreferences }, void>({
      query: () => '/auth/admin-preferences',
      providesTags: ['User'],
      keepUnusedDataFor: 300,
    }),
    updateAdminPreferences: builder.mutation<
      { preferences: AdminUserPreferences },
      Partial<AdminUserPreferences>
    >({
      query: (body) => ({
        url: '/auth/admin-preferences',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['User'],
    }),
    getInviteSession: builder.query<
      { id: string; email: string; displayName: string } | null,
      void
    >({
      query: () => '/auth/session',
      keepUnusedDataFor: 0,
    }),
    logout: builder.mutation<{ message?: string; keycloakLogoutUrl?: string }, void>({
      query: () => ({
        url: '/auth/logout',
        method: 'POST',
      }),
      invalidatesTags: ['User'],
    }),
    getRegisterStatus: builder.query<{ needsSetup: boolean }, void>({
      query: () => '/api/register/status',
      providesTags: ['RegisterStatus'],
      keepUnusedDataFor: 120,
      transformResponse: (response: { needsSetup?: boolean }) => ({
        needsSetup: Boolean(response?.needsSetup),
      }),
    }),
    submitLegalReacceptance: builder.mutation<
      { legalStatus: import('../../../types').LegalAcceptanceStatus },
      LegalAcceptancePayload
    >({
      query: (legalAcceptance) => ({
        url: '/auth/legal-acceptance',
        method: 'POST',
        body: { legalAcceptance },
      }),
      invalidatesTags: ['User'],
    }),
    completeRegistration: builder.mutation<
      { tenantType: string; tenant: unknown },
      {
        accountType: 'RESTAURANT' | 'SUPPLIER'
        businessName: string
        phone?: string
        legalAcceptance: LegalAcceptancePayload
      }
    >({
      query: (body) => ({
        url: '/api/register/complete',
        method: 'POST',
        body,
      }),
      transformResponse: (response: { tenantType?: string; tenant?: unknown }) => ({
        tenantType: response.tenantType as string,
        tenant: response.tenant,
      }),
    }),
  }),
})
