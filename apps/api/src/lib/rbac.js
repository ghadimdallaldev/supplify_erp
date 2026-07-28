import { verifyToken, refreshAccessToken } from './auth.js'
import { config } from '../config/env.js'
import { query } from './db.js'
import { logger } from './logger.js'
import { syncRequestLogContext } from './request-log-context.js'
import { getCache, setCache, deleteCache } from './cache.js'
import { singleflight } from './singleflight.js'
import { startStage, mark, noteCacheHit } from '../middlewares/request-timing.js'
import {
  resolveRequestBillingSubscription,
  resolveRequestSubscription,
} from './request-subscription.js'
import {
  getEffectiveTenant,
  impersonationCanAccessBranch,
  getImpersonationEffectivePermissions,
  isImpersonating,
} from './impersonation.js'
import { assertImpersonationAllowsMutation } from './impersonation-guards.js'
import {
  getActiveTenantFromRequest,
  getPrimaryTenantForUser,
  userCanAccessTenant,
} from './tenant-switch.js'
import { getTenantAssignmentForUser, isPrimaryTenantContact } from './workspace-tenant.js'
import {
  getRolesForUser,
  getPermissionsForUser,
  hasPermission,
  invalidateUserPermissionCache,
} from './permissions.js'
import {
  canUseCrossRequestTenantCaches,
  getTenantContextBundle,
  setTenantContextBundle,
} from './tenant-context-cache.js'
import {
  ensureTenantSystemRoles,
  assignOwnerRoleForUser,
  userHasOwnerRole,
} from './tenant-roles.js'
import { assertStaffPortalRouteAccess, STAFF_PORTAL_APP_ROLE } from './staff-portal-auth.js'
import {
  extractAccessToken,
  extractBearerToken,
  extractRefreshToken,
  isBearerAuthRequest,
} from './mobile-auth.js'
import { isBillingRecoveryPath } from './billing/billing-recovery-paths.js'
import { normalizeIdentityEmail, isUniqueViolation } from './identity-normalize.js'

export { extractBearerToken, extractAccessToken, isBearerAuthRequest } from './mobile-auth.js'

const TENANT_REQ_CACHE_TTL = 180 // seconds
const USER_BY_SUB_CACHE_TTL = 300 // seconds

function userBySubCacheKey(sub) {
  return `user:sub:${sub}`
}

export async function invalidateUserBySubCache(sub) {
  if (!sub) return
  await deleteCache(userBySubCacheKey(sub)).catch(() => {})
}

/** Clear cached tenant resolution for a user (role change, workspace bind, invite accept). */
export async function invalidateRequestTenantCache(userId, tenantType) {
  if (!userId || !tenantType) return
  await deleteCache(`tenant:req:${userId}:${tenantType}`).catch(() => {})
}

// Extract token from cookie
export function extractTokenFromCookie(req) {
  return req.cookies.access_token
}

// Extract refresh token from cookie
export function extractRefreshTokenFromCookie(req) {
  return req.cookies.refresh_token
}

function authCookieOptions(maxAge) {
  const opts = {
    httpOnly: true,
    secure: config.COOKIE_SECURE,
    sameSite: config.COOKIE_SAME_SITE,
    path: '/',
    maxAge,
  }
  if (config.COOKIE_DOMAIN) {
    opts.domain = config.COOKIE_DOMAIN
  }
  return opts
}

// Set auth cookies (use COOKIE_SAME_SITE=none on Railway when web and API are different hosts)
export function setAuthCookies(res, accessToken, refreshToken) {
  res.cookie('access_token', accessToken, authCookieOptions(60 * 60 * 1000))
  res.cookie('refresh_token', refreshToken, authCookieOptions(7 * 24 * 60 * 60 * 1000))
}

// Clear auth cookies (same path/sameSite as setAuthCookies so browser actually removes them)
export function clearAuthCookies(res) {
  const opts = {
    path: '/',
    sameSite: config.COOKIE_SAME_SITE,
    secure: config.COOKIE_SECURE,
    ...(config.COOKIE_DOMAIN ? { domain: config.COOKIE_DOMAIN } : {}),
  }
  res.clearCookie('access_token', opts)
  res.clearCookie('refresh_token', opts)
}

