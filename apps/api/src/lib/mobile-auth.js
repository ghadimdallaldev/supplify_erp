/**
 * Mobile / native client auth helpers.
 * Web continues to use HttpOnly cookies; mobile uses Authorization: Bearer.
 */

export const ACTIVE_TENANT_TOKEN_HEADER = 'x-active-tenant-token'

/** Parse `Authorization: Bearer <token>`; returns null when absent or malformed. */
export function extractBearerToken(req) {
  const auth = req.headers?.authorization
  if (!auth || typeof auth !== 'string') return null
  const match = auth.match(/^Bearer\s+(\S+)$/i)
  return match?.[1]?.trim() || null
}

/** Access token: Bearer header first, then access_token cookie (web). */
export function extractAccessToken(req) {
  return extractBearerToken(req) || req.cookies?.access_token || null
}

/** Whether this request authenticated via Bearer (not cookie). */
export function isBearerAuthRequest(req) {
  return Boolean(extractBearerToken(req))
}

/** Refresh token: cookie (web) or JSON body refresh_token (mobile). */
export function extractRefreshToken(req) {
  if (req.body?.refresh_token && typeof req.body.refresh_token === 'string') {
    return req.body.refresh_token.trim() || null
  }
  return req.cookies?.refresh_token || null
}

/** Active tenant switch token: header (mobile) or cookie (web). */
export function extractActiveTenantToken(req) {
  const header = req.headers?.[ACTIVE_TENANT_TOKEN_HEADER]
  if (header && typeof header === 'string' && header.trim()) {
    return header.trim()
  }
  return null
}
