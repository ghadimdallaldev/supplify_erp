import { verifyToken, refreshAccessToken } from './auth.js'
import { query } from './db.js'
import { logger } from './logger.js'
import { getEffectiveTenant } from './impersonation.js'
import { getRolesForUser, getPermissionsForUser, hasPermission } from './permissions.js'

// Extract token from cookie
export function extractTokenFromCookie(req) {
  return req.cookies.access_token
}

// Extract refresh token from cookie
export function extractRefreshTokenFromCookie(req) {
  return req.cookies.refresh_token
}

// Set auth cookies
export function setAuthCookies(res, accessToken, refreshToken) {
  const isProduction = process.env.NODE_ENV === 'production'

  // In development, use 'lax' for sameSite (works with http://localhost)
  const sameSite = 'lax'

  // Access token cookie (short-lived)
  res.cookie('access_token', accessToken, {
    httpOnly: true,
    secure: isProduction, // Must match sameSite requirements
    sameSite,
    maxAge: 60 * 60 * 1000, // 1 hour (increased from 5 minutes)
  })

  // Refresh token cookie (longer-lived)
  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: isProduction, // Must match sameSite requirements
    sameSite,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  })
}

// Clear auth cookies (same path/sameSite as setAuthCookies so browser actually removes them)
export function clearAuthCookies(res) {
  const isProduction = process.env.NODE_ENV === 'production'
  const opts = { path: '/', sameSite: 'lax', ...(isProduction && { secure: true }) }
  res.clearCookie('access_token', opts)
  res.clearCookie('refresh_token', opts)
}

// Get user from database by Keycloak sub
export async function getUserBySub(sub) {
  try {
    const result = await query('SELECT * FROM app_user WHERE keycloak_sub = $1', [sub])
    return result.rows[0] || null
  } catch (error) {
    logger.error('Error getting user by sub', { error: error.message })
    throw error
  }
}