// Get user from database by Keycloak sub (short TTL cache — hot path on every authenticated request)
export async function getUserBySub(sub, req = null) {
  try {
    const cacheKey = userBySubCacheKey(sub)
    const cached = await getCache(cacheKey)
    if (cached !== null) {
      if (req?._perf) noteCacheHit(req, 'userBySub')
      return cached === 'null' ? null : cached
    }

    return singleflight(cacheKey, async () => {
      const again = await getCache(cacheKey)
      if (again !== null) {
        if (req?._perf) noteCacheHit(req, 'userBySub')
        return again === 'null' ? null : again
      }

      const lookupStart = req?._perf ? process.hrtime.bigint() : null
      const result = await query(
        'SELECT * FROM app_user WHERE keycloak_sub = $1 AND COALESCE(is_active, TRUE) = TRUE',
        [sub],
        req
      )
      if (lookupStart != null && req?._perf) {
        req._perf.stages.userLookup = Math.round(
          Number(process.hrtime.bigint() - lookupStart) / 1_000_000
        )
      }
      const user = result.rows[0] || null
      await setCache(cacheKey, user ?? 'null', USER_BY_SUB_CACHE_TTL).catch(() => {})
      return user
    })
  } catch (error) {
    logger.error('Error getting user by sub', { error: error.message })
    throw error
  }
}

function rolesFromAccessPayload(payload) {
  const realmRoles = payload.realm_access?.roles || []
  const azp = payload.azp
  const clientRoles =
    azp && payload.resource_access?.[azp]?.roles ? payload.resource_access[azp].roles : []
  return [...new Set([...realmRoles, ...clientRoles])]
}

/** Mobile/native bearer: link Keycloak JWT to app_user (same as web OAuth callback upsert). */
export async function ensureUserForAccessPayload(payload, req = null) {
  let user = await getUserBySub(payload.sub, req)
  if (user) return user

  return upsertUser(
    {
      sub: payload.sub,
      email: payload.email ?? payload.preferred_username,
      given_name: payload.given_name,
      family_name: payload.family_name,
    },
    rolesFromAccessPayload(payload)
  )
}

// Create or update user in database
export async function upsertUser(userInfo, roles = []) {
  try {
    const { sub, email, given_name, family_name } = userInfo
    const normalizedEmail = normalizeIdentityEmail(email)
    const displayName = `${given_name || ''} ${family_name || ''}`.trim() || normalizedEmail

    logger.debug('Upserting user', { sub })

    // Normalize to lowercase for comparison (Keycloak may return different casing)
    const rolesLower = (roles || []).map((r) => String(r).toLowerCase())
    const hasRole = (name) => rolesLower.includes(name.toLowerCase())

    // Platform roles take precedence over staff_portal for dual-role Keycloak users.
    let explicitRole = null
    if (hasRole('admin')) {
      explicitRole = 'ADMIN'
    } else if (hasRole('supplier')) {
      explicitRole = 'SUPPLIER'
    } else if (hasRole('restaurant')) {
      explicitRole = 'RESTAURANT'
    } else if (hasRole('staff_portal') || hasRole('staff_portal_user')) {
      explicitRole = STAFF_PORTAL_APP_ROLE
    } else {
      const emailLower = normalizedEmail
      if (emailLower === 'admin@supplify.com' || emailLower === 'supplifyadmin@supplify.com') {
        explicitRole = 'ADMIN'
      } else if (emailLower === 'supplier@supplify.com') {
        explicitRole = 'SUPPLIER'
      } else if (emailLower === 'restaurant@supplify.com') {
        explicitRole = 'RESTAURANT'
      }
    }
    const insertRole = explicitRole || 'PENDING'

    const PLATFORM_ROLES = new Set(['ADMIN', 'SUPPLIER', 'RESTAURANT'])
    const existingLookup = await query(
      `SELECT role, is_active FROM app_user WHERE keycloak_sub = $1 OR LOWER(email) = LOWER($2) LIMIT 1`,
      [sub, normalizedEmail]
    )
    const existingUser = existingLookup.rows[0]
    if (existingUser && existingUser.is_active === false) {
      throw Object.assign(new Error('Account is deactivated'), {
        name: 'ACCOUNT_DEACTIVATED',
        code: 'ACCOUNT_DEACTIVATED',
      })
    }
    const existingRole = existingUser?.role
    if (
      existingRole &&
      PLATFORM_ROLES.has(existingRole) &&
      explicitRole === STAFF_PORTAL_APP_ROLE
    ) {
      explicitRole = null
    }

    // Match by keycloak_sub or email so seeded placeholder subs (e.g. admin-sub) link on first login
    const result = await query(
      `
      WITH updated AS (
        UPDATE app_user
        SET
          keycloak_sub = $1,
          email = $2,
          display_name = $3,
          role = COALESCE($4, role),
          updated_at = now()
        WHERE keycloak_sub = $1 OR LOWER(email) = LOWER($2)
        RETURNING *
      ),
      inserted AS (
        INSERT INTO app_user (keycloak_sub, email, display_name, role)
        SELECT $1, $2, $3, $5
        WHERE NOT EXISTS (SELECT 1 FROM updated)
        RETURNING *
      )
      SELECT * FROM updated
      UNION ALL
      SELECT * FROM inserted
    `,
      [sub, normalizedEmail, displayName, explicitRole, insertRole]
    )

    logger.debug('User upserted', { userId: result.rows[0]?.id, role: result.rows[0]?.role })
    const row = result.rows[0]
    if (sub) await invalidateUserBySubCache(sub)
    return row
  } catch (error) {
    logger.error('Error upserting user', { error: error.message, code: error.code })
    if (isUniqueViolation(error)) error.identityField = 'email'
    throw error
  }
}

