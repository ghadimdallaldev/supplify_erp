import { apiUrl } from './apiBase'

const DEV_API_ORIGIN = 'http://localhost:4000'

/**
 * URL that starts the OIDC flow (full-page navigation, never inside an iframe).
 * Cursor preview / chrome error pages block framed navigations to /auth/login.
 */
export function getOAuthStartUrl(path: 'login' | 'register'): string {
  const url = apiUrl(`/auth/${path}`)
  // Vite dev serves index.html for /auth/* before the proxy on full-page navigations.
  if (import.meta.env.DEV && !import.meta.env.VITE_API_URL && url.startsWith('/')) {
    return `${DEV_API_ORIGIN}${url}`
  }
  return url
}

export function redirectToAuth(path: 'login' | 'register'): void {
  const url = getOAuthStartUrl(path)

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

/** Clears Supplify cookies and Keycloak SSO session (use before signup if stuck on a demo user). */
export function redirectToLogout(options?: { thenRegister?: boolean }): void {
  const base = getOAuthStartUrl('login').replace(/\/auth\/login$/, '/auth/logout')
  const url = options?.thenRegister ? `${base}?redirect=register` : base
  window.location.replace(url)
}
