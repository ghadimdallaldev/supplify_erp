/**
 * RBAC safety guards: last owner, permission subset, self-escalation, immutable Owner role.
 */
import { query } from './db.js'
import { ForbiddenError, ValidationError } from '../middlewares/errorHandler.js'
import { MAIN_ADMIN_ROLE_NAME } from './workspace-membership.js'
import { getAllPermissionsForTenantType } from './tenant-roles.js'
import { hasPermission } from './permissions.js'

export async function getRolePermissionSet(roleId, client = null) {
  const db = client ? (sql, params) => client.query(sql, params) : query
  const { rows: roleRows } = await db(`SELECT name, tenant_type FROM tenant_roles WHERE id = $1`, [
    roleId,
  ])
  if (!roleRows[0]) return new Set()
  if (roleRows[0].name === MAIN_ADMIN_ROLE_NAME) {
    return new Set(getAllPermissionsForTenantType(roleRows[0].tenant_type))
  }
  const { rows } = await db(`SELECT permission FROM tenant_role_permissions WHERE role_id = $1`, [
    roleId,
  ])
  return new Set(rows.map((r) => r.permission))
}

export function isPermissionSubset(actorPermissions, targetPermissions) {
  const actor = new Set(actorPermissions || [])
  for (const p of targetPermissions) {
    if (!actor.has(p) && !actorHasManageWildcard(actor, p)) {
      return false
    }
  }
  return true
}

function actorHasManageWildcard(actor, permissionKey) {
  const base = String(permissionKey).replace(/_VIEW$|_CREATE$|_EDIT$|_MANAGE$/, '')
  return actor.has(`${base}_MANAGE`)
}

export async function countOwnersInOrganization(organizationId, workspaceType, client = null) {
  if (!organizationId) return 0
  const db = client ? (sql, params) => client.query(sql, params) : query
  const tenantTable = workspaceType === 'SUPPLIER' ? 'supplier' : 'restaurant'
  const { rows } = await db(
    `
    SELECT COUNT(DISTINCT tur.user_id)::int AS count
    FROM tenant_user_roles tur
    JOIN tenant_roles tr ON tr.id = tur.role_id AND tr.name = $3
    JOIN ${tenantTable} t ON t.id = tur.tenant_id AND tur.tenant_type = $2
    WHERE t.organization_id = $1
    `,
    [organizationId, workspaceType, MAIN_ADMIN_ROLE_NAME]
  )
  return rows[0]?.count ?? 0
}

export async function userIsOwnerInOrganization(
  userId,
  organizationId,
  workspaceType,
  client = null
) {
  if (!organizationId) return false
  const db = client ? (sql, params) => client.query(sql, params) : query
  const tenantTable = workspaceType === 'SUPPLIER' ? 'supplier' : 'restaurant'
  const { rows } = await db(
    `
    SELECT 1
    FROM tenant_user_roles tur
    JOIN tenant_roles tr ON tr.id = tur.role_id AND tr.name = $3
    JOIN ${tenantTable} t ON t.id = tur.tenant_id AND tur.tenant_type = $2
    WHERE t.organization_id = $1 AND tur.user_id = $4
    LIMIT 1
    `,
    [organizationId, workspaceType, MAIN_ADMIN_ROLE_NAME, userId]
  )
  return rows.length > 0
}

export async function assertNotLastOwnerRemoval({
  targetUserId,
  newRoleId,
  organizationId,
  workspaceType,
  tenantId,
}) {
  if (!organizationId) return

  const newPerms = await getRolePermissionSet(newRoleId)
  const { rows: newRoleRows } = await query(`SELECT name FROM tenant_roles WHERE id = $1`, [
    newRoleId,
  ])
  const newRoleName = newRoleRows[0]?.name

  const { rows: currentRows } = await query(
    `
    SELECT tr.name
    FROM tenant_user_roles tur
    JOIN tenant_roles tr ON tr.id = tur.role_id
    WHERE tur.user_id = $1 AND tur.tenant_id = $2 AND tur.tenant_type = $3
    `,
    [targetUserId, tenantId, workspaceType]
  )
  const wasOwner = currentRows[0]?.name === MAIN_ADMIN_ROLE_NAME
  const willBeOwner = newRoleName === MAIN_ADMIN_ROLE_NAME

  if (!wasOwner || willBeOwner) return

  const ownerCount = await countOwnersInOrganization(organizationId, workspaceType)
  if (ownerCount <= 1) {
    throw new ValidationError(
      'Cannot remove or downgrade the last Owner. Assign another Owner first.'
    )
  }
}

