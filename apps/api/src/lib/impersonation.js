/**
 * Admin impersonation: signed short-lived token and effective-tenant helper.
 * Used so admins can "view as" a Restaurant or Supplier without logging in as that tenant.
 */
import { randomUUID } from 'crypto'
import * as jose from 'jose'
import { config } from '../config/env.js'
import { logger } from './logger.js'
import { query } from './db.js'

const COOKIE_NAME = 'impersonation_token'
const ALG = 'HS256'

/**
 * Create a signed impersonation token (JWT).
 * @param {{ adminUserId: string, tenantId: string, tenantType: string, tenantName: string, sessionId?: string }} payload
 * @returns {Promise<string>} JWT
 */
export async function createImpersonationToken(payload) {
  const secret = new TextEncoder().encode(config.IMPERSONATION_SECRET)
  const maxMin = config.IMPERSONATION_MAX_DURATION_MINUTES || 60
  const exp = Math.floor(Date.now() / 1000) + maxMin * 60
  const sessionId = payload.sessionId || randomUUID()
  const token = await new jose.SignJWT({
    adminUserId: payload.adminUserId,
    tenantId: payload.tenantId,
    tenantType: payload.tenantType,
    tenantName: payload.tenantName || '',
    sessionId,
    viewAsRoleId: payload.viewAsRoleId || null,
  })
    .setProtectedHeader({ alg: ALG })
    .setJti(sessionId)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(secret)
  return token
}

/**
 * Verify and decode impersonation token. Returns null if invalid or expired.
 * @param {string} token
 * @returns {Promise<{ adminUserId: string, tenantId: string, tenantType: string, tenantName: string, exp: number } | null>}
 */
export async function verifyImpersonationToken(token) {
  if (!token || typeof token !== 'string') return null
  try {
    const secret = new TextEncoder().encode(config.IMPERSONATION_SECRET)
    const { payload } = await jose.jwtVerify(token, secret, { algorithms: [ALG] })
    return {
      adminUserId: payload.adminUserId,
      tenantId: payload.tenantId,
      tenantType: payload.tenantType,
      tenantName: payload.tenantName || '',
      sessionId: payload.sessionId || payload.jti || null,
      viewAsRoleId: payload.viewAsRoleId || null,
      exp: payload.exp,
    }
  } catch (err) {
    logger.debug('Impersonation token verify failed', { reason: err.message })
    return null
  }
}

/**
 * Get the cookie name used for impersonation token.
 */
export function getImpersonationCookieName() {
  return COOKIE_NAME
}

/**
 * Clear impersonation cookie (e.g. on logout to force stop impersonation).
 * @param {import('express').Response} res
 */
export function clearImpersonationCookie(res) {
  if (!res?.clearCookie) return
  res.clearCookie(COOKIE_NAME, {
    path: '/',
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax',
  })
}

/**
 * Get effective tenant for the request.
 * When an admin is impersonating, returns the impersonated tenant only if the current user is the admin who started it.
 * Otherwise returns null (caller should resolve tenant by email or other means).
 * @param {import('express').Request} req - Must have req.userData and optionally req.impersonationContext
 * @returns {{ tenantId: string, tenantType: string, tenantName: string } | null}
 */
export function getEffectiveTenant(req) {
  const ctx = req.impersonationContext
  if (!ctx || !req.userData) return null
  if (ctx.adminUserId !== req.userData.id) return null
  return {
    tenantId: ctx.tenantId,
    tenantType: ctx.tenantType,
    tenantName: ctx.tenantName || '',
    sessionId: ctx.sessionId || null,
    viewAsRoleId: ctx.viewAsRoleId || null,
  }
}

/**
 * Permissions for an admin impersonation session (view-as role or Owner fallback).
 */
export async function getImpersonationEffectivePermissions(tenantId, tenantType, viewAsRoleId) {
  const { getRolePermissionSet } = await import('./rbac-guards.js')
  const { getOwnerRoleId } = await import('./tenant-roles.js')

  let roleId = viewAsRoleId
  if (roleId) {
    const { rows } = await query(
      `SELECT id FROM tenant_roles
       WHERE id = $1 AND tenant_id = $2 AND tenant_type = $3`,
      [roleId, tenantId, tenantType]
    )
    if (!rows.length) roleId = null
  }
  if (!roleId) {
    roleId = await getOwnerRoleId(tenantId, tenantType)
  }
  if (!roleId) return []
  return getRolePermissionSet(roleId)
}

/** True when the authenticated admin is actively impersonating a tenant. */
export function isImpersonating(req) {
  return Boolean(getEffectiveTenant(req))
}

/**
 * During impersonation, verify a branch/linked account belongs to the impersonated tenant's org.
 */
export async function impersonationCanAccessBranch(
  impersonatedTenantId,
  impersonatedTenantType,
  targetTenantId,
  targetTenantType
) {
  if (!impersonatedTenantId || !targetTenantId) return false
  if (impersonatedTenantType !== targetTenantType) return false
  if (impersonatedTenantId === targetTenantId) return true

  const table = targetTenantType === 'SUPPLIER' ? 'supplier' : 'restaurant'
  const { rows: baseRows } = await query(`SELECT organization_id FROM ${table} WHERE id = $1`, [
    impersonatedTenantId,
  ])
  const { rows: targetRows } = await query(`SELECT organization_id FROM ${table} WHERE id = $1`, [
    targetTenantId,
  ])
  const baseOrg = baseRows[0]?.organization_id
  const targetOrg = targetRows[0]?.organization_id
  if (baseOrg && targetOrg && baseOrg === targetOrg) return true

  const { rows: linkRows } = await query(
    `
    SELECT 1 FROM tenant_account_link
    WHERE parent_tenant_id = $1 AND parent_tenant_type = $2
      AND child_tenant_id = $3 AND child_tenant_type = $2
    LIMIT 1
    `,
    [impersonatedTenantId, targetTenantType, targetTenantId]
  )
  return linkRows.length > 0
}
