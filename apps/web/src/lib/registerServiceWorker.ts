let registered = false

/**
 * Registers the app service worker once. Safe to call from multiple hooks.
 * Does not cache API/auth responses — see static/sw.js.
 */
export function registerServiceWorker(): void {
  if (registered || typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  registered = true
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  })
}
