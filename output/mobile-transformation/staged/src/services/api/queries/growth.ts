import { useQuery } from '@tanstack/react-query'
import type { SupplierGrowthMetrics, SupplierProspect } from '../../../types/growth'
import { api } from '../client'
import { queryKeys, qs } from './keys'

export function useSupplierGrowthMetrics(enabled = true) {
  return useQuery({
    queryKey: queryKeys.supplierGrowthMetrics,
    queryFn: () => api.get<SupplierGrowthMetrics>('/api/supplier/growth/metrics'),
    enabled,
  })
}

export function useSupplierProspects(enabled = true) {
  return useQuery({
    queryKey: queryKeys.supplierProspects,
    queryFn: () =>
      api.get<{ prospects: SupplierProspect[]; total: number }>(
        `/api/supplier/growth/customers/prospects${qs({ limit: 50 })}`
      ),
    enabled,
  })
}
