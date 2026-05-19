import { randomBytes } from 'crypto'
import { config } from '../config/env.js'

/** Header required on cookie-authenticated state-changing API requests (CSRF defense). */
export const CSRF_REQUEST_HEADER = 'x-requested-with'
export const CSRF_REQUEST_HEADER_VALUE = 'Supplify'

function isSafeMethod(method) {
  return ['GET', 'HEAD', 'OPTIONS'].includes(method)
}

function isAllowedOrigin(req) {
  const origin = req.headers.origin
  if (!origin) {
    const referer = req.headers.referer
    if (!referer) return false
    return config.WEB_ORIGINS.some((allowed) => referer.startsWith(allowed))
  }
  return config.WEB_ORIGINS.includes(origin)
}

// CSRF protection middleware
export function csrfProtection(req, res, next) {
  if (isSafeMethod(req.method)) {
    return next()
  }

  if (req.path === '/health') {
    return next()
  }

  // OAuth flows use state parameter in /auth
  if (req.path.startsWith('/auth/')) {
    return next()
  }

  // Public unauthenticated endpoints (token-based staff/reservation flows)
  if (req.path.startsWith('/api/public')) {
    return next()
  }

  // E2E helpers use shared secret header, not session cookies
  if (req.path.startsWith('/api/e2e')) {
    return next()
  }

  // Cookie-based JSON API: require non-simple custom header + trusted origin
  if (req.path.startsWith('/api/')) {
    if (config.NODE_ENV === 'test') {
      return next()
    }

    const headerValue = req.headers[CSRF_REQUEST_HEADER]
    if (headerValue !== CSRF_REQUEST_HEADER_VALUE) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: {
          name: 'CSRF_FORBIDDEN',
          message: 'Missing or invalid CSRF protection header',
        },
        requestId: req.requestId,
      })
    }

    if (!isAllowedOrigin(req)) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: {
          name: 'CSRF_FORBIDDEN',
          message: 'Origin not allowed',
        },
        requestId: req.requestId,
      })
    }

    return next()
  }

  // Session-backed non-API routes: issue CSRF token in session
  if (!req.session.csrfToken) {
    req.session.csrfToken = randomBytes(32).toString('hex')
  }

  res.locals.csrfToken = req.session.csrfToken
  next()
}

// Middleware to add CSRF token to response
export function addCsrfToken(req, res, next) {
  const originalJson = res.json.bind(res)
  res.json = function csrfJson(data) {
    if (data && typeof data === 'object' && res.locals.csrfToken) {
      data.csrfToken = res.locals.csrfToken
    }
    return originalJson(data)
  }
  next()
}
