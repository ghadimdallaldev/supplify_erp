import { verifyActiveTenantToken, getActiveTenantCookieName } from '../lib/tenant-switch.js'
import { extractActiveTenantToken } from '../lib/mobile-auth.js'
import { config } from '../config/env.js'
import { syncRequestLogContext } from '../lib/request-log-context.js'

export async function activeTenantContext(req, res, next) {
  try {
    const headerToken = extractActiveTenantToken(req)
    const cookieToken = req.cookies?.[getActiveTenantCookieName()]
    const token = headerToken || cookieToken
    if (!token) return next()

    const payload = await verifyActiveTenantToken(token)
    if (!payload) {
      if (cookieToken && !headerToken) {
        res.clearCookie(getActiveTenantCookieName(), {
          path: '/',
          httpOnly: true,
          secure: config.NODE_ENV === 'production',
          sameSite: config.COOKIE_SAME_SITE,
        })
      }
      return next()
    }

    req.activeTenantContext = payload
    syncRequestLogContext(req)
    next()
  } catch (err) {
    next(err)
  }
}
