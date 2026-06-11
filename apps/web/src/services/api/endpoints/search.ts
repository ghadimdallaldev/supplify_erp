import { api } from '../base'

export type SearchEntityType = 'product' | 'supplier'

export interface SearchHistoryEntry {
  id: string
  entity_type: SearchEntityType
  query: string
  created_at: string
}

export const searchApi = api.injectEndpoints({
  endpoints: (builder) => ({
    search: builder.query<
      | { products: unknown[]; suppliers: unknown[] }
      | { results: Array<{ type: SearchEntityType; item: unknown }> },
      { q: string; grouped?: boolean; limit?: number }
    >({
      query: (params) => ({
        url: '/api/search',
        params,
      }),
    }),
    getSearchHistory: builder.query<
      { history: SearchHistoryEntry[] },
      { entityType?: SearchEntityType; limit?: number }
    >({
      query: (params) => ({
        url: '/api/search/history',
        params: {
          entityType: params.entityType,
          limit: params.limit,
        },
      }),
      providesTags: ['SearchHistory'],
    }),
    upsertSearchHistory: builder.mutation<
      { entry: SearchHistoryEntry },
      { entityType: SearchEntityType; query: string }
    >({
      query: (body) => ({
        url: '/api/search/history',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['SearchHistory'],
    }),
    deleteSearchHistory: builder.mutation<
      { deleted: number },
      { entityType?: SearchEntityType; query?: string }
    >({
      query: (body) => ({
        url: '/api/search/history',
        method: 'DELETE',
        body,
      }),
      invalidatesTags: ['SearchHistory'],
    }),
  }),
})

export const {
  useSearchQuery,
  useLazySearchQuery,
  useGetSearchHistoryQuery,
  useUpsertSearchHistoryMutation,
  useDeleteSearchHistoryMutation,
} = searchApi
