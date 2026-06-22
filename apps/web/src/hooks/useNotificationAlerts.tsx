import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Bell } from 'lucide-react'
import { useGetNotificationsQuery, api } from '../services/api'
import { useAppDispatch, useAppSelector } from './redux'
import {
  NOTIFICATION_TOAST_DURATION_MS,
  playNotificationSound,
  resolveNotificationUrl,
  showBrowserNotificationAlways,
  unlockNotificationAudio,
  type NotificationLike,
} from '../lib/notificationAlerts'
import { registerServiceWorker } from '../lib/registerServiceWorker'
import { getAppSocket } from '../lib/appSocket'

const POLL_DISCONNECTED_MS = 30_000
const PERMISSION_PROMPT_KEY = 'supplify_notif_permission_asked'

function showNotificationToast(notification: NotificationLike, onNavigate: (path: string) => void) {
  const title = notification.title || 'New notification'
  const message = notification.message || ''
  const path = resolveNotificationUrl(notification)

  toast.custom(
    (id) => (
      <button
        type="button"
        className="pointer-events-auto flex w-[min(100vw-2rem,380px)] gap-3 rounded-xl border border-[var(--brand)]/25 bg-[var(--surface)] p-4 text-left shadow-lg transition-[transform,opacity] duration-200 ease-out"
        onClick={() => {
          toast.dismiss(id)
          onNavigate(path)
        }}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand-pale)] text-[var(--brand-mid)]">
          <Bell className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[var(--text)]">{title}</span>
          {message ? (
            <span className="mt-1 block line-clamp-3 text-xs text-[var(--text-muted)]">
              {message}
            </span>
          ) : null}
          <span className="mt-2 block text-[10px] font-medium uppercase tracking-wide text-[var(--brand-mid)]">
            Tap to open
          </span>
        </span>
      </button>
    ),
    {
      duration: NOTIFICATION_TOAST_DURATION_MS,
      position: 'top-right',
    }
  )
}

function shouldSuppressChatToast(
  notification: NotificationLike,
  pathname: string,
  activeConversationId: string | null
): boolean {
  const type = String(notification.reference_type || '').toUpperCase()
  if (type !== 'CONVERSATION' && type !== 'CHAT' && type !== 'MESSAGE') return false
  if (!pathname.startsWith('/app/chat')) return false
  const refId = notification.reference_id
  if (!refId || !activeConversationId) return false
  return refId === activeConversationId
}

/**
 * Real-time notification toasts via Socket.IO; polling as fallback when disconnected.
 * Mount once in Layout.
 */
export function useNotificationAlerts() {
  const { user } = useAppSelector((state) => state.auth)
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const bootstrappedRef = useRef(false)
  const seenIdsRef = useRef<Set<string>>(new Set())
  const lastUserIdRef = useRef<string | null>(null)
  const [socketConnected, setSocketConnected] = useState(false)
  const activeConversationIdRef = useRef<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    activeConversationIdRef.current = params.get('conversation')
  }, [location.pathname, location.search])

  useEffect(() => {
    const uid = user?.id ?? null
    if (uid === lastUserIdRef.current) return
    lastUserIdRef.current = uid
    bootstrappedRef.current = false
    seenIdsRef.current = new Set()
  }, [user?.id])

  const { data } = useGetNotificationsQuery(
    { limit: 25, offset: 0 },
    {
      skip: !user,
      pollingInterval: socketConnected ? undefined : POLL_DISCONNECTED_MS,
      skipPollingIfUnfocused: true,
      refetchOnFocus: false,
      refetchOnReconnect: true,
    }
  )

  const alertForNotification = useCallback(
    (item: NotificationLike) => {
      if (!item.id || seenIdsRef.current.has(item.id)) return
      seenIdsRef.current.add(item.id)
      if (item.is_read) return
      if (shouldSuppressChatToast(item, location.pathname, activeConversationIdRef.current)) {
        return
      }
      playNotificationSound()
      showNotificationToast(item, (path) => navigate(path))
      showBrowserNotificationAlways(
        item.title || 'Supplify',
        item.message || 'You have a new notification',
        resolveNotificationUrl(item)
      )
      dispatch(api.util.invalidateTags(['Notification']))
    },
    [dispatch, navigate, location.pathname]
  )

  useEffect(() => {
    registerServiceWorker()
  }, [])

  useEffect(() => {
    if (!user?.id) return

    const socket = getAppSocket(user.id)

    const onConnect = () => setSocketConnected(true)
    const onDisconnect = () => setSocketConnected(false)
    setSocketConnected(socket.connected)

    const onNotificationNew = (payload: NotificationLike) => {
      if (!payload?.id) return
      alertForNotification(payload)
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('notification_new', onNotificationNew)

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('notification_new', onNotificationNew)
    }
  }, [user?.id, alertForNotification])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const unlock = () => unlockNotificationAudio()
    const opts: AddEventListenerOptions = { once: true, capture: true }
    window.addEventListener('click', unlock, opts)
    window.addEventListener('touchstart', unlock, { ...opts, passive: true })
    window.addEventListener('keydown', unlock, opts)
    return () => {
      window.removeEventListener('click', unlock, { capture: true })
      window.removeEventListener('touchstart', unlock, { capture: true })
      window.removeEventListener('keydown', unlock, { capture: true })
    }
  }, [])

  useEffect(() => {
    if (!user || typeof Notification === 'undefined') return
    if (Notification.permission !== 'default') return
    if (sessionStorage.getItem(PERMISSION_PROMPT_KEY) === '1') return

    const timer = window.setTimeout(() => {
      sessionStorage.setItem(PERMISSION_PROMPT_KEY, '1')
      void Notification.requestPermission()
    }, 4_000)

    return () => window.clearTimeout(timer)
  }, [user])

  useEffect(() => {
    if (!user || data?.notifications === undefined) return

    const list = (data.notifications ?? []) as NotificationLike[]

    if (!bootstrappedRef.current) {
      bootstrappedRef.current = true
      for (const item of list) {
        if (item.id) seenIdsRef.current.add(item.id)
      }
      return
    }

    const newcomers = list.filter((item) => item.id && !seenIdsRef.current.has(item.id))
    for (const item of newcomers) {
      alertForNotification(item)
    }
  }, [data?.notifications, user, alertForNotification])
}
