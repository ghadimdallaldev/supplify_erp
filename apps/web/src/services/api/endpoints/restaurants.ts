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

export type TenantBranding = {
  brandPrimary: string
  brandMid: string
  brandLight: string
  brandPale: string
  brandUltra: string
  brandAccent: string | null
  brandDisplayName: string | null
  logoUrl: string | null
  isDefault: boolean
}

export const restaurantsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getRestaurants: builder.query<RestaurantsResponse, RestaurantFilters>({
      query: (params) => ({
        url: '/api/restaurants',
        params,
      }),
      providesTags: ['Restaurant'],
    }),
    getRestaurant: builder.query<Restaurant, string>({
      query: (id) => `/api/restaurants/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Restaurant', id }],
    }),
    getRestaurantMe: builder.query<{ restaurant: Restaurant }, void>({
      query: () => '/api/restaurants/me',
      providesTags: ['Restaurant'],
      keepUnusedDataFor: 300,
    }),
    getTenantBranding: builder.query<
      { branding: TenantBranding },
      { tenantType: 'RESTAURANT' | 'SUPPLIER' }
    >({
      query: ({ tenantType }) =>
        tenantType === 'RESTAURANT' ? '/api/restaurants/me/branding' : '/api/suppliers/me/branding',
      providesTags: (_result, _error, { tenantType }) => [
        { type: 'Branding', id: tenantType },
        'Restaurant',
        'Supplier',
      ],
    }),
    updateTenantBranding: builder.mutation<
      { branding: TenantBranding },
      {
        tenantType: 'RESTAURANT' | 'SUPPLIER'
        brandPrimary?: string | null
        brandAccent?: string | null
        brandDisplayName?: string | null
      }
    >({
      query: ({ tenantType, ...body }) => ({
        url:
          tenantType === 'RESTAURANT'
            ? '/api/restaurants/me/branding'
            : '/api/suppliers/me/branding',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: (_result, _error, { tenantType }) => [
        { type: 'Branding', id: tenantType },
        'Restaurant',
        'Supplier',
      ],
    }),
    updateRestaurant: builder.mutation<Restaurant, { id: string; data: Partial<Restaurant> }>({
      query: ({ id, data }) => ({
        url: `/api/restaurants/${id}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Restaurant', id },
        { type: 'Restaurant', id: 'LIST' },
      ],
    }),
    uploadRestaurantLogo: builder.mutation<Restaurant, { id: string; logoUrl: string }>({
      query: ({ id, logoUrl }) => ({
        url: `/api/restaurants/${id}/logo`,
        method: 'POST',
        body: { logoUrl },
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Restaurant', id },
        { type: 'Restaurant', id: 'LIST' },
      ],
    }),
    getRestaurantDeliveryLocations: builder.query<
      {
        restaurant: {
          id: string
          name: string
          deliveryLatitude?: number | null
          deliveryLongitude?: number | null
          deliveryLocationLabel?: string | null
          deliveryAddressNotes?: string | null
          coordinatesAvailable?: boolean
        }
        branches: Array<{
          id: string
          name: string
          code?: string | null
          deliveryLatitude?: number | null
          deliveryLongitude?: number | null
          deliveryLocationLabel?: string | null
          deliveryAddressNotes?: string | null
          coordinatesAvailable?: boolean
        }>
      },
      void
    >({
      query: () => '/api/restaurants/me/delivery-locations',
      providesTags: ['Restaurant'],
    }),
    updateRestaurantDeliveryLocation: builder.mutation<
      { location: Record<string, unknown> },
      {
        deliveryLatitude?: number | null
        deliveryLongitude?: number | null
        deliveryLocationLabel?: string | null
        deliveryAddressNotes?: string | null
      }
    >({
      query: (body) => ({
        url: '/api/restaurants/me/delivery-location',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Restaurant'],
    }),
    updateBranchDeliveryLocation: builder.mutation<
      { location: Record<string, unknown> },
      {
        branchId: string
        deliveryLatitude?: number | null
        deliveryLongitude?: number | null
        deliveryLocationLabel?: string | null
        deliveryAddressNotes?: string | null
      }
    >({
      query: ({ branchId, ...body }) => ({
        url: `/api/restaurants/branches/${branchId}/delivery-location`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Restaurant', 'Branch'],
    }),
  }),
})
