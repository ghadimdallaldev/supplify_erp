import { useGetNotificationsQuery } from '../services/api'
import { useAppSelector } from './redux'

const NOTIFICATION_POLL_MS = 60_000

/** Single RTK Query subscription for notification badge (Header + Sidebar). */
export function useNotificationBadge() {
  const { user } = useAppSelector((state) => state.auth)
  const { data: notificationsData } = useGetNotificationsQuery(
    { limit: 10, offset: 0 },
    {
      skip: !user,
      pollingInterval: NOTIFICATION_POLL_MS,
      refetchOnMountOrArgChange: false,
    }
  )

  const notifications = notificationsData?.notifications ?? []
  const unreadCount = notifications.filter((n: { is_read?: boolean }) => !n.is_read).length

  return { notifications, unreadCount }
}
