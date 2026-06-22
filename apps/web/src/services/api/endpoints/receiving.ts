import { api } from '../base'
export const receivingApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getPendingOrdersForReceiving: builder.query<any, void>({
      query: () => '/api/receiving/pending-orders',
      providesTags: ['Receiving'],
      ...({
        pollingInterval: 30000,
        skipPollingIfUnfocused: true,
      } as { pollingInterval?: number; skipPollingIfUnfocused?: boolean }),
    }),
    getReceivingHistory: builder.query<any, void>({
      query: () => '/api/receiving/history',
      providesTags: ['Receiving'],
    }),
    createReceivingReport: builder.mutation<any, any>({
      query: (body) => ({
        url: '/api/receiving/receive',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Receiving', 'RestaurantInventory', 'Order'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled
          // Force immediate refetch of receiving history
          dispatch(api.util.invalidateTags(['Receiving']))
        } catch {
          // Error will be handled by the component
        }
      },
    }),
  }),
})
