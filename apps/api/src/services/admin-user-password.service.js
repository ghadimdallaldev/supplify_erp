import { randomBytes } from 'crypto'
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import {
  findKeycloakUserByEmail,
  getKeycloakAdminToken,
  resetKeycloakUserPassword,
  splitNameForKeycloak,
  updateKeycloakUserProfile,
} from '../lib/keycloak-admin.js'

export function generateAdminResetPassword() {
  return `${randomBytes(9).toString('base64url')}Aa1!`
}

function assertPasswordStrength(password) {
  if (typeof password !== 'string' || password.length < 10) {
    const err = new Error('Password must be at least 10 characters')
    err.name = 'VALIDATION_ERROR'
    err.status = 400
    throw err
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    const err = new Error('Password must include upper, lower, and numeric characters')
    err.name = 'VALIDATION_ERROR'
    err.status = 400
    throw err
  }
}

export async function getAppUserForAdminReset({ userId, email }) {
  if (userId) {
    const { rows } = await query(
      `SELECT id, email, display_name, role, keycloak_sub FROM app_user WHERE id = $1`,
      [userId]
    )
    return rows[0] || null
  }
  if (email) {
    const { rows } = await query(
      `SELECT id, email, display_name, role, keycloak_sub FROM app_user WHERE LOWER(email) = LOWER($1)`,
      [email.trim()]
    )
    return rows[0] || null
  }
  return null
}

/**
 * @param {{ search?: string, tenantId?: string, tenantType?: 'RESTAURANT'|'SUPPLIER', limit?: number }} opts
 */
export async function listAdminUsers({ search = '', tenantId, tenantType, limit = 50 }) {
  const cappedLimit = Math.min(Math.max(Number(limit) || 50, 1), 100)
  const q = String(search || '')
    .trim()
    .toLowerCase()
  const params = []
  const conditions = []

  if (q) {
    params.push(`%${q}%`)
    const i = params.length
    conditions.push(`(LOWER(u.email) LIKE $${i} OR LOWER(COALESCE(u.display_name, '')) LIKE $${i})`)
  }

  if (tenantId && tenantType) {
    params.push(tenantId, tenantType)
    const tid = params.length - 1
    const tt = params.length
    conditions.push(`
      (
        EXISTS (
          SELECT 1 FROM tenant_user_roles tur
          WHERE tur.user_id = u.id AND tur.tenant_id = $${tid} AND tur.tenant_type = $${tt}
        )
        OR EXISTS (
          SELECT 1 FROM restaurant r
          WHERE r.id = $${tid} AND $${tt} = 'RESTAURANT' AND LOWER(r.contact_email) = LOWER(u.email)
        )
        OR EXISTS (
          SELECT 1 FROM supplier s
          WHERE s.id = $${tid} AND $${tt} = 'SUPPLIER' AND LOWER(s.contact_email) = LOWER(u.email)
        )
      )
    `)
  }

  params.push(cappedLimit)
  const limitParam = params.length

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const { rows } = await query(
    `
    SELECT
      u.id,
      u.email,
      u.display_name,
      u.role,
      u.created_at,
      COALESCE(
        json_agg(
          DISTINCT jsonb_build_object(
            'tenantId', tur.tenant_id,
            'tenantType', tur.tenant_type,
            'roleName', tr.name
          )
        ) FILTER (WHERE tur.id IS NOT NULL),
        '[]'::json
      ) AS tenant_roles
    FROM app_user u
    LEFT JOIN tenant_user_roles tur ON tur.user_id = u.id
    LEFT JOIN tenant_roles tr ON tr.id = tur.role_id
    ${where}
    GROUP BY u.id
    ORDER BY u.email
    LIMIT $${limitParam}
    `,
    params
  )

  return rows.map((row) => ({
    ...row,
    tenant_roles: Array.isArray(row.tenant_roles) ? row.tenant_roles : [],
  }))
}

/**
 * @param {{ actorUserId: string, targetUserId?: string, email?: string, password?: string, temporary?: boolean, generate?: boolean }} opts
 */
export async function adminResetUserPassword({
  actorUserId,
  targetUserId,
  email,
  password,
  temporary = true,
  generate = false,
}) {
  const target = await getAppUserForAdminReset({ userId: targetUserId, email })
  if (!target) {
    const err = new Error('User not found')
    err.name = 'NOT_FOUND'
    err.status = 404
    throw err
  }

  if (target.role === 'ADMIN' && target.id !== actorUserId) {
    const err = new Error('Cannot reset password for another platform admin')
    err.name = 'FORBIDDEN'
    err.status = 403
    throw err
  }

  let newPassword = password
  if (generate || !newPassword) {
    newPassword = generateAdminResetPassword()
    temporary = true
  } else {
    assertPasswordStrength(newPassword)
  }

  const token = await getKeycloakAdminToken()
  const kcUser = await findKeycloakUserByEmail(token, target.email)
  if (!kcUser?.id) {
    const err = new Error(
      'No Keycloak account found for this email. User may need to sign in once first.'
    )
    err.name = 'NOT_FOUND'
    err.status = 404
    throw err
  }

  const { firstName, lastName } = splitNameForKeycloak(target.display_name, target.email)
  if (!kcUser.firstName?.trim() || !kcUser.lastName?.trim()) {
    await updateKeycloakUserProfile(token, kcUser.id, { firstName, lastName })
  }

  await resetKeycloakUserPassword(token, kcUser.id, newPassword, Boolean(temporary))

  logger.info('Admin reset user password', {
    actorUserId,
    targetUserId: target.id,
    targetEmail: target.email,
    temporary: Boolean(temporary),
  })

  return {
    userId: target.id,
    email: target.email,
    displayName: target.display_name,
    role: target.role,
    temporaryPassword: temporary ? newPassword : undefined,
    temporary: Boolean(temporary),
  }
}