// Authentication middleware
export async function requireAuth(req, res, next) {
  startStage(req, 'auth')
  try {
    const bearerToken = extractBearerToken(req)
    const accessToken = extractAccessToken(req)
    req.authMethod = bearerToken ? 'bearer' : accessToken ? 'cookie' : null

    if (!accessToken) {
      return res.status(401).json({
        ok: false,
        data: null,
        error: {
          name: 'UNAUTHORIZED',
          message: 'No access token provided',
        },
        requestId: req.requestId,
      })
    }

    try {
      // Verify the access token
      const payload = await verifyToken(accessToken)
      req.user = payload
      req.userSub = payload.sub

      // Get user from database (mobile bearer upserts on first login)
      const user = bearerToken
        ? await ensureUserForAccessPayload(payload, req)
        : await getUserBySub(payload.sub, req)
      if (!user) {
        mark(req, 'auth')
        return res.status(401).json({
          ok: false,
          data: null,
          error: {
            name: 'UNAUTHORIZED',
            message: 'User not found',
          },
          requestId: req.requestId,
        })
      }

      req.userData = user
      syncRequestLogContext(req)
      const staffPortalBlock = assertStaffPortalRouteAccess(req, user)
      if (staffPortalBlock) {
        mark(req, 'auth')
        return res.status(staffPortalBlock.status).json(staffPortalBlock.body)
      }
      mark(req, 'auth')
      if (await assertImpersonationAllowsMutation(req, res)) return
      next()
    } catch (error) {
      logger.debug('Token verification failed, attempting refresh')

      // Bearer clients refresh via POST /auth/mobile/refresh — no cookie refresh here.
      if (bearerToken) {
        clearAuthCookies(res)
        return res.status(401).json({
          ok: false,
          data: null,
          error: {
            name: 'JWT_EXPIRED',
            message: 'Access token expired. Refresh via POST /auth/mobile/refresh.',
          },
          requestId: req.requestId,
        })
      }

      // Token is invalid or expired, try to refresh (cookie / web clients)
      const refreshToken = extractRefreshTokenFromCookie(req)

      if (!refreshToken) {
        logger.debug('No refresh token available')
        clearAuthCookies(res)
        return res.status(401).json({
          ok: false,
          data: null,
          error: {
            name: 'UNAUTHORIZED',
            message: 'Invalid token and no refresh token',
          },
          requestId: req.requestId,
        })
      }

      // Attempt to refresh the token
      logger.debug('Attempting to refresh token')
      const newTokens = await refreshAccessToken(refreshToken)

      if (!newTokens) {
        logger.warn('Token refresh returned null')
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

      logger.debug('Token refresh successful')

      // Set new cookies
      setAuthCookies(res, newTokens.access_token, newTokens.refresh_token)

      // Verify the new token
      const payload = await verifyToken(newTokens.access_token)
      req.user = payload
      req.userSub = payload.sub

      // Get user from database
      const user = await getUserBySub(payload.sub, req)
      if (!user) {
        mark(req, 'auth')
        return res.status(401).json({
          ok: false,
          data: null,
          error: {
            name: 'UNAUTHORIZED',
            message: 'User not found',
          },
          requestId: req.requestId,
        })
      }

      req.userData = user
      syncRequestLogContext(req)
      const staffPortalBlock = assertStaffPortalRouteAccess(req, user)
      if (staffPortalBlock) {
        mark(req, 'auth')
        return res.status(staffPortalBlock.status).json(staffPortalBlock.body)
      }
      mark(req, 'auth')
      if (await assertImpersonationAllowsMutation(req, res)) return
      next()
    }
  } catch (error) {
    mark(req, 'auth')
    logger.error('Authentication error', { error: error.message })
    clearAuthCookies(res)
    return res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Authentication failed',
      },
      requestId: req.requestId,
    })
  }
}

