import * as jose from 'jose'
import { config } from '../config/env.js'
import { query } from './db.js'
import { logger } from './logger.js'
import { userIsVerifiedTenantOwner } from './tenant-roles.js'
import { getEffectiveTenant, impersonationCanAccessBranch } from './impersonation.js'

const COOKIE_NAME = 'active_tenant_token'
const ALG = 'HS256'

function secret() {
  return new TextEncoder().encode(config.ACTIVE_TENANT_SECRET)
}

export function getActiveTenantCookieName() {
  return COOKIE_NAME
}

/** Clear branch-switch cookie (e.g. when ending impersonation or starting a fresh login). */
export function clearActiveTenantCookie(res) {
  if (!res?.clearCookie) return
  res.clearCookie(COOKIE_NAME, {
    path: '/',
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: config.COOKIE_SAME_SITE,
  })
}

export async function createActiveTenantToken({ userId, tenantId, tenantType, tenantName }) {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30
  return new jose.SignJWT({ userId, tenantId, tenantType, tenantName: tenantName || '' })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(secret())
}

export async function verifyActiveTenantToken(token) {
  if (!token) return null
  try {
    const { payload } = await jose.jwtVerify(token, secret(), { algorithms: [ALG] })
    return {
      userId: payload.userId,
      tenantId: payload.tenantId,
      tenantType: payload.tenantType,
      tenantName: payload.tenantName || '',
    }
  } catch (err) {
    logger.debug('Active tenant token verify failed', { reason: err.message })
    return null
  }
}

/**
 * Deactivated Branch Accounts cannot be selected or used operationally.
 * Returns false when the tenant row exists and is_branch_active is explicitly false.
 * Missing column / missing row is treated as active (legacy safety).
 */
export async function isTenantBranchActive(tenantId, tenantType, { userId = null } = {}) {
  if (!tenantId || !['SUPPLIER', 'RESTAURANT'].includes(tenantType)) return false
  const table = tenantType === 'SUPPLIER' ? 'supplier' : 'restaurant'
  const { rows } = userId
    ? await query(
        `SELECT t.is_branch_active FROM ${table} t
           JOIN app_user u ON u.id = $2 AND COALESCE(u.is_active, TRUE) = TRUE
           LEFT JOIN user_workspace_membership m ON m.user_id = u.id
           WHERE t.id = $1 AND (
             m.user_id IS NULL OR (m.status = 'active' AND m.workspace_type = $3 AND (
               m.home_tenant_id = t.id OR
               (m.organization_id IS NOT NULL AND m.organization_id = t.organization_id) OR
               EXISTS (SELECT 1 FROM tenant_account_link l
                 WHERE l.parent_tenant_id = m.home_tenant_id AND l.child_tenant_id = t.id
                   AND l.parent_tenant_type = $3 AND l.child_tenant_type = $3)
             ))
           )`,
        [tenantId, userId, tenantType]
      )
    : await query(`SELECT is_branch_active FROM ${table} WHERE id = $1`, [tenantId])
  if (!rows.length) return false
  return rows[0].is_branch_active !== false
}

async function userHasOrgTenantAccess(userId, tenantId, tenantType) {
  if (tenantType === 'SUPPLIER') {
    const { rows: targetOrg } = await query(`SELECT organization_id FROM supplier WHERE id = $1`, [
      tenantId,
    ])
    if (!targetOrg[0]?.organization_id) return false

    const { rows: orgRole } = await query(
      `SELECT orgr.name, orp.branch_scope
       FROM org_user_roles our
       JOIN org_roles orgr ON orgr.id = our.role_id AND orgr.organization_id = our.organization_id
       JOIN org_role_permissions orp ON orp.role_id = orgr.id
       WHERE our.user_id = $1 AND our.organization_id = $2
       `,
      [userId, targetOrg[0].organization_id]
    )
    if (!orgRole.length) return false

    if (orgRole.some((row) => row.branch_scope === 'all')) {
      return true
    }

    const { rows: assigned } = await query(
      `SELECT 1 FROM org_user_branch_access
       WHERE user_id = $1 AND supplier_id = $2 AND organization_id = $3`,
      [userId, tenantId, targetOrg[0].organization_id]
    )
    return assigned.length > 0
  }

  if (tenantType === 'RESTAURANT') {
    const { rows: targetOrg } = await query(
      `SELECT organization_id FROM restaurant WHERE id = $1`,
      [tenantId]
    )
    if (!targetOrg[0]?.organization_id) return false

    const { rows: orgRole } = await query(
      `SELECT ror.name, rorp.branch_scope
       FROM restaurant_org_user_roles rour
       JOIN restaurant_org_roles ror ON ror.id = rour.role_id AND ror.organization_id = rour.organization_id
       JOIN restaurant_org_role_permissions rorp ON rorp.role_id = ror.id
       WHERE rour.user_id = $1 AND rour.organization_id = $2
       `,
      [userId, targetOrg[0].organization_id]
    )
    if (!orgRole.length) return false

    if (orgRole.some((row) => row.branch_scope === 'all')) {
      return true
    }

    const { rows: assigned } = await query(
      `SELECT 1 FROM restaurant_org_user_branch_access
       WHERE user_id = $1 AND restaurant_id = $2 AND organization_id = $3`,
      [userId, tenantId, targetOrg[0].organization_id]
    )
    return assigned.length > 0
  }

  return false
}

