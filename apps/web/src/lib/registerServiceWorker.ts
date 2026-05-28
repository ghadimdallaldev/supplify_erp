let registered = false

function clearDevServiceWorkerAndCaches(): void {
  void navigator.serviceWorker.getRegistrations().then((regs) => {
    for (const reg of regs) void reg.unregister()
  })
  const cacheStorage =
    typeof window !== 'undefined' && 'caches' in window ? window.caches : undefined
  if (cacheStorage) {
    void cacheStorage
      .keys()
      .then((keys) => Promise.all(keys.map((key) => cacheStorage.delete(key))))
  }
}

/**
 * Registers the app service worker once. Safe to call from multiple hooks.
 * Does not cache API/auth responses — see static/sw.js.
 *
 * In dev, skips registration and clears any existing SW/caches so Vite HMR
 * does not serve stale JS alongside new chunks (duplicate React / broken hooks).
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
