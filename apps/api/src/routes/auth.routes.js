import express from 'express'
import {
  getAuthorizationUrl,
  getRegistrationUrl,
  exchangeCodeForTokens,
  getUserInfo,
  revokeToken,
  refreshAccessToken,
  getKeycloakLogoutUrl,
} from '../lib/auth.js'
import { userNeedsTenantSetup } from '../lib/register-account.js'
import { upsertUser } from '../lib/rbac.js'
import { setAuthCookies, clearAuthCookies } from '../lib/rbac.js'
import { clearImpersonationCookie } from '../lib/impersonation.js'
import { requireAuth, getRequestTenant, assignDefaultRoleForTenant } from '../lib/rbac.js'
import { getRolesForUser, getPermissionsForUser } from '../lib/permissions.js'
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { ValidationError } from '../middlewares/errorHandler.js'
import { randomBytes } from 'crypto'

const router = express.Router()

function clearLocalAuthSession(req, res) {
  clearAuthCookies(res)
  clearImpersonationCookie(res)
  return new Promise((resolve) => {
    if (!req.session) {
      resolve()
      return
    }
    req.session.destroy(() => resolve())
  })
}

function apiOrigin(req) {
  return `${req.protocol}://${req.get('host')}`
}

// Generate login URL and redirect to Keycloak
router.get('/login', async (req, res) => {
  try {
    // Generate CSRF token for this session
    const state = randomBytes(32).toString('hex')

    // Store state in session and force save
    req.session.oauthState = state
    req.session.save((err) => {
      if (err) {
        logger.error('Error saving session', { error: err.message })
      }
    })

    logger.info('Login initiated')

    const redirectUri = `${req.protocol}://${req.get('host')}/auth/callback`

    const authUrl = await getAuthorizationUrl(redirectUri, state)

    logger.debug('Redirecting to Keycloak for authentication')
    res.redirect(authUrl)
  } catch (error) {
    logger.error('Login error', { error: error.message })
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Login failed',
      },
      requestId: req.requestId,
    })
  }
})

// Redirect to Keycloak self-registration (hosted signup form)
router.get('/register', async (req, res) => {
  const webOrigin = process.env.WEB_ORIGIN || 'http://localhost:5173'
  try {
    // Keycloak blocks registration when another SSO session is active — end it first.
    if (req.query.continue !== '1') {
      await clearLocalAuthSession(req, res)
      const continueUrl = `${apiOrigin(req)}/auth/register?continue=1`
      const logoutUrl = await getKeycloakLogoutUrl(continueUrl)
      logger.info('Registration: clearing Keycloak SSO session before signup')
      return res.redirect(logoutUrl)
    }

    const state = randomBytes(32).toString('hex')
    req.session.oauthState = state
    req.session.save((err) => {
      if (err) logger.error('Error saving session', { error: err.message })
    })

    const redirectUri = `${apiOrigin(req)}/auth/callback`
    const registrationUrl = await getRegistrationUrl(redirectUri, state)

    logger.info('Registration initiated')
    res.redirect(registrationUrl)
  } catch (error) {
    logger.error('Registration redirect error', { error: error.message })
    res.redirect(`${webOrigin}/login?error=registration_failed`)
  }
})

// Public sign-out: clears app cookies/session and Keycloak SSO (no auth required)
router.get('/logout', async (req, res) => {
  try {
    const webOrigin = process.env.WEB_ORIGIN || 'http://localhost:5173'
    await clearLocalAuthSession(req, res)

    let redirectAfter = `${webOrigin}/login`
    if (req.query.redirect === 'register') {
      redirectAfter = `${webOrigin}/auth/register`
    } else if (typeof req.query.redirect === 'string' && req.query.redirect.startsWith('http')) {
      redirectAfter = req.query.redirect
    }

    const logoutUrl = await getKeycloakLogoutUrl(redirectAfter)
    res.redirect(logoutUrl)
  } catch (error) {
    logger.error('Public logout error', { error: error.message })
    res.redirect(`${process.env.WEB_ORIGIN || 'http://localhost:5173'}/login`)
  }
})