// Optional authentication middleware - doesn't fail if token is missing, but sets req.userData if available
export async function optionalAuth(req, res, next) {
  try {
    const bearerToken = extractBearerToken(req)
    const accessToken = extractAccessToken(req)

    if (!accessToken) {
      // No token, continue without authentication
      return next()
    }

    try {
      // Verify the access token
      const payload = await verifyToken(accessToken)
      req.user = payload
      req.userSub = payload.sub

      // Get user from database
      const user = await getUserBySub(payload.sub)
      if (user) {
        req.userData = user
        syncRequestLogContext(req)
      }
    } catch (error) {
      // Bearer clients do not silently refresh in optionalAuth.
      if (bearerToken) {
        return next()
      }

      // Token is invalid or expired, try to refresh (cookie / web clients)
      const refreshToken = extractRefreshTokenFromCookie(req)

      if (refreshToken) {
        try {
          const newTokens = await refreshAccessToken(refreshToken)

          if (newTokens) {
            // Set new cookies
            setAuthCookies(res, newTokens.access_token, newTokens.refresh_token)

            // Verify the new token
            const payload = await verifyToken(newTokens.access_token)
            req.user = payload
            req.userSub = payload.sub

            // Get user from database
            const user = await getUserBySub(payload.sub)
            if (user) {
              req.userData = user
              syncRequestLogContext(req)
            }
          }
        } catch (refreshError) {
          // Refresh failed, continue without authentication
          logger.debug('Token refresh failed in optionalAuth, continuing without auth')
        }
      }
    }

    next()
  } catch (error) {
    // If anything fails, just continue without authentication
    logger.debug('Optional auth error, continuing without auth:', error.message)
    next()
  }
}

// Role-based access control middleware
export function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.userData) {
      return res.status(401).json({
        ok: false,
        data: null,
        error: {
          name: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
        requestId: req.requestId,
      })
    }

    const userRole = req.userData.role
    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]

    if (!roles.includes(userRole)) {
      if (userRole === 'ADMIN') {
        const effective = getEffectiveTenant(req)
        if (effective && roles.includes(effective.tenantType)) {
          return next()
        }
      }
      return res.status(403).json({
        ok: false,
        data: null,
        error: {
          name: 'FORBIDDEN',
          message: `Access denied. Required roles: ${roles.join(', ')}`,
        },
        requestId: req.requestId,
      })
    }

    next()
  }
}

/**
 * Assign default owner role to a user for a tenant when they have no roles.
 * Idempotent: uses ON CONFLICT DO NOTHING.
 * @param {string} userId - app_user.id
 * @param {string} tenantId - restaurant or supplier id
 * @param {string} tenantType - 'RESTAURANT' | 'SUPPLIER'
 * @returns {Promise<boolean>} true if an insert was done (or already had role)
 */
