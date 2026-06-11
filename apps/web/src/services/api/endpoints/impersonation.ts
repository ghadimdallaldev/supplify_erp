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

export const impersonationApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getImpersonationStatus: builder.query<
      {
        active: boolean
        tenantId?: string
        tenantType?: string
        tenantName?: string
        expiresAt?: string
      },
      void
    >({
      query: () => '/api/admin-dashboard/impersonate',
      providesTags: ['Admin', 'User'],
    }),
    startImpersonation: builder.mutation<
      {
        tenantId: string
        tenantType: string
        tenantName: string
        expiresAt: string
        redirectTo?: string
      },
      {
        tenantId: string
        tenantType: 'RESTAURANT' | 'SUPPLIER'
        acknowledgeSuspended?: boolean
      }
    >({
      query: (body) => ({
        url: '/api/admin-dashboard/impersonate',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Admin', 'User'],
    }),
    stopImpersonation: builder.mutation<{ stopped: boolean }, void>({
      query: () => ({
        url: '/api/admin-dashboard/impersonate/stop',
        method: 'POST',
      }),
      invalidatesTags: ['Admin', 'User'],
    }),
    getAdminFeatureFlags: builder.query<{ flags: AdminFeatureFlag[] }, void>({
      query: () => '/api/admin-dashboard/feature-flags',
      providesTags: ['AdminFeatureFlags'],
    }),
    updateAdminFeatureFlag: builder.mutation<
      { flag: AdminFeatureFlag },
      { featureKey: string; mode: 'inherit' | 'on' | 'off' }
    >({
      query: ({ featureKey, mode }) => ({
        url: `/api/admin-dashboard/feature-flags/${featureKey}`,
        method: 'PATCH',
        body: { mode },
      }),
      invalidatesTags: ['AdminFeatureFlags', 'AdminTenantFeatures', 'Subscription'],
    }),
    getTenantFeatureOverrides: builder.query<
      { overrides: unknown[]; effectiveFeatures: EffectiveFeature[] },
      { tenantType: 'RESTAURANT' | 'SUPPLIER'; tenantId: string }
    >({
      query: ({ tenantType, tenantId }) =>
        `/api/admin-dashboard/tenants/${tenantType}/${tenantId}/feature-overrides`,
      providesTags: (_r, _e, arg) => [
        { type: 'AdminTenantFeatures' as const, id: `${arg.tenantType}:${arg.tenantId}` },
      ],
    }),
    setTenantFeatureOverride: builder.mutation<
      unknown,
      {
        tenantType: 'RESTAURANT' | 'SUPPLIER'
        tenantId: string
        featureKey: string
        enabled: boolean
        reason?: string
      }
    >({
      query: ({ tenantType, tenantId, featureKey, enabled, reason }) => ({
        url: `/api/admin-dashboard/tenants/${tenantType}/${tenantId}/feature-overrides/${featureKey}`,
        method: 'PUT',
        body: { enabled, reason },
      }),
      invalidatesTags: (_r, _e, arg) => [
        { type: 'AdminTenantFeatures', id: `${arg.tenantType}:${arg.tenantId}` },
        'Subscription',
      ],
    }),
    clearTenantFeatureOverride: builder.mutation<
      unknown,
      { tenantType: 'RESTAURANT' | 'SUPPLIER'; tenantId: string; featureKey: string }
    >({
      query: ({ tenantType, tenantId, featureKey }) => ({
        url: `/api/admin-dashboard/tenants/${tenantType}/${tenantId}/feature-overrides/${featureKey}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_r, _e, arg) => [
        { type: 'AdminTenantFeatures', id: `${arg.tenantType}:${arg.tenantId}` },
        'Subscription',
      ],
    }),
  }),
})
