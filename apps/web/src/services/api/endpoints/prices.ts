import { api } from '../base'
import type { Price, CreatePriceRequest } from '../../../types'
export const pricesApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getPrices: builder.query<Price[], string>({
      query: (productId) => `/api/prices/product/${productId}`,
      providesTags: ['Price'],
    }),
    createPrice: builder.mutation<Price, CreatePriceRequest>({
      query: (body) => ({
        url: '/api/prices',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Price'],
    }),
  }),
})