export async function assignDefaultRoleForTenant(userId, tenantId, tenantType) {
  const roleCode =
    tenantType === 'RESTAURANT'
      ? 'RESTAURANT_OWNER'
      : tenantType === 'SUPPLIER'
        ? 'SUPPLIER_OWNER'
        : null
  if (!roleCode) return false
  try {
    const { rowCount } = await query(
      `
      INSERT INTO user_role (user_id, role_id, tenant_id, tenant_type)
      SELECT $1, r.id, $2::uuid, $3
      FROM role r
      WHERE r.code = $4 AND r.tenant_type = $3
      ON CONFLICT (user_id, role_id, tenant_id, tenant_type) DO NOTHING
    `,
      [userId, tenantId, tenantType, roleCode]
    )
    await ensureTenantSystemRoles(tenantId, tenantType).catch(() => {})
    await assignOwnerRoleForUser(userId, tenantId, tenantType).catch(() => {})
    return rowCount !== undefined
  } catch (err) {
    if (err.code === '42P01') return false // tables don't exist
    logger.error('assignDefaultRoleForTenant error', { error: err.message })
    return false
  }
}

/**
 * Get the tenant (restaurant or supplier) for this request.
 * When admin is impersonating, returns the impersonated tenant.
 * Otherwise for RESTAURANT/SUPPLIER resolves by contact_email.
 *
 * Process-level caching (60s TTL, via getCache/setCache) is applied only on the common path
 * where there is no impersonation, no active-tenant cookie, and no x-branch-id header.
 * Impersonation and branch-switch paths always bypass the cache.
 *
 * @param {import('express').Request} req
 * @returns {Promise<{ tenantId: string, tenantType: string, tenantName: string } | null>}
 */
export async function getRequestTenant(req) {
  startStage(req, 'tenant')
  if (req._requestTenantResolved) {
    return req._requestTenantCache ?? null
  }
  req._requestTenantResolved = true

  const finish = (tenant) => {
    req._requestTenantCache = tenant ?? null
    mark(req, 'tenant')
    return req._requestTenantCache
  }

  if (!req.userData) return finish(null)
  if (req.userData.role === 'PENDING') return finish(null)

  const effective = getEffectiveTenant(req)
  const activeFromCookie = await getActiveTenantFromRequest(req)
  if (effective && activeFromCookie) {
    const branchOk = await impersonationCanAccessBranch(
      effective.tenantId,
      effective.tenantType,
      activeFromCookie.tenantId,
      activeFromCookie.tenantType
    )
    if (branchOk) return finish(activeFromCookie)
  }
  if (effective) return finish(effective)

  const branchHeader = req.headers['x-branch-id']
  if (branchHeader && req.userData?.role === 'SUPPLIER') {
    const { userCanAccessTenant } = await import('./tenant-switch.js')
    const allowed = await userCanAccessTenant(
      req.userData.id,
      req.userData.email,
      branchHeader,
      'SUPPLIER'
    )
    if (allowed) {
      const { rows } = await query(`SELECT id, name FROM supplier WHERE id = $1`, [branchHeader])
      if (rows.length) {
        return finish({
          tenantId: rows[0].id,
          tenantType: 'SUPPLIER',
          tenantName: rows[0].name || '',
        })
      }
    }
  }

  if (activeFromCookie) return finish(activeFromCookie)

  // --- Process-level cache for the common path (no impersonation, no active-tenant cookie, no branch header) ---
  const userId = req.userData.id
  const tenantType = req.userData.role
  if (
    (tenantType === 'RESTAURANT' || tenantType === 'SUPPLIER') &&
    !branchHeader &&
    !activeFromCookie &&
    !effective
  ) {
    const processCacheKey = `tenant:req:${userId}:${tenantType}`
    const cachedTenant = await getCache(processCacheKey)
    if (cachedTenant !== null) {
      noteCacheHit(req, 'requestTenant')
      return finish(cachedTenant === 'null' ? null : cachedTenant)
    }

    const resolved = await singleflight(processCacheKey, async () => {
      const again = await getCache(processCacheKey)
      if (again !== null) return again === 'null' ? null : again

      let tenantResolved = null

      const assignment = await getTenantAssignmentForUser(userId, tenantType)
      if (assignment?.tenantId) {
        const allowed = await userCanAccessTenant(
          userId,
          req.userData.email,
          assignment.tenantId,
          assignment.tenantType
        )
        if (allowed) {
          tenantResolved = {
            tenantId: assignment.tenantId,
            tenantType: assignment.tenantType,
            tenantName: assignment.tenantName || '',
          }
        }
      }

      await setCache(processCacheKey, tenantResolved ?? 'null', TENANT_REQ_CACHE_TTL).catch(
        () => {}
      )
      return tenantResolved
    })

    return finish(resolved)
  }
  // --- End process-level cache ---

  if (req.userData.role === 'RESTAURANT' || req.userData.role === 'SUPPLIER') {
    const assignment = await getTenantAssignmentForUser(req.userData.id, req.userData.role)
    if (assignment?.tenantId) {
      const allowed = await userCanAccessTenant(
        req.userData.id,
        req.userData.email,
        assignment.tenantId,
        assignment.tenantType
      )
      if (allowed) {
        return finish({
          tenantId: assignment.tenantId,
          tenantType: assignment.tenantType,
          tenantName: assignment.tenantName || '',
        })
      }
    }
  }

  return finish(null)
}

