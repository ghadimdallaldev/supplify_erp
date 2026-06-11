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
  StaffAvailability,
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

export const staffPortalApi = api.injectEndpoints({
  endpoints: (builder) => ({
    requestStaffPortalLink: builder.mutation<
      { message: string; sessionToken?: string; expiresAt?: string },
      { email: string }
    >({
      query: (body) => ({
        url: '/api/public/staff/request-link',
        method: 'POST',
        body,
        credentials: 'omit',
      }),
    }),
    createStaffPortalSession: builder.mutation<StaffPortalSession, { token: string }>({
      query: (body) => ({
        url: '/api/public/staff/session',
        method: 'POST',
        body,
        credentials: 'omit',
      }),
    }),
    getStaffPortalDashboard: builder.query<StaffPortalDashboard, { token: string }>({
      query: ({ token }) => ({
        url: '/api/public/staff/dashboard',
        params: { token },
        credentials: 'omit',
      }),
    }),
    submitStaffPortalPto: builder.mutation<
      StaffPtoRequest,
      {
        token: string
        type: StaffPtoRequest['type']
        startDate: string
        endDate: string
        hoursRequested?: number
        reason?: string
      }
    >({
      query: (body) => ({
        url: '/api/public/staff/pto',
        method: 'POST',
        body,
        credentials: 'omit',
      }),
      invalidatesTags: ['StaffPto'],
    }),
    submitStaffPortalSwap: builder.mutation<
      StaffShiftSwap,
      {
        token: string
        shiftId: string
        proposedCoverId?: string
        reason?: string
      }
    >({
      query: (body) => ({
        url: '/api/public/staff/swaps',
        method: 'POST',
        body,
        credentials: 'omit',
      }),
      invalidatesTags: ['StaffSwap'],
    }),
    getStaffPortalTimeEntries: builder.query<StaffTimeEntry[], { token: string }>({
      query: ({ token }) => ({
        url: '/api/public/staff/time-entries',
        params: { token },
        credentials: 'omit',
      }),
      transformResponse: (response: unknown) => normalizeListResponse<StaffTimeEntry>(response),
    }),
    staffPortalCheckIn: builder.mutation<StaffTimeEntry, { token: string; note?: string }>({
      query: (body) => ({
        url: '/api/public/staff/check-in',
        method: 'POST',
        body,
        credentials: 'omit',
      }),
      invalidatesTags: ['StaffTimeEntry'],
    }),
    staffPortalCheckOut: builder.mutation<StaffTimeEntry, { token: string; id: string }>({
      query: ({ token, id }) => ({
        url: `/api/public/staff/time-entries/${id}/check-out`,
        method: 'POST',
        body: { token },
        credentials: 'omit',
      }),
      invalidatesTags: ['StaffTimeEntry'],
    }),
    getStaffSelfDashboard: builder.query<StaffPortalDashboard, void>({
      query: () => ({
        url: '/api/staff/self/dashboard',
      }),
      providesTags: [
        'StaffMember',
        'StaffShift',
        'StaffPto',
        'StaffSwap',
        'StaffAnnouncement',
        'StaffDocument',
      ],
    }),
    getStaffSelfTimeEntries: builder.query<StaffTimeEntry[], void>({
      query: () => '/api/staff/self/time-entries',
      transformResponse: (response: unknown) => normalizeListResponse<StaffTimeEntry>(response),
      providesTags: ['StaffTimeEntry'],
    }),
    staffSelfCheckIn: builder.mutation<StaffTimeEntry, { note?: string }>({
      query: (body) => ({
        url: '/api/staff/self/check-in',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['StaffTimeEntry', 'StaffMember', 'StaffShift'],
    }),
    staffSelfCheckOut: builder.mutation<StaffTimeEntry, { id: string }>({
      query: ({ id }) => ({
        url: `/api/staff/self/time-entries/${id}/check-out`,
        method: 'POST',
        body: {},
      }),
      invalidatesTags: ['StaffTimeEntry'],
    }),
    submitStaffSelfPto: builder.mutation<
      StaffPtoRequest,
      {
        type: StaffPtoRequest['type']
        startDate: string
        endDate: string
        hoursRequested?: number
        reason?: string
      }
    >({
      query: (body) => ({
        url: '/api/staff/self/pto',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['StaffPto', 'StaffMember', 'StaffShift'],
    }),
    submitStaffSelfSwap: builder.mutation<
      StaffShiftSwap,
      {
        shiftId: string
        proposedCoverId?: string
        reason?: string
      }
    >({
      query: (body) => ({
        url: '/api/staff/self/swaps',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['StaffSwap', 'StaffMember', 'StaffShift'],
    }),
    acknowledgeStaffPortalAnnouncement: builder.mutation<
      void,
      { token: string; announcementId: string }
    >({
      query: ({ token, announcementId }) => ({
        url: `/api/public/staff/announcements/${announcementId}/ack`,
        method: 'POST',
        body: { token },
        credentials: 'omit',
      }),
      invalidatesTags: ['StaffAnnouncement'],
    }),
    acknowledgeStaffSelfAnnouncement: builder.mutation<void, string>({
      query: (announcementId) => ({
        url: `/api/staff/self/announcements/${announcementId}/ack`,
        method: 'POST',
        body: {},
      }),
      invalidatesTags: ['StaffAnnouncement', 'StaffMember'],
    }),
    getStaffSelfAvailability: builder.query<StaffAvailability[], void>({
      query: () => '/api/staff/self/availability',
      transformResponse: (response: unknown) => normalizeListResponse<StaffAvailability>(response),
      providesTags: ['StaffAvailability'],
    }),
    getStaffPortalAvailability: builder.query<StaffAvailability[], { token: string }>({
      query: ({ token }) => ({
        url: '/api/public/staff/availability',
        params: { token },
        credentials: 'omit',
      }),
      transformResponse: (response: unknown) => normalizeListResponse<StaffAvailability>(response),
      providesTags: ['StaffAvailability'],
    }),
    setStaffSelfAvailability: builder.mutation<
      StaffAvailability,
      {
        weekday: number
        availability: { blocks: Array<{ start: string; end: string }> }
        notes?: string
      }
    >({
      query: (body) => ({
        url: '/api/staff/self/availability',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['StaffAvailability'],
    }),
    setStaffPortalAvailability: builder.mutation<
      StaffAvailability,
      {
        token: string
        weekday: number
        availability: { blocks: Array<{ start: string; end: string }> }
        notes?: string
      }
    >({
      query: ({ token, ...body }) => ({
        url: '/api/public/staff/availability',
        method: 'POST',
        body: { token, ...body },
        credentials: 'omit',
      }),
      invalidatesTags: ['StaffAvailability'],
    }),
  }),
})
