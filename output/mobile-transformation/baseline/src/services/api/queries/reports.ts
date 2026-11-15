import { useQuery } from '@tanstack/react-query'
import { api } from '../client'
import type {
  ReportDateParams,
  RestaurantOrderVolumeRow,
  RestaurantSpendBySupplierRow,
  RestaurantTopProductRow,
  SupplierOrderVolumeRow,
  SupplierRevenueTrendRow,
  SupplierTopRestaurantRow,
} from '../../../types/reports'
import { queryKeys, qs } from './keys'

function reportParams(params: ReportDateParams): Record<string, string> {
  const out: Record<string, string> = {}
  if (params.from) out.from = params.from
  if (params.to) out.to = params.to
  if (params.granularity) out.granularity = params.granularity
  return out
}

export function useRestaurantOrderVolumeReport(params: ReportDateParams, enabled = true) {
  return useQuery({
    queryKey: queryKeys.restaurantReport('order-volume', params),
    queryFn: () =>
      api.get<RestaurantOrderVolumeRow[]>(
        `/api/reports/restaurant/order-volume${qs(reportParams({ granularity: 'day', ...params }))}`
      ),
    enabled: enabled && Boolean(params.from && params.to),
  })
}

export function useRestaurantSpendBySupplierReport(params: ReportDateParams, enabled = true) {
  return useQuery({
    queryKey: queryKeys.restaurantReport('spend-by-supplier', params),
    queryFn: () =>
      api.get<RestaurantSpendBySupplierRow[]>(
        `/api/reports/restaurant/spend-by-supplier${qs(reportParams(params))}`
      ),
    enabled: enabled && Boolean(params.from && params.to),
  })
}

export function useRestaurantTopProductsReport(params: ReportDateParams, enabled = true) {
  return useQuery({
    queryKey: queryKeys.restaurantReport('top-products', params),
    queryFn: () =>
      api.get<RestaurantTopProductRow[]>(
        `/api/reports/restaurant/top-products${qs(reportParams(params))}`
      ),
    enabled: enabled && Boolean(params.from && params.to),
  })
}

export function useSupplierRevenueTrendReport(params: ReportDateParams, enabled = true) {
  return useQuery({
    queryKey: queryKeys.supplierReport('revenue-trend', params),
    queryFn: () =>
      api.get<SupplierRevenueTrendRow[]>(
        `/api/reports/supplier/revenue-trend${qs(reportParams({ granularity: 'day', ...params }))}`
      ),
    enabled: enabled && Boolean(params.from && params.to),
  })
}

export function useSupplierTopRestaurantsReport(params: ReportDateParams, enabled = true) {
  return useQuery({
    queryKey: queryKeys.supplierReport('top-restaurants', params),
    queryFn: () =>
      api.get<SupplierTopRestaurantRow[]>(
        `/api/reports/supplier/top-restaurants${qs(reportParams(params))}`
      ),
    enabled: enabled && Boolean(params.from && params.to),
  })
}

export function useSupplierOrderVolumeReport(params: ReportDateParams, enabled = true) {
  return useQuery({
    queryKey: queryKeys.supplierReport('order-volume', params),
    queryFn: () =>
      api.get<SupplierOrderVolumeRow[]>(
        `/api/reports/supplier/order-volume${qs(reportParams({ granularity: 'day', ...params }))}`
      ),
    enabled: enabled && Boolean(params.from && params.to),
  })
}
