import { useQuery } from '@tanstack/react-query'
import type { SupplierLoyaltyBalance, SupplierLoyaltyProgram } from '../../../types/loyalty'
import { api } from '../client'
import { queryKeys } from './keys'

export function useSupplierLoyaltyProgram(enabled = true) {
  return useQuery({
    queryKey: queryKeys.supplierLoyaltyProgram,
    queryFn: () => api.get<{ program: SupplierLoyaltyProgram | null }>('/api/loyalty/supplier/program'),
    enabled,
  })
}

export function useSupplierLoyaltyBalances(enabled = true) {
  return useQuery({
    queryKey: queryKeys.supplierLoyaltyBalances,
    queryFn: () =>
      api.get<{ balances: SupplierLoyaltyBalance[] }>('/api/loyalty/supplier/balances?limit=100'),
    enabled,
  })
}
