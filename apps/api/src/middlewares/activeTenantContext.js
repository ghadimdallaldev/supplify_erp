import { verifyActiveTenantToken, getActiveTenantCookieName } from '../lib/tenant-switch.js'
import { config } from '../config/env.js'
import { syncRequestLogContext } from '../lib/request-log-context.js'

export async function activeTenantContext(req, res, next) {
  try {
    const token = req.cookies?.[getActiveTenantCookieName()]
    if (!token) return next()

    const payload = await verifyActiveTenantToken(token)
    if (!payload) {
      res.clearCookie(getActiveTenantCookieName(), {
        path: '/',
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'lax',
      })
      return next()
    }

    req.activeTenantContext = payload
    syncRequestLogContext(req)
    next()
  } catch (err) {
    next(err)
  }
}