export async function userCanAccessTenant(userId, email, tenantId, tenantType) {
  const normalizedEmail = (email || '').trim().toLowerCase()

  if (!userId || !(await isTenantBranchActive(tenantId, tenantType, { userId }))) {
    return false
  }

  // Tenant access requires invitation, workspace membership, or assigned roles — not contact_email alone.
  // Primary contacts receive roles during registration; staff must accept an invitation token.
  const { rows: roleRows } = await query(
    `
      SELECT 1 FROM user_role
      WHERE user_id = $1 AND tenant_id = $2 AND tenant_type = $3
      LIMIT 1
    `,
    [userId, tenantId, tenantType]
  )
  if (roleRows.length) return true

  try {
    const { rows: namedRole } = await query(
      `
      SELECT 1 FROM tenant_user_roles
      WHERE user_id = $1 AND tenant_id = $2 AND tenant_type = $3
      LIMIT 1
    `,
      [userId, tenantId, tenantType]
    )
    if (namedRole.length) return true
  } catch (err) {
    if (err.code !== '42P01') throw err
  }

  try {
    const { rows: membership } = await query(
      `
      SELECT 1 FROM user_workspace_membership
      WHERE user_id = $1 AND home_tenant_id = $2 AND workspace_type = $3 AND status = 'active'
      LIMIT 1
    `,
      [userId, tenantId, tenantType]
    )
    if (membership.length) return true
  } catch (err) {
    if (err.code !== '42P01') throw err
  }

  // Linked child accounts: the user must be a verified owner of a parent account that links to
  // this tenant (system Owner role, or bootstrap contact of a memberless legacy parent).
  // The parent's contact_email is never proof of ownership on its own.
  const parentTable = tenantType === 'SUPPLIER' ? 'supplier' : 'restaurant'
  const { rows: parents } = await query(
    `
      SELECT l.parent_tenant_id AS id
      FROM tenant_account_link l
      JOIN ${parentTable} p ON p.id = l.parent_tenant_id
      WHERE l.child_tenant_id = $1
        AND l.child_tenant_type = $2
        AND l.parent_tenant_type = $2
    `,
    [tenantId, tenantType]
  )
  for (const parent of parents) {
    if (await userIsVerifiedTenantOwner(userId, normalizedEmail, parent.id, tenantType)) {
      return true
    }
  }

  try {
    if (await userHasOrgTenantAccess(userId, tenantId, tenantType)) {
      return true
    }
  } catch (err) {
    if (err.code !== '42P01') throw err
  }

  return false
}

/**
 * The user's primary (non-child) account of the given type, among tenants whose contact_email
 * matches and where the user is a verified owner (see userIsVerifiedTenantOwner). Fails closed
 * without a userId: contact_email on its own is never proof of ownership.
 */
export async function getPrimaryTenantForUser(email, tenantType, userId) {
  if (!userId || !email) return null
  const table = tenantType === 'SUPPLIER' ? 'supplier' : 'restaurant'
  const { rows } = await query(
    `
      SELECT t.id, t.name
      FROM ${table} t
      WHERE LOWER(TRIM(t.contact_email)) = $1
      ORDER BY
        CASE WHEN t.id IN (
          SELECT child_tenant_id FROM tenant_account_link WHERE child_tenant_type = $2
        ) THEN 1 ELSE 0 END,
        t.created_at ASC
      LIMIT 10
    `,
    [email, tenantType]
  )
  for (const row of rows) {
    if (await userIsVerifiedTenantOwner(userId, email, row.id, tenantType)) {
      return row
    }
  }
  return null
}

export async function getActiveTenantFromRequest(req) {
  const ctx = req.activeTenantContext
  if (!ctx || !req.userData) return null
  if (ctx.userId !== req.userData.id) return null

  const effective = getEffectiveTenant(req)
  if (req.userData.role === 'ADMIN') {
    if (!effective) return null
    const allowed = await impersonationCanAccessBranch(
      effective.tenantId,
      effective.tenantType,
      ctx.tenantId,
      ctx.tenantType
    )
    if (allowed) {
      return {
        tenantId: ctx.tenantId,
        tenantType: ctx.tenantType,
        tenantName: ctx.tenantName || '',
      }
    }
    return null
  }

  const allowed = await userCanAccessTenant(
    req.userData.id,
    req.userData.email,
    ctx.tenantId,
    ctx.tenantType
  )
  if (!allowed) return null

  return {
    tenantId: ctx.tenantId,
    tenantType: ctx.tenantType,
    tenantName: ctx.tenantName || '',
  }
}

/** Allow branch/account switch when impersonating (same org or linked account). */
export async function canSwitchActiveTenant(req, tenantId, tenantType) {
  const effective = getEffectiveTenant(req)
  if (req.userData?.role === 'ADMIN') {
    if (!effective) return false
    return impersonationCanAccessBranch(
      effective.tenantId,
      effective.tenantType,
      tenantId,
      tenantType
    )
  }
  return userCanAccessTenant(req.userData.id, req.userData.email, tenantId, tenantType)
}
