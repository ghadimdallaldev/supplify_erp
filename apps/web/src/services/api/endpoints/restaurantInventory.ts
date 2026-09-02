import { api } from '../base'
import type {
  ReorderSuggestionsResponse,
  ReorderAssistanceResponse,
  ReorderAiExplainResult,
  ReorderAiAskResult,
  ReorderAiRecommendResponse,
} from '../../../types'
export const INVENTORY_IMPORT_CSV_TEMPLATE = `sku,quantity,reason
RICE-5KG,25,Opening stock count
OIL-1L,12,
TOMATO-CRATE,8,Delivery from morning run`

export type RestaurantInventoryImportPreviewRow = {
  rowNumber: number
  status: 'valid' | 'error'
  mapped: Record<string, unknown>
  errors: Array<{ field: string; message: string }>
  isNewSku?: boolean
}

export type RestaurantInventoryImportLimitWarning = {
  meter: string
  current: number
  limit: number
  newSkusInFile: number
  projected: number
}

export type RestaurantInventoryImportPreview = {
  headers: string[]
  preview: RestaurantInventoryImportPreviewRow[]
  totalRows: number
  validCount: number
  errorCount: number
  newSkuCount: number
  limitWarning: RestaurantInventoryImportLimitWarning | null
  errors: Array<{ rowNumber: number; errors: Array<{ field: string; message: string }> }>
}

export type RestaurantInventoryImportResult = {
  summary: { added: number; updated: number; failed: number }
  errors: Array<{ rowNumber: number; errors: Array<{ field: string; message: string }> }>
}

