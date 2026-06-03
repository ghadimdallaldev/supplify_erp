import { useGetNotificationsQuery } from '../services/api'
import { useAppSelector } from './redux'

/**
 * Reads notification data from the same cache entry used by useNotificationAlerts
 * (limit: 25) so we never issue a separate polling subscription just for the badge.
 * All polling is managed centrally by useNotificationAlerts in Layout.
 */
export function useNotificationBadge() {
  const { user } = useAppSelector((state) => state.auth)
  const { data: notificationsData } = useGetNotificationsQuery(
    { limit: 25, offset: 0 },
    {
      skip: !user,
      // No pollingInterval here — useNotificationAlerts owns the poll schedule.
      // RTK Query deduplicates: this subscribes to the same cache entry.
      refetchOnFocus: false,
      refetchOnReconnect: false,
      refetchOnMountOrArgChange: false,
    }
  )

  const notifications = notificationsData?.notifications ?? []
  const unreadCount = notifications.filter((n: { is_read?: boolean }) => !n.is_read).length

  return { notifications, unreadCount }
}
