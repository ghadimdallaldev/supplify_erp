import { useEffect, useState } from 'react'
import { useGetNotificationsQuery, useGetUnreadNotificationCountQuery } from '../services/api'
import { useAppSelector } from './redux'
import { getAppSocket } from '../lib/appSocket'

const UNREAD_POLL_CONNECTED_MS = 60_000

/**
 * Badge + dropdown list. When the socket is connected, unread count comes from the
 * lightweight /unread-count endpoint; the full list stays in RTK cache for the dropdown.
 */
export function useNotificationBadge() {
  const { user } = useAppSelector((state) => state.auth)
  const [socketConnected, setSocketConnected] = useState(false)

  useEffect(() => {
    if (!user?.id) {
      setSocketConnected(false)
      return
    }

    const socket = getAppSocket(user.id)
    const onConnect = () => setSocketConnected(true)
    const onDisconnect = () => setSocketConnected(false)
    setSocketConnected(socket.connected)

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
    }
  }, [user?.id])

  const { data: unreadData } = useGetUnreadNotificationCountQuery(undefined, {
    skip: !user,
    pollingInterval: socketConnected ? UNREAD_POLL_CONNECTED_MS : undefined,
    skipPollingIfUnfocused: true,
    refetchOnFocus: false,
    refetchOnReconnect: true,
  })

  const { data: notificationsData } = useGetNotificationsQuery(
    { limit: 25, offset: 0 },
    {
      skip: !user,
      refetchOnFocus: false,
      refetchOnReconnect: false,
      refetchOnMountOrArgChange: false,
    }
  )

  const notifications = notificationsData?.notifications ?? []
  const unreadCount = socketConnected
    ? (unreadData?.unreadCount ?? 0)
    : notifications.filter((n: { is_read?: boolean }) => !n.is_read).length

  return { notifications, unreadCount }
}