/**
 * Get restaurant id for this request (from impersonation or from user email). Returns null if not a restaurant context.
 */
export async function getRestaurantIdForRequest(req) {
  const tenant = await getRequestTenant(req)
  return tenant?.tenantType === 'RESTAURANT' ? tenant.tenantId : null
}

/**
 * Get supplier id for this request (from impersonation or from user email). Returns null if not a supplier context.
 */
export async function getSupplierIdForRequest(req) {
  const tenant = await getRequestTenant(req)
  return tenant?.tenantType === 'SUPPLIER' ? tenant.tenantId : null
}

/**
 * Primary tenant contact (contact_email) always receives the Owner role so core flows work
 * even if they were previously assigned a narrower role (e.g. Accountant).
 */
export async function ensurePrimaryContactOwnerRole(userId, email, tenantId, tenantType) {
  if (!userId || !email || !tenantId || !tenantType) return false
  if (tenantType !== 'RESTAURANT' && tenantType !== 'SUPPLIER') return false

  const emailLower = email.trim().toLowerCase()
  if (!emailLower) return false

  const table = tenantType === 'RESTAURANT' ? 'restaurant' : 'supplier'
  const { rows } = await query(
    `SELECT LOWER(TRIM(contact_email)) AS contact_email FROM ${table} WHERE id = $1`,
    [tenantId]
  )
  if (rows.length === 0 || rows[0].contact_email !== emailLower) return false

  if (await userHasOwnerRole(userId, tenantId, tenantType)) return false

  // Do not override explicit team roles from invitations (Viewer, Accountant, etc.)
  const { rows: assigned } = await query(
    `
    SELECT tr.name
    FROM tenant_user_roles tur
    JOIN tenant_roles tr ON tr.id = tur.role_id
    WHERE tur.user_id = $1 AND tur.tenant_id = $2 AND tur.tenant_type = $3
    LIMIT 1
    `,
    [userId, tenantId, tenantType]
  )
  if (assigned.length > 0 && assigned[0].name !== 'Owner') {
    return false
  }

  await assignOwnerRoleForUser(userId, tenantId, tenantType)
  await invalidateUserPermissionCache(userId, tenantId, tenantType)
  logger.info('Assigned Owner role to primary tenant contact', {
    userId,
    tenantId,
    tenantType,
  })
  return true
}

/**
 * Resolve tenant context and attach roles + permissions for the current user in that tenant.
 * Sets req.tenantContext = { tenantId, tenantType, tenantName, roles[], permissions[] }.
 * When admin is impersonating, context is for the impersonated tenant; permissions are still for the current user
 * (admin with no user_role in tenant gets [] — must use adminContext.permissions on admin routes).
 * Use after requireAuth on restaurant/supplier routes.
 */
