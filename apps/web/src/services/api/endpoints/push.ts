import { api } from '../base'
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
