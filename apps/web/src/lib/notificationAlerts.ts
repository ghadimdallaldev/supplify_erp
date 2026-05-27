/** In-app + OS alert helpers for new notifications (panel polling). */

export const NOTIFICATION_TOAST_DURATION_MS = 10_000
export const NOTIFICATION_BROWSER_DURATION_MS = 10_000

export type NotificationLike = {
  id: string
  title?: string | null
  message?: string | null
  reference_type?: string | null
  reference_id?: string | null
  metadata?: unknown
  is_read?: boolean
}

export function resolveNotificationUrl(notification: NotificationLike): string {
  const type = String(notification.reference_type || '').toUpperCase()
  const id = notification.reference_id
  const meta =
    notification.metadata && typeof notification.metadata === 'object'
      ? (notification.metadata as Record<string, unknown>)
      : null
  const metaLink = typeof meta?.link === 'string' ? meta.link : null
  if (metaLink?.startsWith('/')) return metaLink

  if (type === 'ORDER' && id) return `/app/orders/${id}`
  if (type === 'DISPUTE' && id) return `/app/disputes/${id}`
  if (type === 'RESERVATION') return '/app/reservations'
  if (type === 'INVOICE') return id ? `/app/invoices` : '/app/invoices'
  if (type === 'CONVERSATION' || type === 'CHAT' || type === 'MESSAGE') return '/app/chat'
  if (type === 'QUICK_LIST' && id) return '/app/quick-lists'
  if (type === 'PRODUCT') return '/app/products'
  if (type === 'STAFF_PTO' || type === 'STAFF_SWAP') return '/app/staff'
  return '/app/notifications'
}

let audioContext: AudioContext | null = null

/** Short two-tone chime — no external asset required. */
export function playNotificationSound() {
  if (typeof window === 'undefined') return
  try {
    const ctx = audioContext ?? new AudioContext()
    audioContext = ctx
    if (ctx.state === 'suspended') {
      void ctx.resume()
    }

    const playTone = (frequency: number, start: number, duration: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = frequency
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.2, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + duration + 0.05)
    }

    const t = ctx.currentTime
    playTone(880, t, 0.12)
    playTone(1174.66, t + 0.14, 0.18)
  } catch {
    // Autoplay policies or missing Web Audio — ignore
  }
}

export function showBrowserNotification(
  title: string,
  body: string,
  url: string,
  durationMs = NOTIFICATION_BROWSER_DURATION_MS
) {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return
  if (document.visibilityState === 'visible') {
    // Foreground: avoid duplicate OS banner when toast is already shown (Chrome stacks both).
    // Still show OS notification if user prefers — only skip when tab is focused.
    return
  }

  try {
    const notification = new Notification(title || 'Supplify', {
      body: body || '',
      icon: '/favicon.ico',
      tag: `supplify-alert-${Date.now()}`,
      data: { url },
    })
    notification.onclick = (event) => {
      event.preventDefault()
      window.focus()
      const target = notification.data?.url || url
      if (target.startsWith('http')) {
        window.location.href = target
      } else {
        window.location.assign(target)
      }
      notification.close()
    }
    window.setTimeout(() => notification.close(), durationMs)
  } catch {
    // Permission revoked mid-flight
  }
}

/** OS notification when app is open (user asked for Chrome notification visible). */
export function showBrowserNotificationAlways(
  title: string,
  body: string,
  url: string,
  durationMs = NOTIFICATION_BROWSER_DURATION_MS
) {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return

  try {
    const notification = new Notification(title || 'Supplify', {
      body: body || '',
      icon: '/favicon.ico',
      tag: `supplify-${title}-${body}`.slice(0, 64),
      data: { url },
    })
    notification.onclick = (event) => {
      event.preventDefault()
      window.focus()
      const target = notification.data?.url || url
      window.location.assign(target.startsWith('/') ? target : url)
      notification.close()
    }
    window.setTimeout(() => notification.close(), durationMs)
  } catch {
    // ignore
  }
}