export function resolveTenantContext(req, res, next) {
  startStage(req, 'tenantContext')
  getRequestTenant(req)
    .then(async (tenant) => {
      if (!tenant) {
        req.tenantContext = null
        mark(req, 'tenantContext')
        return next()
      }

      const billingSub = await resolveRequestBillingSubscription(req, tenant)
      if (
        billingSub?.status === 'SUSPENDED' &&
        req.userData.role !== 'ADMIN' &&
        !isBillingRecoveryPath(req.method, req)
      ) {
        mark(req, 'tenantContext')
        return res.status(403).json({
          ok: false,
          data: null,
          error: {
            name: 'SUBSCRIPTION_SUSPENDED',
            message: 'Access is suspended. Please contact support.',
          },
          requestId: req.requestId,
        })
      }

      const effectiveTenant = getEffectiveTenant(req)
      const useBundleCache =
        canUseCrossRequestTenantCaches(req) && !(req.userData.role === 'ADMIN' && effectiveTenant)

      let roles
      let permissions

      if (useBundleCache) {
        const bundle = await getTenantContextBundle(
          req.userData.id,
          tenant.tenantId,
          tenant.tenantType,
          req
        )
        roles = bundle.roles
        permissions = bundle.permissions
      } else {
        roles = await getRolesForUser(req.userData.id, tenant.tenantId, tenant.tenantType, req)
        permissions = await getPermissionsForUser(
          req.userData.id,
          tenant.tenantId,
          tenant.tenantType
        )
      }

      if (roles.length === 0) {
        // Cold path: user has no roles — run setup helpers then re-fetch.
        await ensurePrimaryContactOwnerRole(
          req.userData.id,
          req.userData.email,
          tenant.tenantId,
          tenant.tenantType
        )
        await ensureTenantSystemRoles(tenant.tenantId, tenant.tenantType).catch(() => {})
        roles = await getRolesForUser(req.userData.id, tenant.tenantId, tenant.tenantType, req)
        permissions = await getPermissionsForUser(
          req.userData.id,
          tenant.tenantId,
          tenant.tenantType
        )
      }

      if (req.userData.role === 'ADMIN' && effectiveTenant) {
        permissions = await getImpersonationEffectivePermissions(
          effectiveTenant.tenantId,
          effectiveTenant.tenantType,
          effectiveTenant.viewAsRoleId
        )
        roles = effectiveTenant.viewAsRoleId
          ? (
              await query(`SELECT name FROM tenant_roles WHERE id = $1`, [
                effectiveTenant.viewAsRoleId,
              ])
            ).rows.map((r) => r.name)
          : ['Owner (impersonation)']
      }
      // Only the primary tenant contact gets an automatic Owner role when unassigned.
      if (
        roles.length === 0 &&
        (req.userData.role === 'RESTAURANT' || req.userData.role === 'SUPPLIER')
      ) {
        const isPrimary = await isPrimaryTenantContact(
          req.userData.id,
          req.userData.email,
          tenant.tenantId,
          tenant.tenantType
        )
        if (isPrimary) {
          await assignDefaultRoleForTenant(req.userData.id, tenant.tenantId, tenant.tenantType)
          roles = await getRolesForUser(req.userData.id, tenant.tenantId, tenant.tenantType, req)
          permissions = await getPermissionsForUser(
            req.userData.id,
            tenant.tenantId,
            tenant.tenantType
          )
        }
      }

      if (useBundleCache && roles.length > 0) {
        await setTenantContextBundle(
          req.userData.id,
          tenant.tenantId,
          tenant.tenantType,
          roles,
          permissions
        )
      }
      req.tenantContext = {
        tenantId: tenant.tenantId,
        tenantType: tenant.tenantType,
        tenantName: tenant.tenantName || '',
        roles,
        permissions,
      }
      await resolveRequestSubscription(req, tenant)
      syncRequestLogContext(req)
      mark(req, 'tenantContext')
      next()
    })
    .catch((err) => {
      mark(req, 'tenantContext')
      logger.error('resolveTenantContext error', { error: err.message })
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to resolve tenant context' },
        requestId: req.requestId,
      })
    })
}

/**
 * Resolve admin context and attach roles + permissions for the current user in ADMIN scope.
 * Sets req.adminContext = { roles[], permissions[] }.
 * Use after requireAuth and requireRole(['ADMIN']) on admin routes.
 */
async function ensureDefaultAdminRole(userId) {
  if (!config.ALLOW_AUTO_SUPER_ADMIN) return
  try {
    await query(
      `
      INSERT INTO user_role (user_id, role_id, tenant_id, tenant_type)
      SELECT $1, r.id, NULL, 'ADMIN'
      FROM role r
      WHERE r.code = 'SUPER_ADMIN' AND r.tenant_type = 'ADMIN'
      ON CONFLICT (user_id, role_id, tenant_id, tenant_type) DO NOTHING
    `,
      [userId]
    )
  } catch (err) {
    if (err.code !== '42P01') {
      logger.warn('ensureDefaultAdminRole failed', { error: err.message, userId })
    }
  }
}

