import { api } from '../base'
export const amendmentsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getOrderAmendments: builder.query<{ amendments: Array<Record<string, unknown>> }, string>({
      query: (orderId) => `/api/orders/${orderId}/amendments`,
      providesTags: (_r, _e, orderId) => [{ type: 'Amendments', id: orderId }],
    }),
    createOrderAmendment: builder.mutation<
      { amendment: Record<string, unknown> },
      { orderId: string; body: Record<string, unknown> }
    >({
      query: ({ orderId, body }) => ({
        url: `/api/orders/${orderId}/amendments`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_r, _e, { orderId }) => [{ type: 'Amendments', id: orderId }, 'Order'],
    }),
    acceptOrderAmendment: builder.mutation<
      { amendment: Record<string, unknown>; orderTotal?: number },
      { orderId: string; amendmentId: string; responseNotes?: string }
    >({
      query: ({ orderId, amendmentId, responseNotes }) => ({
        url: `/api/orders/${orderId}/amendments/${amendmentId}/accept`,
        method: 'POST',
        body: responseNotes ? { responseNotes } : {},
      }),
      invalidatesTags: (_r, _e, { orderId }) => [{ type: 'Amendments', id: orderId }, 'Order'],
    }),
    rejectOrderAmendment: builder.mutation<
      { amendment: Record<string, unknown> },
      { orderId: string; amendmentId: string; responseNotes: string }
    >({
      query: ({ orderId, amendmentId, responseNotes }) => ({
        url: `/api/orders/${orderId}/amendments/${amendmentId}/reject`,
        method: 'POST',
        body: { responseNotes },
      }),
      invalidatesTags: (_r, _e, { orderId }) => [{ type: 'Amendments', id: orderId }],
    }),
    cancelOrderAmendment: builder.mutation<
      { amendment: Record<string, unknown> },
      { orderId: string; amendmentId: string }
    >({
      query: ({ orderId, amendmentId }) => ({
        url: `/api/orders/${orderId}/amendments/${amendmentId}/cancel`,
        method: 'POST',
      }),
      invalidatesTags: (_r, _e, { orderId }) => [{ type: 'Amendments', id: orderId }],
    }),
  }),
})
