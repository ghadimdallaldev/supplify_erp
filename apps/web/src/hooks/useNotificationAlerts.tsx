import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Bell } from 'lucide-react'
import { useGetNotificationsQuery } from '../services/api'
import { useAppSelector } from './redux'
import {
  NOTIFICATION_TOAST_DURATION_MS,
  playNotificationSound,
  resolveNotificationUrl,
  showBrowserNotificationAlways,
  type NotificationLike,
} from '../lib/notificationAlerts'

const POLL_MS = 12_000
const PERMISSION_PROMPT_KEY = 'supplify_notif_permission_asked'

function showNotificationToast(notification: NotificationLike, onNavigate: (path: string) => void) {
  const title = notification.title || 'New notification'
  const message = notification.message || ''
  const path = resolveNotificationUrl(notification)

  toast.custom(
    (t) => (
      <button
        type="button"
        className={`pointer-events-auto flex w-[min(100vw-2rem,380px)] gap-3 rounded-xl border border-[var(--brand)]/25 bg-[var(--surface)] p-4 text-left shadow-lg transition ${
          t.visible ? 'animate-in slide-in-from-right' : 'opacity-0'
        }`}
        onClick={() => {
          toast.dismiss(t.id)
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

/**
 * Polls for new notifications and surfaces toast + sound + browser banner.
 * Mount once in Layout (not in Header) to avoid duplicate alerts.
 */
export function useNotificationAlerts() {
  const { user } = useAppSelector((state) => state.auth)
  const navigate = useNavigate()
  const bootstrappedRef = useRef(false)
  const seenIdsRef = useRef<Set<string>>(new Set())
  const lastUserIdRef = useRef<string | null>(null)

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
      pollingInterval: POLL_MS,
      refetchOnFocus: true,
      refetchOnReconnect: true,
    }
  )

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => undefined)
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
    if (!newcomers.length) return

    for (const item of newcomers) {
      seenIdsRef.current.add(item.id)
      if (item.is_read) continue

      playNotificationSound()
      showNotificationToast(item, (path) => navigate(path))
      showBrowserNotificationAlways(
        item.title || 'Supplify',
        item.message || 'You have a new notification',
        resolveNotificationUrl(item)
      )
    }
  }, [data?.notifications, user, navigate])
}
