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
import { clearActiveTenantCookie } from '../lib/tenant-switch.js'
import {
  requireAuth,
  optionalAuth,
  getRequestTenant,
  assignDefaultRoleForTenant,
} from '../lib/rbac.js'
import { getRolesForUser, getPermissionsForUser } from '../lib/permissions.js'
import { getTenantProfileRow } from '../lib/tenant-profile-cache.js'
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { config } from '../config/env.js'
import { ValidationError } from '../middlewares/errorHandler.js'
import {
  getUserLegalAcceptanceStatus,
  recordLoginLegalReacceptances,
} from '../lib/legal-acceptance.js'
import { randomBytes } from 'crypto'
import { z } from 'zod'
import {
  getAdminUserPreferences,
  upsertAdminUserPreferences,
  ADMIN_LANDING_TABS,
  ADMIN_THEME_PREFERENCES,
} from '../lib/admin-user-preferences.js'

const legalAcceptanceSchema = {
  packVersion: (v) => typeof v === 'string' && v.length > 0 && v.length <= 32,
  acceptedDocuments: (v) => Array.isArray(v) && v.every((s) => typeof s === 'string'),
  electronicSignatureAttestation: (v) => v === true,
}

function parseLegalAcceptanceBody(body) {
  const legalAcceptance = body?.legalAcceptance
  if (!legalAcceptance || typeof legalAcceptance !== 'object') {
    throw new ValidationError('Legal acceptance is required')
  }
  if (!legalAcceptanceSchema.packVersion(legalAcceptance.packVersion)) {
    throw new ValidationError('Invalid legal pack version')
  }
  if (!legalAcceptanceSchema.acceptedDocuments(legalAcceptance.acceptedDocuments)) {
    throw new ValidationError('Invalid accepted documents')
  }
  if (
    !legalAcceptanceSchema.electronicSignatureAttestation(
      legalAcceptance.electronicSignatureAttestation
    )
  ) {
    throw new ValidationError('You must accept the legal agreements to continue')
  }
  return legalAcceptance
}

const router = express.Router()

function clearLocalAuthSession(req, res) {
  clearAuthCookies(res)
  clearImpersonationCookie(res)
  clearActiveTenantCookie(res)
  return new Promise((resolve) => {
    if (!req.session) {
      resolve()
      return
    }
    req.session.destroy(() => resolve())
  })
}

/**
 * Origin the OAuth callback must live on. The callback has to land first-party
 * on the web host so auth cookies aren't third-party (mobile Chrome blocks those).
 * Behind the nginx same-origin proxy the API receives Host = API host, so we can't
 * use req host. Prefer an explicit env (deterministic, survives Railway's edge),
 * then X-Forwarded-Host, then the request host (localhost dev / direct API).
 */
function callbackOrigin(req) {
  const configured = process.env.OAUTH_CALLBACK_BASE_URL
  if (configured) return configured.replace(/\/$/, '')
  const forwardedHost = req.get('x-forwarded-host')
  if (forwardedHost) {
    const proto = req.get('x-forwarded-proto') || req.protocol
    return `${proto}://${forwardedHost}`
  }
  return `${req.protocol}://${req.get('host')}`
}

function isAllowedWebRedirect(urlString) {
  if (!urlString || typeof urlString !== 'string') return false
  try {
    const targetOrigin = new URL(urlString).origin
    return config.WEB_ORIGINS.some((origin) => {
      try {
        return new URL(origin).origin === targetOrigin
      } catch {
        return false
      }
    })
  } catch {
    return false
  }
}

// Generate login URL and redirect to Keycloak
router.get('/login', async (req, res) => {
  try {
    clearImpersonationCookie(res)
    clearActiveTenantCookie(res)

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

    const redirectUri = `${callbackOrigin(req)}/auth/callback`

    const authUrl = await getAuthorizationUrl(redirectUri, state)

    logger.debug('Redirecting to Keycloak for authentication')
    res.redirect(authUrl)
  } catch (error) {
    logger.error('Login error', { error: error.message, stack: error.stack })
    const webOrigin = process.env.WEB_ORIGIN || 'http://localhost:5173'
    res.redirect(`${webOrigin}/login?error=callback_failed`)
  }
})

