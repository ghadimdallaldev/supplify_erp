import { api } from '../base'
export const disputesApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getDisputes: builder.query<
      { disputes: Array<Record<string, unknown>> },
      { status?: string } | void
    >({
      query: (params) => ({ url: '/api/disputes', params: params || {} }),
      providesTags: ['Disputes'],
    }),
    getIncomingDisputes: builder.query<
      { disputes: Array<Record<string, unknown>> },
      { status?: string } | void
    >({
      query: (params) => ({ url: '/api/disputes/incoming', params: params || {} }),
      providesTags: ['Disputes'],
    }),
    getDispute: builder.query<Record<string, unknown>, string>({
      query: (id) => `/api/disputes/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'Disputes', id }],
    }),
    createDispute: builder.mutation<Record<string, unknown>, Record<string, unknown>>({
      query: (body) => ({ url: '/api/disputes', method: 'POST', body }),
      invalidatesTags: ['Disputes', 'Order', 'Receiving'],
    }),
    cancelDispute: builder.mutation<Record<string, unknown>, string>({
      query: (id) => ({ url: `/api/disputes/${id}/cancel`, method: 'POST' }),
      invalidatesTags: ['Disputes'],
    }),
    reviewDispute: builder.mutation<Record<string, unknown>, string>({
      query: (id) => ({ url: `/api/disputes/${id}/review`, method: 'POST' }),
      invalidatesTags: ['Disputes'],
    }),
    resolveDispute: builder.mutation<
      Record<string, unknown>,
      { id: string; body: Record<string, unknown> }
    >({
      query: ({ id, body }) => ({ url: `/api/disputes/${id}/resolve`, method: 'POST', body }),
      invalidatesTags: ['Disputes', 'CreditNotes', 'Order'],
    }),
    rejectDispute: builder.mutation<
      Record<string, unknown>,
      { id: string; resolutionNotes: string }
    >({
      query: ({ id, resolutionNotes }) => ({
        url: `/api/disputes/${id}/reject`,
        method: 'POST',
        body: { resolutionNotes },
      }),
      invalidatesTags: ['Disputes'],
    }),
  }),
})
