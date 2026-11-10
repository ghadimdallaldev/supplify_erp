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
    // Compare parsed origins, not string prefixes: a prefix match would accept
    // https://app.example.com.attacker.test for an allowed https://app.example.com.
    let refererOrigin
    try {
      refererOrigin = new URL(referer).origin
    } catch {
      return false
    }
    return config.WEB_ORIGINS.includes(refererOrigin)
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

/** Session cookies that authenticate a browser request (consumer shop cookie is handled below). */
const SESSION_COOKIE_PATTERN = /(?:^|;\s*)(?:access_token|refresh_token)=[^;]/

/** True when the request carries the web session cookie, so a cross-site form could ride on it. */
function hasSessionCookie(req) {
  return SESSION_COOKIE_PATTERN.test(req.headers.cookie || '')
}

/** Diner (B2C shop) session cookie, only meaningful under /api/public/consumer/*. */
const CONSUMER_COOKIE_PATTERN = /(?:^|;\s*)consumer_auth_token=[^;]/

function hasConsumerCookie(req) {
  return CONSUMER_COOKIE_PATTERN.test(req.headers.cookie || '')
}

/** True when the request carries a Bearer token that verifies (mobile). Never responds. */
async function hasValidBearer(req) {
  const bearerToken = extractBearerToken(req)
  if (!bearerToken) return false
  try {
    await verifyToken(bearerToken)
    return true
  } catch {
    return false
  }
}

function csrfForbidden(req, res, message) {
  return res.status(403).json({
    ok: false,
    data: null,
    error: { name: 'CSRF_FORBIDDEN', message },
    requestId: req.requestId,
  })
}

/** Custom-header + trusted-origin check for cookie-authenticated writes. Returns true if passed. */
function passesCookieCsrfChecks(req, res) {
  if (req.headers[CSRF_REQUEST_HEADER] !== CSRF_REQUEST_HEADER_VALUE) {
    csrfForbidden(req, res, 'Missing or invalid CSRF protection header')
    return false
  }
  if (!isAllowedOrigin(req)) {
    csrfForbidden(req, res, 'Origin not allowed')
    return false
  }
  return true
}

// CSRF protection middleware
export async function csrfProtection(req, res, next) {
  if (isSafeMethod(req.method)) {
    return next()
  }

  if (req.path === '/health') {
    return next()
  }

  // Native refresh authenticates with the refresh token in the JSON body and never reads
  // cookies, so a cross-site form cannot ride on a browser session.
  if (req.path === '/auth/mobile/refresh') {
    return next()
  }

  // /auth/* (session writes, cookie refresh, logout) and /api/public/* (optionalAuth routes such
  // as invitation accept) are exempt only for requests that are not cookie-authenticated:
  // anonymous callers and Bearer-token clients. A request that carries the session cookie must
  // pass the same header + origin checks as the rest of the API, otherwise a cross-site form
  // could act as the victim when COOKIE_SAME_SITE=none. The OAuth GET flows (login, register,
  // callback, logout) are safe methods and never reach this branch.
  if (req.path.startsWith('/auth/') || req.path.startsWith('/api/public')) {
    if (!hasSessionCookie(req)) {
      // Consumer shop cookie writes: header-only check. A cross-site form cannot set
      // X-Requested-With, and a cross-origin fetch that sets it needs a CORS preflight that the API
      // only grants to WEB_ORIGINS. The Origin allowlist is deliberately NOT applied: tenant custom
      // shop domains (tenant_custom_domain) are not in WEB_ORIGINS.
      if (
        req.path.startsWith('/api/public/consumer/') &&
        hasConsumerCookie(req) &&
        config.NODE_ENV !== 'test' &&
        req.headers[CSRF_REQUEST_HEADER] !== CSRF_REQUEST_HEADER_VALUE &&
        !(await hasValidBearer(req))
      ) {
        return csrfForbidden(req, res, 'Missing or invalid CSRF protection header')
      }
      return next()
    }
    if (await hasValidBearer(req)) {
      return next()
    }
    if (config.NODE_ENV === 'test') {
      return next()
    }
    if (!passesCookieCsrfChecks(req, res)) return
    return next()
  }

  // Meta WhatsApp inbound webhooks (signature-verified)
  if (req.path.startsWith('/webhooks/')) {
    return next()
  }

  // E2E helpers use shared secret header, not session cookies
  if (req.path === '/api/internal/auth/otp/email' || req.path.startsWith('/api/e2e')) {
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

    if (!passesCookieCsrfChecks(req, res)) return
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
