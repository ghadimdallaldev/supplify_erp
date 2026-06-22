import { api } from '../base'
import type { Inventory, UpdateInventoryRequest } from '../../../types'
export const inventoryApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getInventoryList: builder.query<{ inventory: any[] }, void>({
      query: () => '/api/inventory',
      providesTags: ['Inventory'],
    }),
    getInventory: builder.query<Inventory, string>({
      query: (productId) => `/api/inventory/product/${productId}`,
      providesTags: ['Inventory'],
    }),
    updateInventory: builder.mutation<
      Inventory,
      { productId: string; data: UpdateInventoryRequest }
    >({
      query: ({ productId, data }) => ({
        url: `/api/inventory/product/${productId}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: ['Inventory'],
    }),
    createInventoryAdjustment: builder.mutation<
      any,
      {
        productId: string
        adjustmentType: 'IN' | 'OUT'
        quantity: number
        reason: string
        notes?: string
      }
    >({
      query: ({ productId, ...body }) => ({
        url: `/api/inventory/product/${productId}/adjustment`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Inventory'],
    }),
  }),
})
