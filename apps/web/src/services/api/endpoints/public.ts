import { api } from '../base'
import type {
  PublicRestaurant,
  PublicSupplier,
  PublicSupplierProductsResponse,
  QuoteRequestSummary,
  QuoteRequestDetail,
  SupplierQuoteInboxResponse,
  SupplierQuoteInboxStatus,
  SupplierQuoteInboxSort,
  SupplierQuoteRequestDetail,
  QuoteCartPayload,
  PublicAvailabilityResponse,
  PublicReservationSummary,
  PublicReservationDetails,
  PublicReservationManagePayload,
} from '../../../types'
export const publicApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getPublicRestaurant: builder.query<PublicRestaurant, string>({
      query: (idOrSlug) => ({
        url: `/api/public/restaurants/${encodeURIComponent(idOrSlug)}`,
        credentials: 'omit',
      }),
    }),
    getPublicSupplier: builder.query<PublicSupplier, string>({
      query: (idOrSlug) => ({
        url: `/api/public/suppliers/${encodeURIComponent(idOrSlug)}`,
        credentials: 'omit',
      }),
    }),
    resolvePublicHost: builder.query<
      { tenantId: string; tenantType: string; slug: string | null },
      string
    >({
      query: (host) => ({
        url: '/api/public/resolve-host',
        params: { host },
        credentials: 'omit',
      }),
    }),
    getPublicSupplierProducts: builder.query<
      PublicSupplierProductsResponse,
      { idOrSlug: string; page?: number; limit?: number; q?: string; category?: string }
    >({
      query: ({ idOrSlug, page, limit, q, category }) => ({
        url: `/api/public/suppliers/${encodeURIComponent(idOrSlug)}/products`,
        params: { page, limit, q, category },
        credentials: 'omit',
      }),
    }),
    getPublicSupplierPricedProducts: builder.query<
      PublicSupplierProductsResponse,
      { idOrSlug: string; page?: number; limit?: number; q?: string; category?: string }
    >({
      query: ({ idOrSlug, page, limit, q, category }) => ({
        url: `/api/public/suppliers/${encodeURIComponent(idOrSlug)}/products/priced`,
        params: { page, limit, q, category },
      }),
    }),

    getQuoteRequests: builder.query<
      {
        quoteRequests: QuoteRequestSummary[]
        pagination: { page: number; limit: number; total: number }
      },
      { page?: number; limit?: number; status?: string }
    >({
      query: (params) => ({ url: '/api/quote-requests', params }),
      providesTags: ['QuoteRequest'],
    }),
    getQuoteRequestDetail: builder.query<QuoteRequestDetail, string>({
      query: (id) => `/api/quote-requests/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'QuoteRequest', id }],
    }),
    getQuoteRequestCompare: builder.query<QuoteRequestDetail, string>({
      query: (id) => `/api/quote-requests/${id}/compare`,
      providesTags: (_r, _e, id) => [{ type: 'QuoteRequest', id }],
    }),
    createQuoteRequest: builder.mutation<
      { quoteRequest: QuoteRequestSummary; itemCount: number; supplierCount: number },
      {
        items: Array<{ productId: string; quantity: number; unit?: string; notes?: string }>
        supplierIds: string[]
        note?: string
        neededBy?: string
      }
    >({
      query: (body) => ({ url: '/api/quote-requests', method: 'POST', body }),
      invalidatesTags: ['QuoteRequest'],
    }),
    convertQuoteResponseToCart: builder.mutation<
      QuoteCartPayload,
      { quoteRequestId: string; supplierRowId: string }
    >({
      query: ({ quoteRequestId, supplierRowId }) => ({
        url: `/api/quote-requests/${quoteRequestId}/suppliers/${supplierRowId}/to-cart`,
        method: 'POST',
      }),
    }),
    updateQuoteRequestStatus: builder.mutation<
      QuoteRequestDetail,
      { quoteRequestId: string; status: 'closed' | 'cancelled' }
    >({
      query: ({ quoteRequestId, status }) => ({
        url: `/api/quote-requests/${quoteRequestId}`,
        method: 'PATCH',
        body: { status },
      }),
      invalidatesTags: (_r, _e, { quoteRequestId }) => [
        'QuoteRequest',
        { type: 'QuoteRequest', id: quoteRequestId },
      ],
    }),
    getSupplierQuoteInbox: builder.query<
      SupplierQuoteInboxResponse,
      {
        page?: number
        limit?: number
        status?: SupplierQuoteInboxStatus
        search?: string
        sort?: SupplierQuoteInboxSort
      }
    >({
      query: (params) => ({ url: '/api/quote-requests/supplier/inbox', params }),
      providesTags: ['QuoteRequest'],
    }),
    getSupplierQuoteRequestDetail: builder.query<SupplierQuoteRequestDetail, string>({
      query: (quoteRequestSupplierId) =>
        `/api/quote-requests/supplier/inbox/${quoteRequestSupplierId}`,
      providesTags: (_r, _e, id) => [{ type: 'QuoteRequest', id }],
    }),
    submitSupplierQuoteResponse: builder.mutation<
      SupplierQuoteRequestDetail,
      {
        quoteRequestSupplierId: string
        note?: string
        items: Array<{
          quoteRequestItemId: string
          isAvailable?: boolean
          unitPrice?: number | null
          currency?: string
          quantity?: number | null
          deliveryDate?: string | null
          note?: string | null
          substituteProductId?: string | null
        }>
      }
    >({
      query: ({ quoteRequestSupplierId, ...body }) => ({
        url: `/api/quote-requests/supplier/inbox/${quoteRequestSupplierId}/respond`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['QuoteRequest'],
    }),
    declineSupplierQuoteRequest: builder.mutation<
      SupplierQuoteRequestDetail,
      { quoteRequestSupplierId: string; reason?: string }
    >({
      query: ({ quoteRequestSupplierId, ...body }) => ({
        url: `/api/quote-requests/supplier/inbox/${quoteRequestSupplierId}/decline`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['QuoteRequest'],
    }),
    getPublicReservationAvailability: builder.query<
      PublicAvailabilityResponse,
      { restaurantId: string; partySize: number; date: string; manageToken?: string }
    >({
      query: ({ restaurantId, partySize, date, manageToken }) => ({
        url: '/api/public/reservations/availability',
        params: {
          restaurantId,
          partySize,
          date,
          ...(manageToken ? { manageToken } : {}),
        },
        credentials: 'omit',
      }),
    }),
    joinPublicWaitlist: builder.mutation<
      { message: string },
      {
        restaurantId: string
        partySize: number
        desiredAt?: string
        customerName: string
        customerPhone: string
        notes?: string
      }
    >({
      query: (body) => ({
        url: '/api/public/reservations/waitlist',
        method: 'POST',
        body,
        credentials: 'omit',
      }),
    }),
    createPublicReservation: builder.mutation<
      { reservation: PublicReservationSummary },
      {
        restaurantId: string
        partySize: number
        scheduledAt: string
        durationMinutes?: number
        customerName: string
        customerEmail: string
        customerPhone: string
        notes?: string
        occasion?: string
        allergies?: string
        depositAcknowledged?: boolean
      }
    >({
      query: (body) => ({
        url: '/api/public/reservations',
        method: 'POST',
        body,
        credentials: 'omit',
      }),
      invalidatesTags: [{ type: 'Reservation', id: 'BOARD' }],
    }),
    getPublicReservationDetails: builder.query<PublicReservationManagePayload, string>({
      query: (token) => ({
        url: '/api/public/reservations/manage',
        params: { token },
        credentials: 'omit',
      }),
      providesTags: (_result, _error, token) => [{ type: 'Reservation', id: token }],
    }),
    submitPublicReservationReview: builder.mutation<
      { review: Record<string, unknown> },
      {
        token: string
        overallRating: number
        foodRating?: number
        serviceRating?: number
        ambianceRating?: number
        comment?: string
        reviewerName?: string
      }
    >({
      query: (body) => ({
        url: '/api/public/reservations/manage/review',
        method: 'POST',
        body,
        credentials: 'omit',
      }),
      invalidatesTags: (_result, _error, { token }) => [{ type: 'Reservation', id: token }],
    }),
    cancelPublicReservation: builder.mutation<
      { reservation: PublicReservationDetails },
      { token: string }
    >({
      query: (body) => ({
        url: '/api/public/reservations/manage/cancel',
        method: 'POST',
        body,
        credentials: 'omit',
      }),
      invalidatesTags: (_result, _error, { token }) => [
        { type: 'Reservation', id: token },
        { type: 'Reservation', id: 'BOARD' },
      ],
    }),
    reschedulePublicReservation: builder.mutation<
      { reservation: PublicReservationDetails },
      { token: string; scheduledAt: string }
    >({
      query: (body) => ({
        url: '/api/public/reservations/manage/reschedule',
        method: 'POST',
        body,
        credentials: 'omit',
      }),
      invalidatesTags: (_result, _error, { token }) => [
        { type: 'Reservation', id: token },
        { type: 'Reservation', id: 'BOARD' },
      ],
    }),
  }),
})
