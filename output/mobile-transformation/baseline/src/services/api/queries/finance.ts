import { useQuery } from '@tanstack/react-query'
import type {
  RestaurantInvoice,
  SupplierReceivablesResponse,
  SupplierStatementResponse,
} from '../../../types/finance'
import { api } from '../client'
import { queryKeys, qs } from './keys'

export function useRestaurantInvoices(params?: Record<string, string>) {
  return useQuery({
    queryKey: queryKeys.invoices(params),
    queryFn: async () => {
      const data = await api.get<{ invoices: RestaurantInvoice[] }>(
        `/api/restaurant-finance/invoices${qs(params)}`
      )
      return data.invoices ?? []
    },
  })
}

export function useSupplierStatement(supplierId: string, startDate: string, endDate: string) {
  return useQuery({
    queryKey: queryKeys.statement(supplierId, startDate, endDate),
    queryFn: () =>
      api.get<SupplierStatementResponse>(
        `/api/restaurant-finance/suppliers/${supplierId}/statement${qs({ startDate, endDate })}`
      ),
    enabled: Boolean(supplierId && startDate && endDate),
  })
}

export function useSupplierReceivables() {
  return useQuery({
    queryKey: queryKeys.receivables,
    queryFn: () => api.get<SupplierReceivablesResponse>('/api/supplier/invoices/receivables'),
  })
}
