/**
 * Start OAuth via full-page navigation (never inside an iframe).
 * Cursor preview / chrome error pages block framed navigations to /auth/login.
 */
export function getAuthBaseUrl(): string {
  const configured = import.meta.env.VITE_API_URL?.replace(/\/$/, '')
  if (configured) return configured
  if (import.meta.env.DEV) {
    return typeof window !== 'undefined' ? window.location.origin : ''
  }
  return 'http://localhost:4000'
}

export function redirectToAuth(path: 'login' | 'register'): void {
  const base = getAuthBaseUrl()
  const url = `${base}/auth/${path}`

  try {
    if (window.top && window.top !== window.self) {
      window.top.location.href = url
      return
    }
  } catch {
    // cross-origin parent — fall through
  }

  window.location.replace(url)
}
