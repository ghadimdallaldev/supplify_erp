import { api } from '../base'
export const promotionsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getPromotions: builder.query<
      { promotions: Array<Record<string, unknown>> },
      { status?: string } | void
    >({
      query: (params) => ({ url: '/api/promotions', params: params || {} }),
      providesTags: ['Promotions'],
    }),
    getActivePromotions: builder.query<
      { promotions: Array<Record<string, unknown>> },
      { supplierId?: string; categoryId?: string; sort?: string; expiringSoon?: string } | void
    >({
      query: (params) => ({ url: '/api/promotions/active', params: params || {} }),
      providesTags: ['Promotions'],
    }),
    getNewDealsBanner: builder.query<
      { deals: Array<Record<string, unknown>>; summary: Record<string, unknown> | null },
      void
    >({
      query: () => '/api/promotions/new-deals-banner',
      providesTags: ['Promotions'],
      keepUnusedDataFor: 300,
    }),
    dismissDealBanner: builder.mutation<{ dismissed: boolean }, string>({
      query: (dealId) => ({
        url: `/api/promotions/${dealId}/dismiss-banner`,
        method: 'POST',
      }),
      invalidatesTags: ['Promotions'],
    }),
    createPromotion: builder.mutation<
      { promotion: Record<string, unknown> },
      Record<string, unknown>
    >({
      query: (body) => ({ url: '/api/promotions', method: 'POST', body }),
      invalidatesTags: ['Promotions'],
    }),
    updatePromotion: builder.mutation<
      { promotion: Record<string, unknown> },
      { id: string; data: Record<string, unknown> }
    >({
      query: ({ id, data }) => ({ url: `/api/promotions/${id}`, method: 'PATCH', body: data }),
      invalidatesTags: ['Promotions'],
    }),
    activatePromotion: builder.mutation<{ promotion: Record<string, unknown> }, string>({
      query: (id) => ({ url: `/api/promotions/${id}/activate`, method: 'POST' }),
      invalidatesTags: ['Promotions'],
    }),
    payActivation: builder.mutation<
      { promotion: Record<string, unknown> },
      { id: string; paymentMethodId?: string }
    >({
      query: ({ id, paymentMethodId }) => ({
        url: `/api/promotions/${id}/pay-activation`,
        method: 'POST',
        body: paymentMethodId ? { paymentMethodId } : {},
      }),
      invalidatesTags: ['Promotions', 'Billing'],
    }),
    pausePromotion: builder.mutation<{ promotion: Record<string, unknown> }, string>({
      query: (id) => ({ url: `/api/promotions/${id}/pause`, method: 'POST' }),
      invalidatesTags: ['Promotions'],
    }),
    deletePromotion: builder.mutation<{ deleted: boolean }, string>({
      query: (id) => ({ url: `/api/promotions/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Promotions'],
    }),
    getPromotionAnalytics: builder.query<{ analytics: Record<string, unknown> }, string>({
      query: (id) => `/api/promotions/${id}/analytics`,
      providesTags: (_r, _e, id) => [{ type: 'Promotions', id }],
    }),
    getPromotionsAnalyticsSummary: builder.query<
      { summary: Record<string, unknown> },
      { days?: number } | void
    >({
      query: (params) => ({
        url: '/api/promotions/analytics/summary',
        params: params?.days ? { days: params.days } : undefined,
      }),
      providesTags: ['Promotions'],
    }),
    getPromotionPricing: builder.query<{ pricing: Array<Record<string, unknown>> }, void>({
      query: () => '/api/promotions/pricing',
    }),
    getAdminPromotionPricing: builder.query<{ pricing: Array<Record<string, unknown>> }, void>({
      query: () => '/api/promotions/admin/pricing',
      providesTags: ['Promotions'],
    }),
    getDealDetail: builder.query<{ deal: Record<string, unknown> }, string>({
      query: (id) => `/api/promotions/${id}/detail`,
      providesTags: (_r, _e, id) => [{ type: 'Promotions', id }],
    }),
    getEligibleDealProducts: builder.query<
      { products: Array<Record<string, unknown>>; dealId: string; supplierId: string },
      string
    >({
      query: (id) => `/api/promotions/${id}/eligible-products`,
    }),
    recordDealInteraction: builder.mutation<
      { interaction: Record<string, unknown> },
      { id: string; interactionType: string; metadata?: Record<string, unknown> }
    >({
      query: ({ id, ...body }) => ({
        url: `/api/promotions/${id}/interact`,
        method: 'POST',
        body,
      }),
    }),
    useDealCoupon: builder.mutation<
      { couponCode: string; dealId: string; supplierId: string },
      string
    >({
      query: (id) => ({ url: `/api/promotions/${id}/use-coupon`, method: 'POST' }),
    }),
  }),
})
