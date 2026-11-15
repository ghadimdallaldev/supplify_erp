import { useQuery } from '@tanstack/react-query'
import type { QuickList } from '../../../types/quickLists'
import { api } from '../client'
import { queryKeys } from './keys'

export function useQuickLists() {
  return useQuery({
    queryKey: queryKeys.quickLists,
    queryFn: async () => {
      const data = await api.get<{ quickLists?: QuickList[]; lists?: QuickList[] }>(
        '/api/quick-lists'
      )
      return data.quickLists ?? data.lists ?? (data as unknown as QuickList[])
    },
  })
}

export function useQuickList(id: string) {
  return useQuery({
    queryKey: queryKeys.quickList(id),
    queryFn: () => api.get<QuickList>(`/api/quick-lists/${id}`),
    enabled: Boolean(id),
  })
}
