import * as jose from 'jose'
import { config } from '../config/env.js'
import { query } from './db.js'
import { logger } from './logger.js'
import { getEffectiveTenant, impersonationCanAccessBranch } from './impersonation.js'

const COOKIE_NAME = 'active_tenant_token'
const ALG = 'HS256'

const ORG_ALL_SCOPE_ROLES = new Set(['Org Owner', 'Org Manager', 'Org Viewer'])

function secret() {
  return new TextEncoder().encode(config.IMPERSONATION_SECRET)
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
    sameSite: 'lax',
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
export async function isTenantBranchActive(tenantId, tenantType) {
  if (!tenantId || !tenantType) return true
  const table = tenantType === 'SUPPLIER' ? 'supplier' : 'restaurant'
  try {
    const { rows } = await query(`SELECT is_branch_active FROM ${table} WHERE id = $1`, [tenantId])
    if (!rows.length) return false
    return rows[0].is_branch_active !== false
  } catch (err) {
    if (err.code === '42703') return true
    throw err
  }
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
       JOIN org_roles orgr ON orgr.id = our.role_id
       JOIN org_role_permissions orp ON orp.role_id = orgr.id
       WHERE our.user_id = $1 AND our.organization_id = $2
       LIMIT 1`,
      [userId, targetOrg[0].organization_id]
    )
    if (!orgRole.length) return false

    if (orgRole[0].branch_scope === 'all' || ORG_ALL_SCOPE_ROLES.has(orgRole[0].name)) {
      return true
    }

    const { rows: assigned } = await query(
      `SELECT 1 FROM org_user_branch_access
       WHERE user_id = $1 AND supplier_id = $2`,
      [userId, tenantId]
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
       JOIN restaurant_org_roles ror ON ror.id = rour.role_id
       JOIN restaurant_org_role_permissions rorp ON rorp.role_id = ror.id
       WHERE rour.user_id = $1 AND rour.organization_id = $2
       LIMIT 1`,
      [userId, targetOrg[0].organization_id]
    )
    if (!orgRole.length) return false

    if (orgRole[0].branch_scope === 'all' || ORG_ALL_SCOPE_ROLES.has(orgRole[0].name)) {
      return true
    }

    const { rows: assigned } = await query(
      `SELECT 1 FROM restaurant_org_user_branch_access
       WHERE user_id = $1 AND restaurant_id = $2`,
      [userId, tenantId]
    )
    return assigned.length > 0
  }

  return false
}

export async function userCanAccessTenant(userId, email, tenantId, tenantType) {
  const normalizedEmail = (email || '').trim().toLowerCase()

  if (!(await isTenantBranchActive(tenantId, tenantType))) {
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

  const primary = await getPrimaryTenantForUser(normalizedEmail, tenantType)
  if (primary) {
    const { rows: linkRows } = await query(
      `
      SELECT 1 FROM tenant_account_link
      WHERE parent_tenant_id = $1
        AND parent_tenant_type = $2
        AND child_tenant_id = $3
        AND child_tenant_type = $2
      LIMIT 1
    `,
      [primary.id, tenantType, tenantId]
    )
    if (linkRows.length > 0) return true
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

export async function getPrimaryTenantForUser(email, tenantType) {
  const table = tenantType === 'SUPPLIER' ? 'supplier' : 'restaurant'
  const { rows } = await query(
    `
      SELECT t.id, t.name
      FROM ${table} t
      WHERE LOWER(TRIM(t.contact_email)) = $1
        AND t.id NOT IN (
          SELECT child_tenant_id FROM tenant_account_link
          WHERE child_tenant_type = $2
        )
      ORDER BY t.created_at ASC
      LIMIT 1
    `,
    [email, tenantType]
  )
  if (rows.length) return rows[0]

  const { rows: fallback } = await query(
    `
      SELECT id, name FROM ${table}
      WHERE LOWER(TRIM(contact_email)) = $1
      ORDER BY created_at ASC
      LIMIT 1
    `,
    [email]
  )
  return fallback[0] || null
}

export async function getActiveTenantFromRequest(req) {
  const ctx = req.activeTenantContext
  if (!ctx || !req.userData) return null
  if (ctx.userId !== req.userData.id) return null

  const effective = getEffectiveTenant(req)
  if (effective && req.userData.role === 'ADMIN') {
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
  if (effective && req.userData?.role === 'ADMIN') {
    return impersonationCanAccessBranch(
      effective.tenantId,
      effective.tenantType,
      tenantId,
      tenantType
    )
  }
  return userCanAccessTenant(req.userData.id, req.userData.email, tenantId, tenantType)
}
