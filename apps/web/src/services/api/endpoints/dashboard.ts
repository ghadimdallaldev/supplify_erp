import { api } from '../base'
import type { AuditLogFilters, AuditLogsResponse } from '../../../types'

export type DashboardSummary = {
  stats: Record<string, number>
  recentOrders: Array<{
    id: string
    status: string
    total_amount: number
    created_at: string
    restaurant_name?: string
    supplier_name?: string
  }>
  spendTrend: Array<{ name: string; value: number }>
  lowStockPreview: Array<{
    id: string
    product_name: string
    available_qty: number
    low_stock_threshold: number
    isLowStock: boolean
  }>
}

export const dashboardApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getDashboardStats: builder.query<any, void>({
      query: () => '/api/admin/dashboard',
      providesTags: ['User'],
      keepUnusedDataFor: 120,
      transformResponse: (response: any) => response?.stats || {},
    }),
    getDashboardSummary: builder.query<DashboardSummary, void>({
      query: () => '/api/admin/dashboard/summary',
      providesTags: ['User'],
      keepUnusedDataFor: 60,
      transformResponse: (response: any) => response?.data ?? response,
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