export async function resolveAdminContext(req, res, next) {
  if (req.userData?.role !== 'ADMIN') {
    req.adminContext = null
    return next()
  }
  try {
    let roles = await getRolesForUser(req.userData.id, null, 'ADMIN')
    if (roles.length === 0) {
      await ensureDefaultAdminRole(req.userData.id)
      roles = await getRolesForUser(req.userData.id, null, 'ADMIN')
    }
    const permissions = await getPermissionsForUser(req.userData.id, null, 'ADMIN')
    req.adminContext = { roles, permissions }
    next()
  } catch (err) {
    logger.error('resolveAdminContext error', { error: err.message })
    req.adminContext = { roles: [], permissions: [] }
    next()
  }
}

/**
 * Require a permission in tenant or admin context. Use after resolveTenantContext or resolveAdminContext.
 * Allows access when tenantContext.permissions or adminContext.permissions includes the key
 * (or a broader *_MANAGE permission).
 * @param {string} permissionKey - e.g. 'ORDERS_VIEW', 'SETTINGS_MANAGE'
 */
export function requirePermission(permissionKey) {
  return (req, res, next) => {
    const tenant = req.tenantContext
    const admin = req.adminContext
    if (tenant?.roles?.includes('Owner')) {
      return next()
    }
    const perms = tenant?.permissions ?? admin?.permissions ?? []
    if (hasPermission(perms, permissionKey)) {
      return next()
    }
    return res.status(403).json({
      ok: false,
      data: null,
      error: {
        name: 'FORBIDDEN',
        message: `Missing permission: ${permissionKey}`,
      },
      requestId: req.requestId,
    })
  }
}

/** Allow route when the user has any one of the listed permissions. */
export function requireAnyPermission(...permissionKeys) {
  return (req, res, next) => {
    const tenant = req.tenantContext
    const admin = req.adminContext
    if (tenant?.roles?.includes('Owner')) {
      return next()
    }
    const perms = tenant?.permissions ?? admin?.permissions ?? []
    if (permissionKeys.some((key) => hasPermission(perms, key))) {
      return next()
    }
    return res.status(403).json({
      ok: false,
      data: null,
      error: {
        name: 'FORBIDDEN',
        message: `Missing one of: ${permissionKeys.join(', ')}`,
      },
      requestId: req.requestId,
    })
  }
}

// Check if user owns resource (for suppliers/restaurants)
export function requireOwnership(ownerType) {
  return (req, res, next) => {
    if (!req.userData) {
      return res.status(401).json({
        ok: false,
        data: null,
        error: {
          name: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
        requestId: req.requestId,
      })
    }

    const userRole = req.userData.role

    // Admin can access everything
    if (userRole === 'ADMIN') {
      return next()
    }

    // Check if user role matches the required ownership type
    if (ownerType === 'SUPPLIER' && userRole !== 'SUPPLIER') {
      return res.status(403).json({
        ok: false,
        data: null,
        error: {
          name: 'FORBIDDEN',
          message: 'Access denied. Supplier ownership required',
        },
        requestId: req.requestId,
      })
    }

    if (ownerType === 'RESTAURANT' && userRole !== 'RESTAURANT') {
      return res.status(403).json({
        ok: false,
        data: null,
        error: {
          name: 'FORBIDDEN',
          message: 'Access denied. Restaurant ownership required',
        },
        requestId: req.requestId,
      })
    }

    next()
  }
}

export {
  getUserWorkspaceMembership,
  bindUserToWorkspace,
  assertUserCanJoinWorkspace,
  assertEmailCanJoinWorkspace,
  resolveWorkspaceScope,
  MAIN_ADMIN_ROLE_NAME,
} from './workspace-membership.js'

export {
  requireTenantPermission,
  requireSupplierPermission,
  requireRestaurantPermission,
  assertCanAssignRole,
  assertCanGrantPermissions,
} from './rbac-guards.js'
