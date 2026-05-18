import { useMemo } from 'react'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { OrdersCalendarResponse } from '../types'

export interface OrdersCalendarQuery {
  start?: string | null
  end?: string | null
  status?: string | null
  supplier?: string | null
  branch?: string | null
  category?: string | null
  page?: number
  pageSize?: number
  role?: 'RESTAURANT' | 'SUPPLIER'
  view?: string
}

const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? '' : 'http://localhost:4000')

async function fetchCalendar(params: OrdersCalendarQuery): Promise<OrdersCalendarResponse> {
  const url = new URL('/api/orders/calendar', API_URL)

  const searchParams = new URLSearchParams()

  if (params.start) searchParams.set('start', params.start)
  if (params.end) searchParams.set('end', params.end)
  if (params.status) searchParams.set('status', params.status)
  if (params.supplier) searchParams.set('supplier', params.supplier)
  if (params.branch) searchParams.set('branch', params.branch)
  if (params.category) searchParams.set('category', params.category)
  if (params.page) searchParams.set('page', String(params.page))
  if (params.pageSize) searchParams.set('pageSize', String(params.pageSize))
  if (params.role) searchParams.set('role', params.role)

  const queryString = searchParams.toString()
  if (queryString) {
    url.search = queryString
  }

  const response = await fetch(url.toString(), {
    credentials: 'include',
  })

  const payload = await response.json()

  if (!response.ok || !payload?.ok) {
    const errorMessage = payload?.error?.message || 'Failed to load order calendar'
    throw new Error(errorMessage)
  }

  return payload.data as OrdersCalendarResponse
}

export function useOrdersCalendar(
  params: OrdersCalendarQuery
): UseQueryResult<OrdersCalendarResponse> {
  const queryKey = useMemo(
    () => [
      'orders-calendar',
      {
        start: params.start ?? null,
        end: params.end ?? null,
        status: params.status ?? null,
        supplier: params.supplier ?? null,
        branch: params.branch ?? null,
        category: params.category ?? null,
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 100,
        role: params.role ?? null,
        view: params.view ?? null,
      },
    ],
    [
      params.start,
      params.end,
      params.status,
      params.supplier,
      params.branch,
      params.category,
      params.page,
      params.pageSize,
      params.role,
      params.view,
    ]
  )

  const enabled = Boolean(params.start && params.end)

  return useQuery({
    queryKey,
    queryFn: () => fetchCalendar(params),
    enabled,
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false,
    retry: 1,
  })
}