export async function assertCanAssignRole({
  requesterId,
  requesterIsPlatformAdmin,
  requesterPermissions,
  targetUserId,
  roleId,
  tenantId,
  tenantType,
  organizationId,
}) {
  const { rows: roleRows } = await query(
    `SELECT id, name, tenant_id, tenant_type, is_system FROM tenant_roles WHERE id = $1`,
    [roleId]
  )
  if (!roleRows[0]) throw new ValidationError('Role not found')
  const role = roleRows[0]

  if (role.tenant_id !== tenantId || role.tenant_type !== tenantType) {
    throw new ValidationError('Role does not belong to this tenant')
  }

  if (role.name === MAIN_ADMIN_ROLE_NAME) {
    if (!requesterIsPlatformAdmin) {
      const requesterIsOwner = organizationId
        ? await userIsOwnerInOrganization(requesterId, organizationId, tenantType)
        : false
      if (!requesterIsOwner) {
        throw new ForbiddenError('Only an Owner can assign the Owner role')
      }
    }
    return role
  }

  if (!requesterIsPlatformAdmin) {
    const rolePerms = await getRolePermissionSet(roleId)
    if (!isPermissionSubset(requesterPermissions, rolePerms)) {
      throw new ForbiddenError('You cannot assign a role with permissions you do not have')
    }
  }

  if (targetUserId === requesterId && !requesterIsPlatformAdmin) {
    const { rows: current } = await query(
      `
      SELECT tr.name, tur.role_id
      FROM tenant_user_roles tur
      JOIN tenant_roles tr ON tr.id = tur.role_id
      WHERE tur.user_id = $1 AND tur.tenant_id = $2 AND tur.tenant_type = $3
      `,
      [targetUserId, tenantId, tenantType]
    )
    const currentName = current[0]?.name
    if (currentName === MAIN_ADMIN_ROLE_NAME) {
      throw new ForbiddenError('Owners cannot change their own role')
    }
    if (role.name === MAIN_ADMIN_ROLE_NAME) {
      throw new ForbiddenError('You cannot assign yourself the Owner role')
    }
    if (current[0]?.role_id) {
      const currentPerms = await getRolePermissionSet(current[0].role_id)
      const newPerms = await getRolePermissionSet(roleId)
      if (!isPermissionSubset([...currentPerms], newPerms)) {
        throw new ForbiddenError('You cannot change your own role to gain more access')
      }
    }
  }

  await assertNotLastOwnerRemoval({
    targetUserId,
    newRoleId: roleId,
    organizationId,
    workspaceType: tenantType,
    tenantId,
  })

  return role
}

export function assertCanGrantPermissions(
  requesterPermissions,
  permissionsToGrant,
  requesterIsPlatformAdmin
) {
  if (requesterIsPlatformAdmin) return
  if (!isPermissionSubset(requesterPermissions, permissionsToGrant)) {
    throw new ForbiddenError('You cannot grant permissions you do not have')
  }
}

export async function requireTenantPermission(userId, tenantId, tenantType, permissionKey) {
  const allowed = await hasPermission(userId, tenantId, tenantType, permissionKey)
  if (!allowed) {
    throw new ForbiddenError(`Missing permission: ${permissionKey}`)
  }
}

export async function requireSupplierPermission(userId, supplierId, permissionKey) {
  return requireTenantPermission(userId, supplierId, 'SUPPLIER', permissionKey)
}

export async function requireRestaurantPermission(userId, restaurantId, permissionKey) {
  return requireTenantPermission(userId, restaurantId, 'RESTAURANT', permissionKey)
}