// Create or update user in database
export async function upsertUser(userInfo, roles = []) {
  try {
    const { sub, email, given_name, family_name } = userInfo
    const displayName = `${given_name || ''} ${family_name || ''}`.trim() || email

    logger.debug('Upserting user', { sub })

    // Normalize to lowercase for comparison (Keycloak may return different casing)
    const rolesLower = (roles || []).map((r) => String(r).toLowerCase())
    const hasRole = (name) => rolesLower.includes(name.toLowerCase())

    // Determine role from Keycloak roles (admin > supplier > restaurant)
    let role = 'RESTAURANT' // default
    if (hasRole('admin')) {
      role = 'ADMIN'
    } else if (hasRole('supplier')) {
      role = 'SUPPLIER'
    } else {
      const emailLower = (email || '').toLowerCase()
      if (emailLower === 'admin@supplify.com' || emailLower === 'supplifyadmin@supplify.com')
        role = 'ADMIN'
      else if (emailLower === 'supplier@supplify.com') role = 'SUPPLIER'
      else role = 'RESTAURANT'
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
          role = $4,
          updated_at = now()
        WHERE keycloak_sub = $1 OR LOWER(email) = LOWER($2)
        RETURNING *
      ),
      inserted AS (
        INSERT INTO app_user (keycloak_sub, email, display_name, role)
        SELECT $1, $2, $3, $4
        WHERE NOT EXISTS (SELECT 1 FROM updated)
        RETURNING *
      )
      SELECT * FROM updated
      UNION ALL
      SELECT * FROM inserted
    `,
      [sub, email, displayName, role]
    )

    logger.debug('User upserted', { userId: result.rows[0]?.id, role })
    return result.rows[0]
  } catch (error) {
    logger.error('Error upserting user', { error: error.message })
    throw error
  }
}

// Authentication middleware
export async function requireAuth(req, res, next) {
  try {
    const accessToken = extractTokenFromCookie(req)

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

      // Get user from database
      const user = await getUserBySub(payload.sub)
      if (!user) {
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
      next()
    } catch (error) {
      logger.debug('Token verification failed, attempting refresh')

      // Token is invalid or expired, try to refresh
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
      const user = await getUserBySub(payload.sub)
      if (!user) {
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
      next()
    }
  } catch (error) {
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
    const accessToken = extractTokenFromCookie(req)

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
      }
    } catch (error) {
      // Token is invalid or expired, try to refresh
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
 * @param {import('express').Request} req
 * @returns {Promise<{ tenantId: string, tenantType: string, tenantName: string } | null>}
 */
export async function getRequestTenant(req) {
  if (!req.userData) return null
  const effective = getEffectiveTenant(req)
  if (effective) return effective
  const email = (req.userData.email || '').trim().toLowerCase()
  if (!email) return null
  if (req.userData.role === 'SUPPLIER') {
    const { rows } = await query(
      'SELECT id, name FROM supplier WHERE LOWER(TRIM(contact_email)) = $1',
      [email]
    )
    if (rows.length)
      return { tenantId: rows[0].id, tenantType: 'SUPPLIER', tenantName: rows[0].name || '' }
  }
  if (req.userData.role === 'RESTAURANT') {
    const { rows } = await query(
      'SELECT id, name FROM restaurant WHERE LOWER(TRIM(contact_email)) = $1',
      [email]
    )
    if (rows.length)
      return { tenantId: rows[0].id, tenantType: 'RESTAURANT', tenantName: rows[0].name || '' }
  }
  return null
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
 * Resolve tenant context and attach roles + permissions for the current user in that tenant.
 * Sets req.tenantContext = { tenantId, tenantType, tenantName, roles[], permissions[] }.
 * When admin is impersonating, context is for the impersonated tenant; permissions are still for the current user
 * (admin with no user_role in tenant gets [] and is allowed via requirePermission special-case).
 * Use after requireAuth on restaurant/supplier routes.
 */
export function resolveTenantContext(req, res, next) {
  getRequestTenant(req)
    .then(async (tenant) => {
      if (!tenant) {
        req.tenantContext = null
        return next()
      }
      const { rows: subRows } = await query(
        `SELECT status FROM subscription WHERE tenant_id = $1 AND tenant_type = $2 ORDER BY created_at DESC LIMIT 1`,
        [tenant.tenantId, tenant.tenantType]
      )
      if (subRows.length > 0 && subRows[0].status === 'SUSPENDED') {
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
      let roles = await getRolesForUser(req.userData.id, tenant.tenantId, tenant.tenantType)
      let permissions = await getPermissionsForUser(
        req.userData.id,
        tenant.tenantId,
        tenant.tenantType
      )
      // If tenant user has no role yet, assign default owner so permission checks succeed
      if (
        roles.length === 0 &&
        (req.userData.role === 'RESTAURANT' || req.userData.role === 'SUPPLIER')
      ) {
        await assignDefaultRoleForTenant(req.userData.id, tenant.tenantId, tenant.tenantType)
        roles = await getRolesForUser(req.userData.id, tenant.tenantId, tenant.tenantType)
        permissions = await getPermissionsForUser(
          req.userData.id,
          tenant.tenantId,
          tenant.tenantType
        )
      }
      req.tenantContext = {
        tenantId: tenant.tenantId,
        tenantType: tenant.tenantType,
        tenantName: tenant.tenantName || '',
        roles,
        permissions,
      }
      next()
    })
    .catch((err) => {
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
export async function resolveAdminContext(req, res, next) {
  if (req.userData?.role !== 'ADMIN') {
    req.adminContext = null
    return next()
  }
  try {
    const roles = await getRolesForUser(req.userData.id, null, 'ADMIN')
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
 * Allows access if:
 * - tenantContext.permissions or adminContext.permissions includes the key (or broader _MANAGE), or
 * - user is ADMIN and (impersonating a tenant, or on admin route with adminContext).
 * @param {string} permissionKey - e.g. 'ORDERS_VIEW', 'SETTINGS_MANAGE'
 */
export function requirePermission(permissionKey) {
  return (req, res, next) => {
    const tenant = req.tenantContext
    const admin = req.adminContext
    const perms = tenant?.permissions ?? admin?.permissions ?? []
    if (hasPermission(perms, permissionKey)) {
      return next()
    }
    if (req.userData?.role === 'ADMIN') {
      if (getEffectiveTenant(req)) return next()
      if (!tenant && admin) return next()
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
