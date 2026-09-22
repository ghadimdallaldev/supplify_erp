import { api } from '../base'
import type {
  CheaperBuyResponse,
  PriceChangeAlertResponse,
  ProductPriceHistory,
} from '../../../types/priceIntelligence'

export type PriceHistoryParams = {
  productId: string
  days?: number
  limit?: number
}

export type PriceChangeParams = {
  days?: number
  minChangePct?: number
  direction?: 'up' | 'down' | 'any'
  limit?: number
}

export type CheaperBuyParams = {
  days?: number
  minChangePct?: number
  limit?: number
}

export const priceIntelligenceApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getProductPriceHistory: builder.query<ProductPriceHistory, PriceHistoryParams>({
      query: ({ productId, ...params }) => ({
        url: `/api/restaurant-intelligence/price-history/${productId}`,
        params,
      }),
      providesTags: (_r, _e, { productId }) => [{ type: 'PriceIntelligence', id: productId }],
    }),
    getPriceChangeAlerts: builder.query<PriceChangeAlertResponse, PriceChangeParams | void>({
      query: (params) => ({
        url: '/api/restaurant-intelligence/price-changes',
        params: params || {},
      }),
      providesTags: [{ type: 'PriceIntelligence', id: 'CHANGES' }],
    }),
    getCheaperBuyOptions: builder.query<CheaperBuyResponse, CheaperBuyParams | void>({
      query: (params) => ({
        url: '/api/restaurant-intelligence/cheaper-buys',
        params: params || {},
      }),
      providesTags: [{ type: 'PriceIntelligence', id: 'CHEAPER' }],
    }),
  }),
})

export const {
  useGetProductPriceHistoryQuery,
  useGetPriceChangeAlertsQuery,
  useGetCheaperBuyOptionsQuery,
} = priceIntelligenceApi
