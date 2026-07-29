import { verifyToken, refreshAccessTokenSingleFlight } from './auth.js'
import { getUserBySub } from './rbac.js'
import {
  getActiveTenantCookieName,
  getPrimaryTenantForUser,
  userCanAccessTenant,
  verifyActiveTenantToken,
} from './tenant-switch.js'
import { logger } from './logger.js'

export function parseCookieHeader(cookieHeader = '') {
  const cookies = {}
  for (const part of cookieHeader.split(';')) {
    const i = part.indexOf('=')
    if (i <= 0) continue
    const key = part.slice(0, i).trim()
    let val = part.slice(i + 1).trim()
    try {
      val = decodeURIComponent(val)
    } catch {
      // keep raw value
    }
    cookies[key] = val
  }
  return cookies
}

function isExpiredTokenError(error) {
  return (
    error?.code === 'ERR_JWT_EXPIRED' ||
    error?.name === 'JWTExpired' ||
    String(error?.message || '')
      .toLowerCase()
      .includes('expired')
  )
}

/**
 * Resolve JWT payload from Socket.IO handshake cookies.
 * Refreshes an expired access token using refresh_token when present (same as REST requireAuth).
 */
export async function resolvePayloadFromCookieHeader(cookieHeader) {
  const cookies = parseCookieHeader(cookieHeader)
  const accessToken = cookies.access_token
  const refreshToken = cookies.refresh_token

  if (!accessToken) {
    const err = new Error('Unauthorized: no access token')
    err.code = 'NO_ACCESS_TOKEN'
    throw err
  }

  try {
    const payload = await verifyToken(accessToken)
    return { payload, newTokens: null }
  } catch (error) {
    if (!isExpiredTokenError(error) || !refreshToken) {
      throw error
    }

    logger.debug('Socket auth: access token expired, attempting refresh')
    const refreshResult = await refreshAccessTokenSingleFlight(refreshToken)
    if (!refreshResult.ok || !refreshResult.tokens?.access_token) {
      throw error
    }
    const newTokens = refreshResult.tokens

    const payload = await verifyToken(newTokens.access_token)
    return { payload, newTokens }
  }
}

/**
 * Authenticate a Socket.IO handshake: JWT from cookies, app_user lookup, tenant resolution.
 * Mirrors REST auth (requireAuth + getRequestTenant) without Express request context.
 */
export async function resolveSocketUserFromCookieHeader(cookieHeader) {
  const { payload, newTokens } = await resolvePayloadFromCookieHeader(cookieHeader)
  const user = await getUserBySub(payload.sub)
  if (!user) {
    const err = new Error('Unauthorized: user not found')
    throw err
  }

  const cookies = parseCookieHeader(cookieHeader)
  let tenantId = null

  const activeToken = cookies[getActiveTenantCookieName()]
  if (activeToken) {
    const ctx = await verifyActiveTenantToken(activeToken)
    if (ctx?.userId === user.id) {
      const allowed = await userCanAccessTenant(user.id, user.email, ctx.tenantId, ctx.tenantType)
      if (allowed) {
        tenantId = ctx.tenantId
      }
    }
  }

  if (!tenantId && (user.role === 'SUPPLIER' || user.role === 'RESTAURANT')) {
    const email = (user.email || '').trim().toLowerCase()
    const primary = await getPrimaryTenantForUser(email, user.role)
    tenantId = primary?.id || null
  }

  return { user, tenantId, newTokens }
}
