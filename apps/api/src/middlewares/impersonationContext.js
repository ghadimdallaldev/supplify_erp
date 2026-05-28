/**
 * Impersonation context middleware.
 * Reads the impersonation cookie (if present), verifies the signed token, and sets req.impersonationContext.
 * Does not require auth; context is only trusted when getEffectiveTenant() is used with req.userData (same admin check).
 */
import { verifyImpersonationToken, getImpersonationCookieName } from '../lib/impersonation.js'
import { config } from '../config/env.js'
import { syncRequestLogContext } from '../lib/request-log-context.js'

function clearImpersonationCookie(res) {
  res.clearCookie(getImpersonationCookieName(), {
    path: '/',
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax',
  })
}

export async function impersonationContext(req, res, next) {
  try {
    const token = req.cookies?.[getImpersonationCookieName()]
    if (!token) {
      return next()
    }
    const payload = await verifyImpersonationToken(token)
    if (!payload) {
      clearImpersonationCookie(res)
      return next()
    }
    req.impersonationContext = {
      adminUserId: payload.adminUserId,
      tenantId: payload.tenantId,
      tenantType: payload.tenantType,
      tenantName: payload.tenantName,
      exp: payload.exp,
    }
    syncRequestLogContext(req)
    next()
  } catch (err) {
    next(err)
  }
}
