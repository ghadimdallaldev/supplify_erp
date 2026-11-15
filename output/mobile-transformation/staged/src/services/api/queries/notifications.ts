import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { NotificationPreferences } from '../../../types/notifications'
import { api } from '../client'
import { queryKeys } from './keys'

export function useNotificationPreferences() {
  return useQuery({
    queryKey: queryKeys.notificationPreferences,
    queryFn: async () => {
      const data = await api.get<{ preferences: NotificationPreferences }>('/api/notifications/preferences')
      return data.preferences
    },
    staleTime: 5 * 60_000,
  })
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (preferences: Partial<NotificationPreferences>) =>
      api.patch<{ preferences: NotificationPreferences }>('/api/notifications/preferences', preferences),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.notificationPreferences, data.preferences)
    },
  })
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.post('/api/notifications/read-all'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications }),
  })
}
