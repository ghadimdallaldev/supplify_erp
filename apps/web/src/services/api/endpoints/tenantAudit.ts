import { api } from '../base'
export const tenantAuditApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getTenantAuditLogFilters: builder.query<
      {
        actions: Array<{ value: string; label: string }>
        resourceTypes: Array<{ value: string; label: string }>
      },
      void
    >({
      query: () => '/api/audit/logs/filters',
      providesTags: ['Audit'],
    }),
    getTenantAuditLogs: builder.query<
      { logs: Array<Record<string, unknown>>; total: number; limit: number; offset: number },
      {
        userId?: string
        action?: string
        resourceType?: string
        from?: string
        to?: string
        limit?: number
        offset?: number
      } | void
    >({
      query: (params) => ({ url: '/api/audit/logs', params: params || {} }),
      providesTags: ['Audit'],
    }),
  }),
})
