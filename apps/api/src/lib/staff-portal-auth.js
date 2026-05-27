import { query } from './db.js'

export const STAFF_PORTAL_APP_ROLE = 'STAFF_PORTAL'
export const STAFF_PORTAL_KEYCLOAK_ROLE = 'staff_portal'

/** Paths operational staff may hit while authenticated (no /app APIs). */
const STAFF_PORTAL_ALLOWED_PREFIXES = [
  '/auth/me',
  '/auth/logout',
  '/auth/refresh',
  '/auth/session',
  '/api/staff/self',
]

export function isStaffPortalOnlyUser(user) {
  return user?.role === STAFF_PORTAL_APP_ROLE
}

export function hasPlatformAppAccess(user) {
  return Boolean(user) && user.role !== STAFF_PORTAL_APP_ROLE
}

export function isStaffPortalAllowedRequest(req) {
  const path = req.originalUrl?.split('?')[0] || req.path || ''
  return STAFF_PORTAL_ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix))
}

/**
 * Reject staff-portal-only users on platform admin APIs.
 * Call from requireAuth after req.userData is set.
 */
export function assertStaffPortalRouteAccess(req, user) {
  if (!isStaffPortalOnlyUser(user)) {
    return null
  }
  if (isStaffPortalAllowedRequest(req)) {
    return null
  }
  return {
    status: 403,
    body: {
      ok: false,
      data: null,
      error: {
        name: 'STAFF_PORTAL_FORBIDDEN',
        message: 'Staff portal accounts cannot access the restaurant admin app.',
      },
      requestId: req.requestId,
    },
  }
}

export async function getStaffMemberForPortalUser(userId) {
  const { rows } = await query(
    `
      SELECT sm.*
      FROM staff_member sm
      WHERE sm.user_id = $1
        AND sm.portal_access_enabled = true
        AND sm.status = 'ACTIVE'
      LIMIT 1
    `,
    [userId]
  )
  return rows[0] || null
}

export async function touchStaffPortalLastLogin(staffId) {
  await query(
    `
      UPDATE staff_member
      SET portal_last_login_at = now(), updated_at = now()
      WHERE id = $1
    `,
    [staffId]
  )
}

/**
 * Attach req.staffPortal = { staffId, restaurantId, staffMember } for self-service routes.
 */
export async function requireStaffPortalAuth(req, res, next) {
  try {
    if (!req.userData) {
      return res.status(401).json({
        ok: false,
        data: null,
        error: { name: 'UNAUTHORIZED', message: 'Authentication required' },
        requestId: req.requestId,
      })
    }

    const staffMember = await getStaffMemberForPortalUser(req.userData.id)
    if (!staffMember) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: {
          name: 'STAFF_PORTAL_ACCESS_DENIED',
          message: 'No active staff portal profile is linked to this account.',
        },
        requestId: req.requestId,
      })
    }

    req.staffPortal = {
      staffId: staffMember.id,
      restaurantId: staffMember.restaurant_id,
      staffMember,
    }

    await touchStaffPortalLastLogin(staffMember.id)
    next()
  } catch (error) {
    next(error)
  }
}

export function requirePlatformAppAccess(req, res, next) {
  if (!req.userData) {
    return res.status(401).json({
      ok: false,
      data: null,
      error: { name: 'UNAUTHORIZED', message: 'Authentication required' },
      requestId: req.requestId,
    })
  }
  if (isStaffPortalOnlyUser(req.userData)) {
    return res.status(403).json({
      ok: false,
      data: null,
      error: {
        name: 'STAFF_PORTAL_FORBIDDEN',
        message: 'Staff portal accounts cannot access the restaurant admin app.',
      },
      requestId: req.requestId,
    })
  }
  next()
}