// Redirect to Keycloak self-registration (hosted signup form)
router.get('/register', async (req, res) => {
  const webOrigin = process.env.WEB_ORIGIN || 'http://localhost:5173'
  try {
    // Keycloak blocks registration when another SSO session is active — end it first.
    if (req.query.continue !== '1') {
      await clearLocalAuthSession(req, res)
      const continueUrl = `${callbackOrigin(req)}/auth/register?continue=1`
      const logoutUrl = await getKeycloakLogoutUrl(continueUrl)
      logger.info('Registration: clearing Keycloak SSO session before signup')
      return res.redirect(logoutUrl)
    }

    const state = randomBytes(32).toString('hex')
    req.session.oauthState = state
    req.session.save((err) => {
      if (err) logger.error('Error saving session', { error: err.message })
    })

    const redirectUri = `${callbackOrigin(req)}/auth/callback`
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
    } else if (typeof req.query.redirect === 'string' && isAllowedWebRedirect(req.query.redirect)) {
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

    const redirectUri = `${callbackOrigin(req)}/auth/callback`

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
    clearImpersonationCookie(res)
    clearActiveTenantCookie(res)

    logger.info('User authenticated', { userId: user.id, role: user.role })

    const webOrigin = process.env.WEB_ORIGIN || 'http://localhost:5173'
    let redirectUrl
    if (user.role === 'STAFF_PORTAL') {
      redirectUrl = `${webOrigin}/staff/dashboard`
    } else {
      const needsSetup = await userNeedsTenantSetup(user)
      redirectUrl = needsSetup ? `${webOrigin}/register/complete` : `${webOrigin}/app`
    }
    res.redirect(redirectUrl)
  } catch (error) {
    logger.error('Callback error', { error: error.message })
    const origin = process.env.WEB_ORIGIN || 'http://localhost:5173'
    res.redirect(`${origin}/login?error=callback_failed`)
  }
})

/** Public invite pages: detect session without 401 when logged out. */
router.get('/session', optionalAuth, async (req, res) => {
  const user = req.userData
  if (!user) {
    return res.json({ ok: true, data: null, error: null, requestId: req.requestId })
  }
  return res.json({
    ok: true,
    data: {
      id: user.id,
      email: user.email,
      displayName: user.display_name || user.displayName || user.email,
    },
    error: null,
    requestId: req.requestId,
  })
})

