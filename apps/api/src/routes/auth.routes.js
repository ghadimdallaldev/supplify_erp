import express from 'express'
import {
  getAuthorizationUrl,
  exchangeCodeForTokens,
  getUserInfo,
  revokeToken,
  refreshAccessToken,
} from '../lib/auth.js'
import { upsertUser } from '../lib/rbac.js'
import { setAuthCookies, clearAuthCookies } from '../lib/rbac.js'
import { requireAuth, getRequestTenant } from '../lib/rbac.js'
import { getRolesForUser, getPermissionsForUser } from '../lib/permissions.js'
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { ValidationError } from '../middlewares/errorHandler.js'
import { randomBytes } from 'crypto'

const router = express.Router()

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

    // Verify state parameter (CSRF protection) - temporarily disabled
    const expectedState = req.session.oauthState

    if (expectedState && state !== expectedState) {
      logger.warn('Invalid state parameter (CSRF)')
      return res.redirect(`${process.env.WEB_ORIGIN}/login?error=invalid_state`)
    }

    // Clear the state from session after successful verification
    delete req.session.oauthState

    const redirectUri = `${req.protocol}://${req.get('host')}/auth/callback`

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code, redirectUri)

    // Get user info from Keycloak
    const userInfo = await getUserInfo(tokens.access_token)

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

    // Redirect to application
    const redirectUrl = `${process.env.WEB_ORIGIN || 'http://localhost:5173'}/app`
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

    if (user.role === 'SUPPLIER') {
      const { rows: suppliers } = await query('SELECT * FROM supplier WHERE contact_email = $1', [
        user.email,
      ])
      if (suppliers.length > 0) {
        additionalData.supplier = suppliers[0]
      }
    } else if (user.role === 'RESTAURANT') {
      const { rows: restaurants } = await query(
        'SELECT * FROM restaurant WHERE contact_email = $1',
        [user.email]
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

// Logout
router.post('/logout', requireAuth, async (req, res) => {
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

    // Clear cookies
    clearAuthCookies(res)

    logger.info('User logged out', { userId: req.userData.id })

    res.json({
      ok: true,
      data: { message: 'Logged out successfully' },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Logout error', { error: error.message })

    // Clear cookies even if revocation fails
    clearAuthCookies(res)

    res.json({
      ok: true,
      data: { message: 'Logged out successfully' },
      error: null,
      requestId: req.requestId,
    })
  }
})

export { router as authRoutes }
