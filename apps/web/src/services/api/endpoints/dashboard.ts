import { api } from '../base'
import type { AuditLogFilters, AuditLogsResponse } from '../../../types'
export const dashboardApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getDashboardStats: builder.query<any, void>({
      query: () => '/api/admin/dashboard',
      providesTags: ['User'],
      keepUnusedDataFor: 120,
      transformResponse: (response: any) => response?.stats || {},
    }),
    getAuditLogs: builder.query<AuditLogsResponse, AuditLogFilters>({
      query: (params) => ({
        url: '/api/admin/audit',
        params,
      }),
      providesTags: ['User'],
    }),
  }),
})
