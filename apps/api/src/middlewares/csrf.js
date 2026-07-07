import { randomBytes } from 'crypto'
import { config } from '../config/env.js'
import { verifyToken } from '../lib/auth.js'
import { extractBearerToken } from '../lib/mobile-auth.js'

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

async function handleBearerCsrfBypass(req, res) {
  const bearerToken = extractBearerToken(req)
  if (!bearerToken) return false

  try {
    await verifyToken(bearerToken)
    return true
  } catch {
    res.status(401).json({
      ok: false,
      data: null,
      error: {
        name: 'UNAUTHORIZED',
        message: 'Invalid or expired bearer token',
      },
      requestId: req.requestId,
    })
    return 'rejected'
  }
}

// CSRF protection middleware
export async function csrfProtection(req, res, next) {
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

  // Meta WhatsApp inbound webhooks
  if (req.path.startsWith('/webhooks/')) {
    return next()
  }

  // E2E helpers use shared secret header, not session cookies
  if (req.path.startsWith('/api/e2e')) {
    return next()
  }

  // Local storage direct PUT uses HMAC upload token (no session cookie)
  if (req.path.startsWith('/api/files/upload/')) {
    return next()
  }

  // Cookie-based JSON API: require non-simple custom header + trusted origin
  if (req.path.startsWith('/api/')) {
    if (config.NODE_ENV === 'test') {
      return next()
    }

    const bearerResult = await handleBearerCsrfBypass(req, res)
    if (bearerResult === true) {
      return next()
    }
    if (bearerResult === 'rejected') {
      return
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

  // Session-backed non-API routes: issue CSRF token in session.
  // Guard: session is scoped to /auth in server.js; non-API routes outside /auth won't have it.
  if (!req.session) return next()
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
