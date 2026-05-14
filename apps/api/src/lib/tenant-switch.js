import * as jose from 'jose'
import { config } from '../config/env.js'
import { query } from './db.js'
import { logger } from './logger.js'

const COOKIE_NAME = 'active_tenant_token'
const ALG = 'HS256'

function secret() {
  return new TextEncoder().encode(config.IMPERSONATION_SECRET)
}

export function getActiveTenantCookieName() {
  return COOKIE_NAME
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

export async function userCanAccessTenant(userId, email, tenantId, tenantType) {
  const normalizedEmail = (email || '').trim().toLowerCase()
  const table = tenantType === 'SUPPLIER' ? 'supplier' : 'restaurant'

  const { rows: direct } = await query(
    `SELECT id FROM ${table} WHERE id = $1 AND LOWER(TRIM(contact_email)) = $2`,
    [tenantId, normalizedEmail],
  )
  if (direct.length) return true

  const { rows: roleRows } = await query(
    `
      SELECT 1 FROM user_role
      WHERE user_id = $1 AND tenant_id = $2 AND tenant_type = $3
      LIMIT 1
    `,
    [userId, tenantId, tenantType],
  )
  if (roleRows.length) return true

  const primary = await getPrimaryTenantForUser(normalizedEmail, tenantType)
  if (!primary) return false

  const { rows: linkRows } = await query(
    `
      SELECT 1 FROM tenant_account_link
      WHERE parent_tenant_id = $1
        AND parent_tenant_type = $2
        AND child_tenant_id = $3
        AND child_tenant_type = $2
      LIMIT 1
    `,
    [primary.id, tenantType, tenantId],
  )
  return linkRows.length > 0
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
    [email, tenantType],
  )
  if (rows.length) return rows[0]

  const { rows: fallback } = await query(
    `
      SELECT id, name FROM ${table}
      WHERE LOWER(TRIM(contact_email)) = $1
      ORDER BY created_at ASC
      LIMIT 1
    `,
    [email],
  )
  return fallback[0] || null
}

export async function getActiveTenantFromRequest(req) {
  const ctx = req.activeTenantContext
  if (!ctx || !req.userData) return null
  if (ctx.userId !== req.userData.id) return null

  const allowed = await userCanAccessTenant(
    req.userData.id,
    req.userData.email,
    ctx.tenantId,
    ctx.tenantType,
  )
  if (!allowed) return null

  return {
    tenantId: ctx.tenantId,
    tenantType: ctx.tenantType,
    tenantName: ctx.tenantName || '',
  }
}