// Get current user info (includes tenant-scoped roles and permissions for RBAC)
router.get('/me', requireAuth, async (req, res) => {
  try {
    const meT0 = process.hrtime.bigint()
    const user = req.userData

    // Get additional user data based on role
    let additionalData = {}

    // Tenant-scoped RBAC: roles and permissions for current tenant (or admin scope)
    let tenantRoles = []
    let tenantPermissions = []
    let adminRoles = []
    let adminPermissions = []
    let workspace = null
    const tenant = await getRequestTenant(req)
    const { getEffectiveTenant, getImpersonationEffectivePermissions } = await import(
      '../lib/impersonation.js'
    )
    const effectiveTenant = getEffectiveTenant(req)
    if (tenant) {
      const { ensurePrimaryContactOwnerRole, assignDefaultRoleForTenant: assignDefault } =
        await import('../lib/rbac.js')
      const { isPrimaryTenantContact, getTenantAssignmentForUser } = await import(
        '../lib/workspace-tenant.js'
      )

      if (user.role === 'ADMIN' && effectiveTenant) {
        await ensurePrimaryContactOwnerRole(user.id, user.email, tenant.tenantId, tenant.tenantType)
        tenantPermissions = await getImpersonationEffectivePermissions(
          effectiveTenant.tenantId,
          effectiveTenant.tenantType,
          effectiveTenant.viewAsRoleId
        )
        if (effectiveTenant.viewAsRoleId) {
          const { rows: roleRows } = await query(`SELECT name FROM tenant_roles WHERE id = $1`, [
            effectiveTenant.viewAsRoleId,
          ])
          tenantRoles = roleRows.map((r) => r.name)
        } else {
          tenantRoles = ['Owner (impersonation)']
        }
      } else {
        const [ownerAssigned, rolesResult, permsResult, assignment, tenantProfileRow] =
          await Promise.all([
            ensurePrimaryContactOwnerRole(user.id, user.email, tenant.tenantId, tenant.tenantType),
            getRolesForUser(user.id, tenant.tenantId, tenant.tenantType),
            getPermissionsForUser(user.id, tenant.tenantId, tenant.tenantType),
            getTenantAssignmentForUser(user.id, user.role),
            getTenantProfileRow(tenant.tenantType, tenant.tenantId),
          ])
        tenantRoles = rolesResult
        tenantPermissions = permsResult
        const tenantDataRows = tenantProfileRow ? [tenantProfileRow] : []

        if (ownerAssigned) {
          ;[tenantRoles, tenantPermissions] = await Promise.all([
            getRolesForUser(user.id, tenant.tenantId, tenant.tenantType),
            getPermissionsForUser(user.id, tenant.tenantId, tenant.tenantType),
          ])
        } else if (
          tenantRoles.length === 0 &&
          (user.role === 'RESTAURANT' || user.role === 'SUPPLIER')
        ) {
          const isPrimary = await isPrimaryTenantContact(
            user.id,
            user.email,
            tenant.tenantId,
            tenant.tenantType
          )
          if (isPrimary) {
            await assignDefault(user.id, tenant.tenantId, tenant.tenantType)
            ;[tenantRoles, tenantPermissions] = await Promise.all([
              getRolesForUser(user.id, tenant.tenantId, tenant.tenantType),
              getPermissionsForUser(user.id, tenant.tenantId, tenant.tenantType),
            ])
          }
        }

        workspace = {
          tenantId: tenant.tenantId,
          tenantType: tenant.tenantType,
          tenantName: tenant.tenantName || assignment?.tenantName || '',
          roleName: assignment?.roleName || tenantRoles[0] || null,
        }

        if (tenant.tenantType === 'SUPPLIER' && tenantDataRows.length > 0) {
          additionalData.supplier = tenantDataRows[0]
        } else if (tenant.tenantType === 'RESTAURANT' && tenantDataRows.length > 0) {
          additionalData.restaurant = tenantDataRows[0]
        }
      }
    }
    if (user.role === 'ADMIN') {
      // Admin roles and permissions are independent reads.
      ;[adminRoles, adminPermissions] = await Promise.all([
        getRolesForUser(user.id, null, 'ADMIN'),
        getPermissionsForUser(user.id, null, 'ADMIN'),
      ])
    }

    const accessType = user.role === 'STAFF_PORTAL' ? 'staff_portal' : 'platform'
    let staffPortal = null
    if (user.role === 'STAFF_PORTAL') {
      const { getStaffMemberForPortalUser } = await import('../lib/staff-portal-auth.js')
      const staffMember = await getStaffMemberForPortalUser(user.id)
      if (staffMember) {
        staffPortal = {
          staffId: staffMember.id,
          restaurantId: staffMember.restaurant_id,
          displayName: staffMember.display_name,
        }
      }
    }

    const legalStatus = await getUserLegalAcceptanceStatus({
      userId: user.id,
      role: user.role,
      tenantType: tenant?.tenantType ?? workspace?.tenantType ?? null,
    })

    let adminPreferences = null
    if (user.role === 'ADMIN') {
      adminPreferences = await getAdminUserPreferences(user.id)
    }

    const meMs = Number(process.hrtime.bigint() - meT0) / 1e6
    if (meMs >= 400) {
      logger.info({
        event: 'auth.me.timing',
        durationMs: Math.round(meMs),
        userId: user.id,
        tenantId: tenant?.tenantId ?? null,
        requestId: req.requestId,
      })
    }

    res.json({
      ok: true,
      data: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
        accessType,
        staffPortal,
        createdAt: user.created_at,
        tenantRoles,
        tenantPermissions,
        workspace,
        adminRoles,
        adminPermissions,
        legalStatus,
        adminPreferences,
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

router.post('/legal-acceptance', requireAuth, async (req, res) => {
  try {
    const user = req.userData
    const legalAcceptance = parseLegalAcceptanceBody(req.body)
    const tenant = await getRequestTenant(req)

    await recordLoginLegalReacceptances({
      userId: user.id,
      tenantId: tenant?.tenantId ?? null,
      tenantType: tenant?.tenantType ?? null,
      role: user.role,
      acceptedDocuments: legalAcceptance.acceptedDocuments,
      electronicSignatureAttestation: legalAcceptance.electronicSignatureAttestation,
      packVersion: legalAcceptance.packVersion,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    })

    const legalStatus = await getUserLegalAcceptanceStatus({
      userId: user.id,
      role: user.role,
      tenantType: tenant?.tenantType ?? null,
    })

    res.json({
      ok: true,
      data: { legalStatus },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: error.message },
        requestId: req.requestId,
      })
    }
    logger.error('Legal re-acceptance error', { error: error.message })
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to record legal acceptance' },
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

/**
 * Mobile/native refresh — returns JSON tokens (no HttpOnly cookies).
 * Web clients should continue using POST /auth/refresh with cookies.
 */
router.post('/mobile/refresh', async (req, res) => {
  try {
    const refreshToken =
      typeof req.body?.refresh_token === 'string' ? req.body.refresh_token.trim() : null

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

    res.json({
      ok: true,
      data: {
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token,
        expires_in: newTokens.expires_in ?? 3600,
        token_type: 'Bearer',
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Mobile refresh error', { error: error.message })
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
    clearActiveTenantCookie(res)

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
    clearActiveTenantCookie(res)
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

const adminPreferencesPatchSchema = z
  .object({
    defaultLandingTab: z
      .string()
      .refine((value) => ADMIN_LANDING_TABS.includes(value), { message: 'Invalid landing tab' })
      .optional(),
    compactMode: z.boolean().optional(),
    themePreference: z
      .string()
      .refine((value) => ADMIN_THEME_PREFERENCES.includes(value), { message: 'Invalid theme' })
      .optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'No fields to update',
  })

router.get('/admin-preferences', requireAuth, async (req, res) => {
  try {
    if (req.userData.role !== 'ADMIN') {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Admin access required' },
        requestId: req.requestId,
      })
    }

    const preferences = await getAdminUserPreferences(req.userData.id)
    res.json({
      ok: true,
      data: { preferences },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Get admin preferences error', { error: error.message })
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to get admin preferences' },
      requestId: req.requestId,
    })
  }
})

router.patch('/admin-preferences', requireAuth, async (req, res) => {
  try {
    if (req.userData.role !== 'ADMIN') {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Admin access required' },
        requestId: req.requestId,
      })
    }

    const updateData = adminPreferencesPatchSchema.parse(req.body)
    const preferences = await upsertAdminUserPreferences(req.userData.id, updateData)

    res.json({
      ok: true,
      data: { preferences },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: error.errors[0]?.message || 'Invalid input' },
        requestId: req.requestId,
      })
    }
    logger.error('Update admin preferences error', { error: error.message })
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to update admin preferences' },
      requestId: req.requestId,
    })
  }
})

export { router as authRoutes }
