import { api } from '../base'
import { normalizeReportResponse } from '../../../lib/reportResponse'

export const reportsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getRestaurantReport: builder.query<
      { data: Array<Record<string, unknown>>; meta?: Record<string, unknown> },
      { path: string; from?: string; to?: string; branchId?: string; granularity?: string }
    >({
      query: ({ path, from, to, branchId, granularity }) => ({
        url: `/api/reports/restaurant/${path}`,
        params: { from, to, branch_id: branchId, granularity },
      }),
      transformResponse: (response: unknown) => normalizeReportResponse(response),
      providesTags: ['Reports'],
    }),
    getSupplierReport: builder.query<
      { data: Array<Record<string, unknown>>; meta?: Record<string, unknown> },
      { path: string; from?: string; to?: string; granularity?: string }
    >({
      query: ({ path, from, to, granularity }) => ({
        url: `/api/reports/supplier/${path}`,
        params: { from, to, granularity },
      }),
      transformResponse: (response: unknown) => normalizeReportResponse(response),
      providesTags: ['Reports'],
    }),
  }),
})
