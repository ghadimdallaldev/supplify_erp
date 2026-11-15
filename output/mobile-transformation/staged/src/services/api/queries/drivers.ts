import { useQuery } from '@tanstack/react-query'
import type { SupplierDriver } from '../../../types/supplierSettings'
import { api } from '../client'
import { queryKeys, qs } from './keys'

export function useSupplierDrivers(enabled = true) {
  return useQuery({
    queryKey: queryKeys.supplierDrivers,
    queryFn: () =>
      api.get<{ drivers: SupplierDriver[] }>(
        `/api/drivers${qs({ active: false })}`
      ),
    enabled,
  })
}