// Handle Keycloak callback
router.get('/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query

    logger.debug('Keycloak callback received', {
      hasCode: !!code,
      hasState: !!state,
      hasError: !!error,
    })

    if (error) {
      logger.warn('Keycloak authentication error', { error })
      return res.redirect(`${process.env.WEB_ORIGIN}/login?error=${encodeURIComponent(error)}`)
    }

    if (!code) {
      logger.error('No authorization code received')
      return res.redirect(`${process.env.WEB_ORIGIN}/login?error=no_code`)
    }

    const expectedState = req.session.oauthState
    if (!expectedState || !state || state !== expectedState) {
      logger.warn('Invalid or missing OAuth state parameter (CSRF)')
      return res.redirect(`${process.env.WEB_ORIGIN}/login?error=invalid_state`)
    }

    // Clear the state from session after successful verification
    delete req.session.oauthState

    const redirectUri = `${req.protocol}://${req.get('host')}/auth/callback`

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code, redirectUri)

    // Get user info from Keycloak
    const userInfo = await getUserInfo(tokens.access_token, tokens.id_token)

    // Decode the access token to get roles from realm_access and resource_access
    const tokenParts = tokens.access_token.split('.')
    const tokenPayload = JSON.parse(Buffer.from(tokenParts[1], 'base64url').toString())

    const realmRoles = tokenPayload.realm_access?.roles || []
    const clientId = process.env.KEYCLOAK_CLIENT_ID || 'supplify-api'
    const clientRoles = tokenPayload.resource_access?.[clientId]?.roles || []
    const roles = [...new Set([...realmRoles, ...clientRoles])]

    // Upsert user in database
    const user = await upsertUser(userInfo, roles)

    // Set auth cookies
    setAuthCookies(res, tokens.access_token, tokens.refresh_token)

    logger.info('User authenticated', { userId: user.id, role: user.role })

    const webOrigin = process.env.WEB_ORIGIN || 'http://localhost:5173'
    const needsSetup = await userNeedsTenantSetup(user)
    const redirectUrl = needsSetup ? `${webOrigin}/register/complete` : `${webOrigin}/app`
    res.redirect(redirectUrl)
  } catch (error) {
    logger.error('Callback error', { error: error.message })
    const origin = process.env.WEB_ORIGIN || 'http://localhost:5173'
    res.redirect(`${origin}/login?error=callback_failed`)
  }
})

// Get current user info (includes tenant-scoped roles and permissions for RBAC)
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = req.userData

    // Get additional user data based on role
    let additionalData = {}

    const emailLower = (user.email || '').trim().toLowerCase()
    if (user.role === 'SUPPLIER' && emailLower) {
      const { rows: suppliers } = await query(
        'SELECT * FROM supplier WHERE LOWER(TRIM(contact_email)) = $1',
        [emailLower]
      )
      if (suppliers.length > 0) {
        additionalData.supplier = suppliers[0]
      }
    } else if (user.role === 'RESTAURANT' && emailLower) {
      const { rows: restaurants } = await query(
        'SELECT * FROM restaurant WHERE LOWER(TRIM(contact_email)) = $1',
        [emailLower]
      )
      if (restaurants.length > 0) {
        additionalData.restaurant = restaurants[0]
      }
    }

    // Tenant-scoped RBAC: roles and permissions for current tenant (or admin scope)
    let tenantRoles = []
    let tenantPermissions = []
    let adminRoles = []
    let adminPermissions = []
    const tenant = await getRequestTenant(req)
    if (tenant) {
      tenantRoles = await getRolesForUser(user.id, tenant.tenantId, tenant.tenantType)
      tenantPermissions = await getPermissionsForUser(user.id, tenant.tenantId, tenant.tenantType)
      // If tenant user has no role (e.g. new user or migration not run), assign default owner role so they get permissions
      if (tenantRoles.length === 0 && (user.role === 'RESTAURANT' || user.role === 'SUPPLIER')) {
        await assignDefaultRoleForTenant(user.id, tenant.tenantId, tenant.tenantType)
        tenantRoles = await getRolesForUser(user.id, tenant.tenantId, tenant.tenantType)
        tenantPermissions = await getPermissionsForUser(user.id, tenant.tenantId, tenant.tenantType)
      }
    }
    if (user.role === 'ADMIN') {
      adminRoles = await getRolesForUser(user.id, null, 'ADMIN')
      adminPermissions = await getPermissionsForUser(user.id, null, 'ADMIN')
    }

    res.json({
      ok: true,
      data: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
        createdAt: user.created_at,
        tenantRoles,
        tenantPermissions,
        adminRoles,
        adminPermissions,
        ...additionalData,
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Get user info error', { error: error.message })
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get user info',
      },
      requestId: req.requestId,
    })
  }
})

