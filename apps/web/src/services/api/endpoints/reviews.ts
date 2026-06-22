import { api } from '../base'
export const reviewsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getSupplierReviews: builder.query<
      { reviews: Array<Record<string, unknown>>; total?: number },
      { supplierId: string; limit?: number; offset?: number }
    >({
      query: ({ supplierId, limit, offset }) => ({
        url: `/api/reviews/suppliers/${supplierId}`,
        params: { limit, offset },
      }),
      providesTags: (_r, _e, { supplierId }) => [{ type: 'Reviews', id: supplierId }],
    }),
    getSupplierRatingSummary: builder.query<{ summary: Record<string, unknown> }, string>({
      query: (supplierId) => `/api/reviews/suppliers/${supplierId}/summary`,
      providesTags: (_r, _e, supplierId) => [{ type: 'Reviews', id: `summary-${supplierId}` }],
    }),
    getMyReviews: builder.query<
      { reviews: Array<Record<string, unknown>> },
      { limit?: number; offset?: number } | void
    >({
      query: (params) => ({ url: '/api/reviews/my', params: params || {} }),
      providesTags: ['Reviews'],
    }),
    createSupplierReview: builder.mutation<
      { review: Record<string, unknown> },
      { supplierId: string; body: Record<string, unknown> }
    >({
      query: ({ supplierId, body }) => ({
        url: `/api/reviews/suppliers/${supplierId}`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_r, _e, { supplierId }) => [
        { type: 'Reviews', id: supplierId },
        { type: 'Reviews', id: `summary-${supplierId}` },
        'Reviews',
      ],
    }),
    updateReview: builder.mutation<
      { review: Record<string, unknown> },
      { id: string; body: Record<string, unknown> }
    >({
      query: ({ id, body }) => ({ url: `/api/reviews/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Reviews'],
    }),
    deleteReview: builder.mutation<{ deleted: boolean }, string>({
      query: (id) => ({ url: `/api/reviews/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Reviews'],
    }),
  }),
})
