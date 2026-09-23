import { api } from '../base'
import type {
  CheaperBuyResponse,
  PriceChangeAlertResponse,
  ProductPriceHistory,
} from '../../../types/priceIntelligence'
import type {
  FoodCostWarningResponse,
  MenuProfitabilityResponse,
} from '../../../types/marginIntelligence'
import type { WasteIntelligenceResponse } from '../../../types/wasteIntelligence'
import type { SupplierReliabilityResponse } from '../../../types/supplierReliability'
import type { OverOrderingIntelligenceResponse } from '../../../types/overOrderingIntelligence'
import type { InvoiceAnomalyResponse } from '../../../types/invoiceAnomalyIntelligence'

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

export type FoodCostWarningParams = {
  limit?: number
  minOveragePct?: number
}

export type MenuProfitabilityParams = {
  limit?: number
  maxMarginPct?: number
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
    getFoodCostWarnings: builder.query<FoodCostWarningResponse, FoodCostWarningParams | void>({
      query: (params) => ({
        url: '/api/restaurant-intelligence/food-cost-warnings',
        params: params || {},
      }),
      // Recalculating a recipe changes these, so share the recipe-costing tag.
      providesTags: [{ type: 'PriceIntelligence', id: 'FOOD_COST' }, 'RecipeCosting'],
    }),
    getWasteIntelligence: builder.query<
      WasteIntelligenceResponse,
      { days?: number; limit?: number } | void
    >({
      query: (params) => ({
        url: '/api/restaurant-intelligence/waste-intelligence',
        params: params || {},
      }),
      providesTags: [{ type: 'PriceIntelligence', id: 'WASTE' }, 'RestaurantWaste'],
    }),
    getSupplierReliability: builder.query<SupplierReliabilityResponse, { days?: number } | void>({
      query: (params) => ({
        url: '/api/restaurant-intelligence/supplier-reliability',
        params: params || {},
      }),
      providesTags: [{ type: 'PriceIntelligence', id: 'SUPPLIER_RELIABILITY' }, 'Receiving'],
    }),
    getOverOrderingIntelligence: builder.query<
      OverOrderingIntelligenceResponse,
      { days?: number; limit?: number } | void
    >({
      query: (params) => ({
        url: '/api/restaurant-intelligence/over-ordering',
        params: params || {},
      }),
      providesTags: [
        { type: 'PriceIntelligence', id: 'OVER_ORDERING' },
        'RestaurantInventory',
        'Receiving',
        'RestaurantWaste',
      ],
    }),
    getInvoiceAnomalies: builder.query<
      InvoiceAnomalyResponse,
      { days?: number; limit?: number; minChangePct?: number } | void
    >({
      query: (params) => ({
        url: '/api/restaurant-intelligence/invoice-anomalies',
        params: params || {},
      }),
      providesTags: [{ type: 'PriceIntelligence', id: 'INVOICE_ANOMALIES' }],
    }),
    getMenuProfitability: builder.query<MenuProfitabilityResponse, MenuProfitabilityParams | void>({
      query: (params) => ({
        url: '/api/restaurant-intelligence/menu-profitability',
        params: params || {},
      }),
      providesTags: [{ type: 'PriceIntelligence', id: 'MENU_MARGIN' }, 'RecipeCosting'],
    }),
  }),
})

export const {
  useGetProductPriceHistoryQuery,
  useGetPriceChangeAlertsQuery,
  useGetCheaperBuyOptionsQuery,
  useGetFoodCostWarningsQuery,
  useGetWasteIntelligenceQuery,
  useGetSupplierReliabilityQuery,
  useGetOverOrderingIntelligenceQuery,
  useGetInvoiceAnomaliesQuery,
  useGetMenuProfitabilityQuery,
} = priceIntelligenceApi
