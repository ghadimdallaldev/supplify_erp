import { apiUrl } from './apiBase'
import { DEV_API_ORIGIN } from './env'

/**
 * URL that starts the OIDC flow (full-page navigation, never inside an iframe).
 * In dev, use the API origin directly so auth cookies match VITE_API_URL (see apps/web/env.example).
 */
export function getOAuthStartUrl(path: 'login' | 'register'): string {
  const url = apiUrl(`/auth/${path}`)
  if (import.meta.env.VITE_API_URL) {
    return url
  }
  if (import.meta.env.DEV && url.startsWith('/')) {
    return `${DEV_API_ORIGIN}${url}`
  }
  return url
}

/** True when the app runs inside an iframe (Cursor preview, embedded panels, etc.). */
export function isEmbeddedFrame(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

/**
 * Navigate to a URL for OAuth / logout. Breaks out of iframes; opens a new tab if the parent is cross-origin.
 */
export function navigateForOAuth(url: string): void {
  if (typeof window === 'undefined') return

  if (isEmbeddedFrame()) {
    try {
      if (window.top) {
        window.top.location.replace(url)
        return
      }
    } catch {
      // cross-origin parent (e.g. chrome-error://) — cannot set top.location
    }
    window.open(url, '_blank', 'noopener,noreferrer')
    return
  }

  window.location.replace(url)
}

export function redirectToAuth(path: 'login' | 'register'): void {
  navigateForOAuth(getOAuthStartUrl(path))
}

/** Clears Supplify cookies and Keycloak SSO session (use before signup if stuck on a demo user). */
export function redirectToLogout(options?: { thenRegister?: boolean }): void {
  const base = getOAuthStartUrl('login').replace(/\/auth\/login$/, '/auth/logout')
  const url = options?.thenRegister ? `${base}?redirect=register` : base
  navigateForOAuth(url)
}