export const restaurantInventoryApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getRestaurantInventory: builder.query<
      {
        inventory: unknown[]
        total?: number
        limit?: number
        offset?: number
        summary?: { inStock: number; lowStock: number; outOfStock: number }
      },
      {
        limit?: number
        offset?: number
        q?: string
        status?: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK'
        supplierId?: string
        category?: string
      } | void
    >({
      query: (params) => ({
        url: '/api/restaurant-inventory',
        params: params ?? { limit: 100 },
      }),
      providesTags: ['RestaurantInventory'],
    }),
    getRestaurantInventoryHistory: builder.query<any, { limit?: number }>({
      query: (params) => ({
        url: '/api/restaurant-inventory/history',
        params,
      }),
      providesTags: ['RestaurantInventory'],
    }),
    addRestaurantInventory: builder.mutation<
      any,
      { productId: string; quantity: number; reason?: string }
    >({
      query: (body) => ({
        url: '/api/restaurant-inventory/add',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['RestaurantInventory'],
    }),
    adjustRestaurantInventory: builder.mutation<
      any,
      {
        productId: string
        adjustmentType: 'WASTAGE' | 'SPOILAGE' | 'COUNT_CORRECTION' | 'OTHER'
        quantity: number
        reason?: string
        unitCost?: number
        wasteCategory?:
          | 'OVER_PRODUCTION'
          | 'SPOILAGE'
          | 'BREAKAGE'
          | 'EXPIRED'
          | 'OVERPORTIONING'
          | 'OTHER'
      }
    >({
      query: (body) => ({
        url: '/api/restaurant-inventory/adjust',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['RestaurantInventory', 'RestaurantWaste'],
    }),
    getRestaurantWasteAnalytics: builder.query<
      {
        analytics: Array<Record<string, unknown>>
        summary: Record<string, unknown>
        trend: Array<Record<string, unknown>>
        period: number
      },
      { period?: number }
    >({
      query: ({ period = 30 } = {}) => ({
        url: '/api/restaurant-inventory/waste-analytics',
        params: { period },
      }),
      providesTags: ['RestaurantWaste'],
    }),
    getReorderSuggestions: builder.query<ReorderSuggestionsResponse, void>({
      query: () => '/api/restaurant-inventory/reorder-suggestions',
      providesTags: ['RestaurantInventory'],
    }),
    getExpiryLots: builder.query<
      any,
      { status?: string; supplierId?: string; storageLocation?: string; categoryId?: string }
    >({
      query: (params) => ({
        url: '/api/restaurant-inventory/expiry',
        params,
      }),
      providesTags: ['RestaurantInventory'],
    }),
    getExpirySummary: builder.query<any, void>({
      query: () => '/api/restaurant-inventory/expiry/summary',
      providesTags: ['RestaurantInventory'],
    }),
    createExpiryLot: builder.mutation<any, Record<string, unknown>>({
      query: (body) => ({
        url: '/api/restaurant-inventory/expiry',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['RestaurantInventory'],
    }),
    updateExpiryLot: builder.mutation<any, { lotId: string; data: Record<string, unknown> }>({
      query: ({ lotId, data }) => ({
        url: `/api/restaurant-inventory/expiry/${lotId}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: ['RestaurantInventory'],
    }),
    deleteExpiryLot: builder.mutation<any, string>({
      query: (lotId) => ({
        url: `/api/restaurant-inventory/expiry/${lotId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['RestaurantInventory'],
    }),
    getReorderReminders: builder.query<any, void>({
      query: () => '/api/restaurant-inventory/reorder-reminders',
      providesTags: ['RestaurantInventory'],
    }),
    getReorderAssistance: builder.query<ReorderAssistanceResponse, void>({
      query: () => '/api/restaurant-inventory/reorder-assistance',
      providesTags: ['RestaurantInventory'],
    }),
    explainReorderAssistance: builder.mutation<
      ReorderAiExplainResult,
      { branchId?: string } | void
    >({
      query: (body) => ({
        url: '/api/restaurant-inventory/reorder-assistance/explain',
        method: 'POST',
        body: body ?? {},
      }),
    }),
    askReorderAssistance: builder.mutation<
      ReorderAiAskResult,
      { query: string; branchId?: string }
    >({
      query: (body) => ({
        url: '/api/restaurant-inventory/reorder-assistance/ask',
        method: 'POST',
        body,
      }),
    }),
    aiRecommendReorderAssistance: builder.mutation<
      ReorderAiRecommendResponse,
      { branchId?: string; productIds?: string[]; limit?: number } | void
    >({
      query: (body) => ({
        url: '/api/restaurant-inventory/reorder-assistance/ai-recommend',
        method: 'POST',
        body: body ?? {},
      }),
    }),
    feedbackReorderAssistance: builder.mutation<
      unknown,
      {
        productId: string
        source: 'ai' | 'forecast' | 'rule_based'
        actionTaken: 'accepted' | 'adjusted' | 'rejected' | 'not_needed' | 'incorrect' | 'snoozed'
        recommendedQuantity?: number | null
        finalQuantity?: number | null
        selectedSupplierId?: string | null
        feedbackReason?: string | null
      }
    >({
      query: (body) => ({
        url: '/api/restaurant-inventory/reorder-assistance/feedback',
        method: 'POST',
        body,
      }),
    }),
    applyReorderAssistance: builder.mutation<
      { added: Array<{ productId: string; quickListId?: string; message: string }> },
      {
        items: Array<{ productId: string; qty: number; supplierId?: string }>
        branchId?: string
      }
    >({
      query: (body) => ({
        url: '/api/restaurant-inventory/reorder-assistance/apply',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['RestaurantInventory'],
    }),
    suppressReorderSuggestion: builder.mutation<
      unknown,
      {
        scopeType: 'product' | 'cadence' | 'supplier_product'
        scopeId: string
        action: 'snooze' | 'not_needed'
        snoozeDays?: number
      }
    >({
      query: (body) => ({
        url: '/api/restaurant-inventory/reorder-assistance/suppress',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['RestaurantInventory'],
    }),
    previewRestaurantInventoryImport: builder.mutation<
      RestaurantInventoryImportPreview,
      { csv: string }
    >({
      query: (body) => ({
        url: '/api/restaurant-inventory/import/preview',
        method: 'POST',
        body,
      }),
    }),
    importRestaurantInventory: builder.mutation<RestaurantInventoryImportResult, { csv: string }>({
      query: (body) => ({
        url: '/api/restaurant-inventory/import',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['RestaurantInventory'],
    }),
  }),
})

export const { useAiRecommendReorderAssistanceMutation, useFeedbackReorderAssistanceMutation } =
  restaurantInventoryApi
