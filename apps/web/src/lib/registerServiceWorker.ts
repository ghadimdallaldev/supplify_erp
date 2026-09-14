let registered = false
/** When true, skip clearing SW registrations (user explicitly enabled push). */
let pushServiceWorkerPinned = false
let clearGeneration = 0

const PUSH_ENABLED_STORAGE_KEY = 'supplify_push_enabled'

function clearDevServiceWorkerAndCaches(): void {
  if (pushServiceWorkerPinned) return
  try {
    if (localStorage.getItem(PUSH_ENABLED_STORAGE_KEY) === 'true') return
  } catch {
    /* ignore */
  }

  const generation = ++clearGeneration
  void navigator.serviceWorker.getRegistrations().then((regs) => {
    if (pushServiceWorkerPinned || generation !== clearGeneration) return
    for (const reg of regs) void reg.unregister()
  })
  const cacheStorage =
    typeof window !== 'undefined' && 'caches' in window ? window.caches : undefined
  if (cacheStorage) {
    void cacheStorage.keys().then((keys) => {
      if (pushServiceWorkerPinned || generation !== clearGeneration) return
      return Promise.all(keys.map((key) => cacheStorage.delete(key)))
    })
  }
}

/**
 * Registers the app service worker once. Safe to call from multiple hooks.
 * Does not cache API/auth responses — see static/sw.js.
 *
 * In dev, skips registration and clears any existing SW/caches so Vite HMR
 * does not serve stale JS alongside new chunks (duplicate React / broken hooks).
 * Push enable uses {@link ensureServiceWorkerForPush} instead, which registers on demand.
 */
export function registerServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

  if (import.meta.env.MODE !== 'production') {
    clearDevServiceWorkerAndCaches()
    return
  }

  if (registered) return
  registered = true
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  })
}

const DEFAULT_PUSH_SW_TIMEOUT_MS = 10_000

/**
 * Ensures an active service worker registration for Web Push.
 * Always registers `/sw.js` immediately (including development), then waits for
 * `navigator.serviceWorker.ready` with a timeout so Enable Push never hangs forever.
 */
export async function ensureServiceWorkerForPush(
  timeoutMs = DEFAULT_PUSH_SW_TIMEOUT_MS
): Promise<ServiceWorkerRegistration> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    throw new Error('Push notifications are not available in this browser.')
  }

  pushServiceWorkerPinned = true
  clearGeneration += 1

  await navigator.serviceWorker.register('/sw.js')
  registered = true

  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new Error(
            'Push service worker timed out. Reload the page and try again (HTTPS or localhost required).'
          )
        )
      }, timeoutMs)
    })
    return await Promise.race([navigator.serviceWorker.ready, timedOut])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
