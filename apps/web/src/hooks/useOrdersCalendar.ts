import { useMemo } from 'react'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { OrdersCalendarResponse } from '../types'
import { apiUrl } from '../lib/apiBase'

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

export class OrdersCalendarFetchError extends Error {
  name: string
  details?: Record<string, unknown>

  constructor(name: string, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = name
    this.details = details
  }
}

async function fetchCalendar(params: OrdersCalendarQuery): Promise<OrdersCalendarResponse> {
  const searchParams = new URLSearchParams()

  if (params.start) searchParams.set('start', params.start)
  if (params.end) searchParams.set('end', params.end)
  if (params.status) searchParams.set('status', params.status)
  if (params.supplier) searchParams.set('supplier', params.supplier)
  if (params.category) searchParams.set('category', params.category)
  if (params.branch) searchParams.set('branch', params.branch)
  if (params.page) searchParams.set('page', String(params.page))
  if (params.pageSize) searchParams.set('pageSize', String(params.pageSize))
  if (params.role) searchParams.set('role', params.role)

  const response = await fetch(apiUrl('/api/orders/calendar', searchParams), {
    credentials: 'include',
  })

  const payload = await response.json()

  if (!response.ok || !payload?.ok) {
    const err = payload?.error
    const name = err?.name || 'CALENDAR_ERROR'
    const message = err?.message || 'Failed to load order calendar'
    throw new OrdersCalendarFetchError(name, message, err?.details)
  }

  return payload.data as OrdersCalendarResponse
}

export function useOrdersCalendar(
  params: OrdersCalendarQuery,
  options?: { enabled?: boolean }
): UseQueryResult<OrdersCalendarResponse, OrdersCalendarFetchError> {
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

  const enabled = options?.enabled !== false && Boolean(params.start && params.end)

  return useQuery({
    queryKey,
    queryFn: () => fetchCalendar(params),
    enabled,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => {
      if (error instanceof OrdersCalendarFetchError) {
        if (
          error.name === 'FEATURE_NOT_AVAILABLE' ||
          error.name === 'ACCOUNT_LOCKED' ||
          error.name === 'SUBSCRIPTION_SUSPENDED'
        ) {
          return false
        }
      }
      return failureCount < 1
    },
  })
}
