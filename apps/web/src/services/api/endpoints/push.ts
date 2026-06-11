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

export const pushApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getVapidPublicKey: builder.query<{ publicKey: string }, void>({
      query: () => '/api/push/vapid-public-key',
    }),
    subscribePush: builder.mutation<
      { subscription: Record<string, unknown> },
      { endpoint: string; keys: { p256dh: string; auth: string } }
    >({
      query: (body) => ({ url: '/api/push/subscribe', method: 'POST', body }),
    }),
    unsubscribePush: builder.mutation<{ removed: boolean }, { endpoint: string }>({
      query: (body) => ({ url: '/api/push/unsubscribe', method: 'DELETE', body }),
    }),

    acceptWaitlistOffer: builder.mutation<
      {
        reservation: Record<string, unknown>
        waitlist: Record<string, unknown>
        manageToken?: string
        manageUrl?: string
      },
      string
    >({
      query: (token) => ({
        url: `/api/public/reservations/waitlist/${token}/accept`,
        method: 'POST',
        credentials: 'omit',
      }),
      invalidatesTags: ['Reservation'],
    }),
    declineWaitlistOffer: builder.mutation<
      { message: string; waitlist: Record<string, unknown> },
      string
    >({
      query: (token) => ({
        url: `/api/public/reservations/waitlist/${token}/decline`,
        method: 'POST',
        credentials: 'omit',
      }),
      invalidatesTags: ['Reservation'],
    }),
  }),
})
