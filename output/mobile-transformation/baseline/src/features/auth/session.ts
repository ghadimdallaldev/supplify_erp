import { getAccessToken, getRefreshToken } from './tokenStorage'
import { refreshMobileTokens } from './keycloakAuth'

/** Decode JWT exp (seconds) without verifying signature. */
export function getTokenExpiry(token: string): number | null {
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const payload = JSON.parse(atob(padded)) as { exp?: number }
    return typeof payload.exp === 'number' ? payload.exp : null
  } catch {
    return null
  }
}

export function isAccessTokenExpired(token: string, skewSeconds = 30): boolean {
  const exp = getTokenExpiry(token)
  if (!exp) return false
  return Date.now() / 1000 >= exp - skewSeconds
}

/** Refresh if access token missing/expired; returns false when session cannot be restored. */
export async function ensureValidAccessToken(): Promise<boolean> {
  const refreshToken = await getRefreshToken()
  if (!refreshToken) return false

  const accessToken = await getAccessToken()
  if (accessToken && !isAccessTokenExpired(accessToken)) return true

  try {
    await refreshMobileTokens(refreshToken)
    return true
  } catch {
    return false
  }
}
