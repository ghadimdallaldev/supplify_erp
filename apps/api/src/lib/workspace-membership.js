/**
 * Workspace membership: one active restaurant OR supplier account per user.
 * organization_id (when present) is the account boundary; branch invites stay in the same workspace.
 */
import { query } from './db.js'
import { ConflictError, ValidationError } from '../middlewares/errorHandler.js'

export const MAIN_ADMIN_ROLE_NAME = 'Owner'

export class WorkspaceMembershipError extends ConflictError {
  constructor(message = 'This user is already linked to another account') {
    super(message)
    this.name = 'WORKSPACE_MEMBERSHIP_CONFLICT'
  }
}

export async function resolveWorkspaceScope(tenantId, tenantType, client = null) {
  const db = client ? (sql, params) => client.query(sql, params) : query
  if (tenantType === 'RESTAURANT') {
    const { rows } = await db(
      `SELECT id, organization_id, is_main_branch FROM restaurant WHERE id = $1`,
      [tenantId]
    )
    if (!rows[0]) throw new ValidationError('Restaurant not found')
    return {
      workspaceType: 'RESTAURANT',
      organizationId: rows[0].organization_id || null,
      homeTenantId: rows[0].id,
    }
  }
  if (tenantType === 'SUPPLIER') {
    const { rows } = await db(
      `SELECT id, organization_id, is_main_branch FROM supplier WHERE id = $1`,
      [tenantId]
    )
    if (!rows[0]) throw new ValidationError('Supplier not found')
    return {
      workspaceType: 'SUPPLIER',
      organizationId: rows[0].organization_id || null,
      homeTenantId: rows[0].id,
    }
  }
  throw new ValidationError('Invalid workspace type')
}

function sameWorkspace(membership, target) {
  if (!membership || membership.status !== 'active') return false
  if (membership.workspace_type !== target.workspaceType) return false
  if (membership.organization_id && target.organizationId) {
    return membership.organization_id === target.organizationId
  }
  return membership.home_tenant_id === target.homeTenantId
}

export async function getUserWorkspaceMembership(userId, client = null) {
  if (!userId) return null
  const db = client ? (sql, params) => client.query(sql, params) : query
  try {
    const { rows } = await db(
      `SELECT * FROM user_workspace_membership WHERE user_id = $1 AND status = 'active' LIMIT 1`,
      [userId]
    )
    return rows[0] || null
  } catch (err) {
    if (err.code === '42P01') return null
    throw err
  }
}

export async function getMembershipByEmail(email, client = null) {
  const normalized = (email || '').trim().toLowerCase()
  if (!normalized) return null
  const db = client ? (sql, params) => client.query(sql, params) : query
  try {
    const { rows } = await db(
      `
      SELECT m.*
      FROM user_workspace_membership m
      JOIN app_user u ON u.id = m.user_id
      WHERE LOWER(TRIM(u.email)) = $1 AND m.status = 'active'
      LIMIT 1
      `,
      [normalized]
    )
    return rows[0] || null
  } catch (err) {
    if (err.code === '42P01') return null
    throw err
  }
}

/**
 * Block joining a different supplier/restaurant account. Same organization (branch invite) is allowed.
 */
export async function assertUserCanJoinWorkspace(
  { userId, email, workspaceType, organizationId, homeTenantId },
  client = null
) {
  const target = {
    workspaceType,
    organizationId: organizationId || null,
    homeTenantId,
  }

  let membership = null
  if (userId) membership = await getUserWorkspaceMembership(userId, client)
  if (!membership && email) membership = await getMembershipByEmail(email, client)

  if (!membership) return

  if (sameWorkspace(membership, target)) return

  if (membership.workspace_type !== workspaceType) {
    throw new WorkspaceMembershipError(
      'This user is already linked to a different type of account and cannot join another.'
    )
  }

  throw new WorkspaceMembershipError(
    'This user is already linked to another account. A user can only belong to one supplier or restaurant.'
  )
}

export async function assertEmailCanJoinWorkspace(email, scope, client = null) {
  const normalized = (email || '').trim().toLowerCase()
  if (!normalized) return
  await assertUserCanJoinWorkspace(
    {
      email: normalized,
      workspaceType: scope.workspaceType,
      organizationId: scope.organizationId,
      homeTenantId: scope.homeTenantId,
    },
    client
  )
}

/**
 * Bind user to workspace after account creation or first invite accept.
 */
export async function bindUserToWorkspace(
  { userId, workspaceType, organizationId, homeTenantId, isMainAdmin = false },
  client = null
) {
  const db = client ? (sql, params) => client.query(sql, params) : query
  const existing = await getUserWorkspaceMembership(userId, client)
  const target = { workspaceType, organizationId, homeTenantId }

  if (existing) {
    if (!sameWorkspace(existing, target)) {
      throw new WorkspaceMembershipError()
    }
    if (isMainAdmin && !existing.is_main_admin) {
      await db(
        `UPDATE user_workspace_membership
         SET is_main_admin = true, updated_at = NOW()
         WHERE user_id = $1`,
        [userId]
      )
    }
    return existing
  }

  await assertUserCanJoinWorkspace(
    {
      userId,
      workspaceType,
      organizationId,
      homeTenantId,
    },
    client
  )

  const { rows } = await db(
    `
    INSERT INTO user_workspace_membership (
      user_id, workspace_type, organization_id, home_tenant_id, is_main_admin
    ) VALUES ($1, $2, $3, $4, $5)
    RETURNING *
    `,
    [userId, workspaceType, organizationId || null, homeTenantId, isMainAdmin]
  )
  return rows[0]
}

export async function userHasActiveWorkspace(userId) {
  const m = await getUserWorkspaceMembership(userId)
  return Boolean(m)
}