// Refresh access token
router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies.refresh_token

    if (!refreshToken) {
      return res.status(401).json({
        ok: false,
        data: null,
        error: {
          name: 'UNAUTHORIZED',
          message: 'No refresh token provided',
        },
        requestId: req.requestId,
      })
    }

    const newTokens = await refreshAccessToken(refreshToken)

    if (!newTokens) {
      clearAuthCookies(res)
      return res.status(401).json({
        ok: false,
        data: null,
        error: {
          name: 'UNAUTHORIZED',
          message: 'Token refresh failed',
        },
        requestId: req.requestId,
      })
    }

    setAuthCookies(res, newTokens.access_token, newTokens.refresh_token)

    res.json({
      ok: true,
      data: {
        message: 'Token refreshed successfully',
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Refresh error', { error: error.message })
    clearAuthCookies(res)
    res.status(401).json({
      ok: false,
      data: null,
      error: {
        name: 'UNAUTHORIZED',
        message: 'Token refresh failed',
      },
      requestId: req.requestId,
    })
  }
})

// Logout: revoke tokens, clear cookies and session, return Keycloak logout URL so frontend
// can redirect the user to clear Keycloak SSO session (user must re-enter credentials next login).
router.post('/logout', requireAuth, async (req, res) => {
  const webOrigin = process.env.WEB_ORIGIN || 'http://localhost:5173'
  const postLogoutRedirectUri = `${webOrigin}/login`

  try {
    const accessToken = req.cookies.access_token
    const refreshToken = req.cookies.refresh_token

    // Revoke tokens in Keycloak
    if (accessToken) {
      await revokeToken(accessToken)
    }
    if (refreshToken) {
      await revokeToken(refreshToken)
    }

    // Clear cookies (same path/sameSite as set so browser actually removes them)
    clearAuthCookies(res)
    clearImpersonationCookie(res)

    // Destroy Express session so session cookie is cleared
    await new Promise((resolve, reject) => {
      req.session.destroy((err) => {
        if (err) reject(err)
        else resolve()
      })
    })

    // Keycloak logout URL: redirect user there to clear Keycloak SSO session
    let keycloakLogoutUrl = null
    try {
      keycloakLogoutUrl = await getKeycloakLogoutUrl(postLogoutRedirectUri)
    } catch (e) {
      logger.warn('Could not build Keycloak logout URL', { error: e.message })
    }

    logger.info('User logged out', { userId: req.userData?.id })

    res.json({
      ok: true,
      data: {
        message: 'Logged out successfully',
        keycloakLogoutUrl: keycloakLogoutUrl || undefined,
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Logout error', { error: error.message })

    // Clear cookies and session even if revocation or destroy fails
    clearAuthCookies(res)
    clearImpersonationCookie(res)
    req.session.destroy(() => {})

    let keycloakLogoutUrl = null
    try {
      keycloakLogoutUrl = await getKeycloakLogoutUrl(postLogoutRedirectUri)
    } catch {
      /* optional: logout URL not required for success response */
    }

    res.json({
      ok: true,
      data: {
        message: 'Logged out successfully',
        keycloakLogoutUrl: keycloakLogoutUrl || undefined,
      },
      error: null,
      requestId: req.requestId,
    })
  }
})

export { router as authRoutes }
