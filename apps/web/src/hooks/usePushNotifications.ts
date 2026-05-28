import { useCallback, useEffect, useState } from 'react'
import {
  useGetVapidPublicKeyQuery,
  useSubscribePushMutation,
  useUnsubscribePushMutation,
} from '../services/api'

const PUSH_ENABLED_KEY = 'supplify_push_enabled'
const PUSH_DISMISSED_KEY = 'supplify_push_banner_dismissed'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i)
  }
  return output
}

export function usePushNotifications() {
  const [bannerVisible, setBannerVisible] = useState(false)
  const [subscribed, setSubscribed] = useState(
    () => localStorage.getItem(PUSH_ENABLED_KEY) === 'true'
  )
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  )

  const { data: vapidData } = useGetVapidPublicKeyQuery(undefined, {
    skip: typeof window === 'undefined' || !('serviceWorker' in navigator),
  })
  const [subscribePush, { isLoading: subscribing }] = useSubscribePushMutation()
  const [unsubscribePush, { isLoading: unsubscribing }] = useUnsubscribePushMutation()

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  }, [])

  useEffect(() => {
    if (permission === 'granted' || localStorage.getItem(PUSH_DISMISSED_KEY) === 'true') return
    const timer = window.setTimeout(() => setBannerVisible(true), 30_000)
    return () => window.clearTimeout(timer)
  }, [permission])

  const dismissBanner = useCallback(() => {
    localStorage.setItem(PUSH_DISMISSED_KEY, 'true')
    setBannerVisible(false)
  }, [])

  const enablePush = useCallback(async () => {
    if (!vapidData?.publicKey || !('serviceWorker' in navigator)) {
      throw new Error('Push notifications are not available')
    }
    const perm = await Notification.requestPermission()
    setPermission(perm)
    if (perm !== 'granted') {
      throw new Error('Notification permission denied')
    }
    const registration = await navigator.serviceWorker.ready
    let subscription
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidData.publicKey),
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error(
          'Push notifications are not available in this browser (use HTTPS or localhost with valid VAPID keys).'
        )
      }
      throw err
    }
    const json = subscription.toJSON()
    await subscribePush({
      endpoint: json.endpoint!,
      keys: { p256dh: json.keys!.p256dh!, auth: json.keys!.auth! },
    }).unwrap()
    localStorage.setItem(PUSH_ENABLED_KEY, 'true')
    localStorage.setItem(PUSH_DISMISSED_KEY, 'true')
    setSubscribed(true)
    setBannerVisible(false)
  }, [subscribePush, vapidData?.publicKey])

  const disablePush = useCallback(async () => {
    if (!('serviceWorker' in navigator)) return
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (subscription) {
      await unsubscribePush({ endpoint: subscription.endpoint }).unwrap()
      await subscription.unsubscribe()
    }
    localStorage.setItem(PUSH_ENABLED_KEY, 'false')
    setSubscribed(false)
  }, [unsubscribePush])

  return {
    bannerVisible,
    dismissBanner,
    enablePush,
    disablePush,
    subscribed,
    subscribing,
    unsubscribing,
    permission,
    pushAvailable: Boolean(vapidData?.publicKey),
  }
}
