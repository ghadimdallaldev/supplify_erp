/**
 * Tenant-scoped RBAC: permission keys and helpers.
 * Resolves from per-tenant named roles (tenant_user_roles) and legacy user_role tables.
 */
import { query } from './db.js'
import { logger } from './logger.js'
import { getCache, setCache, deleteCache } from './cache.js'
import { PERMISSION_KEYS } from './permission-keys.js'
import { getOrgRolePermissions } from './supplier-org.js'

export { PERMISSION_KEYS }

const PERMISSION_CACHE_TTL_SECONDS = 300

export function permissionCacheKey(userId, tenantId, tenantType) {
  return `perms:${userId}:${tenantId}:${tenantType}`
}

export async function invalidateUserPermissionCache(userId, tenantId, tenantType) {
  if (!userId || tenantType === 'ADMIN') {
    if (tenantType === 'ADMIN') {
      await deleteCache(permissionCacheKey(userId, null, 'ADMIN'))
    }
    return
  }
  await deleteCache(permissionCacheKey(userId, tenantId, tenantType))
}

async function getLegacyRolesForUser(userId, tenantId, tenantType) {
  const { rows } = await query(
    `
    SELECT r.code
    FROM user_role ur
    JOIN role r ON r.id = ur.role_id
    WHERE ur.user_id = $1 AND ur.tenant_type = $2
      AND ((ur.tenant_id IS NULL AND $3::uuid IS NULL) OR ur.tenant_id = $3)
  `,
    [userId, tenantType, tenantId]
  )
  return rows.map((r) => r.code)
}

async function getLegacyPermissionsForUser(userId, tenantId, tenantType) {
  const { rows } = await query(
    `
    SELECT DISTINCT p.code
    FROM user_role ur
    JOIN role r ON r.id = ur.role_id
    JOIN role_permission rp ON rp.role_id = r.id
    JOIN permission p ON p.id = rp.permission_id
    WHERE ur.user_id = $1 AND ur.tenant_type = $2
      AND ((ur.tenant_id IS NULL AND $3::uuid IS NULL) OR ur.tenant_id = $3)
  `,
    [userId, tenantType, tenantId]
  )
  return rows.map((r) => r.code)
}

async function getTenantNamedRoleCodes(userId, tenantId, tenantType) {
  const { rows } = await query(
    `
    SELECT tr.name
    FROM tenant_user_roles tur
    JOIN tenant_roles tr ON tr.id = tur.role_id
    WHERE tur.user_id = $1 AND tur.tenant_id = $2 AND tur.tenant_type = $3
  `,
    [userId, tenantId, tenantType]
  )
  return rows.map((r) => r.name)
}

async function getTenantNamedPermissionsForUser(userId, tenantId, tenantType) {
  const { rows } = await query(
    `
    SELECT DISTINCT trp.permission
    FROM tenant_user_roles tur
    JOIN tenant_role_permissions trp ON trp.role_id = tur.role_id
    WHERE tur.user_id = $1 AND tur.tenant_id = $2 AND tur.tenant_type = $3
  `,
    [userId, tenantId, tenantType]
  )
  return rows.map((r) => r.permission)
}

function mergeUniquePermissions(...lists) {
  return [...new Set(lists.flat().filter(Boolean))]
}

/**
 * Get role codes for a user in a tenant context.
 */
export async function getRolesForUser(userId, tenantId, tenantType) {
  try {
    if (tenantType === 'RESTAURANT' || tenantType === 'SUPPLIER') {
      const named = await getTenantNamedRoleCodes(userId, tenantId, tenantType)
      if (named.length > 0) return named
    }
    return await getLegacyRolesForUser(userId, tenantId, tenantType)
  } catch (err) {
    if (err.code === '42P01') return []
    logger.error('getRolesForUser error', { error: err.message })
    return []
  }
}

/**
 * Get permission codes for a user in a tenant context.
 * Merges tenant named-role permissions with legacy role permissions so access is never reduced.
 */
export async function getPermissionsForUser(userId, tenantId, tenantType) {
  try {
    const cacheKey = permissionCacheKey(userId, tenantId, tenantType)
    const cached = await getCache(cacheKey)
    if (Array.isArray(cached)) return cached

    let named = []
    let legacy = []

    let orgPerms = []
    let hasOrgRole = false

    if (tenantType === 'SUPPLIER') {
      try {
        const { rows: orgRows } = await query(
          `SELECT organization_id FROM supplier WHERE id = $1`,
          [tenantId]
        )
        const organizationId = orgRows[0]?.organization_id
        if (organizationId) {
          const { rows: orgMembership } = await query(
            `SELECT 1 FROM org_user_roles WHERE user_id = $1 AND organization_id = $2`,
            [userId, organizationId]
          )
          hasOrgRole = orgMembership.length > 0
          if (hasOrgRole) {
            orgPerms = await getOrgRolePermissions(userId, organizationId, tenantId)
          }
        }
      } catch (err) {
        if (err.code !== '42P01') throw err
      }
    }

    if (tenantType === 'RESTAURANT' || tenantType === 'SUPPLIER') {
      try {
        named = await getTenantNamedPermissionsForUser(userId, tenantId, tenantType)
      } catch (err) {
        if (err.code !== '42P01') throw err
      }
    }

    try {
      legacy = await getLegacyPermissionsForUser(userId, tenantId, tenantType)
    } catch (err) {
      if (err.code !== '42P01') throw err
    }

    const branchPerms = mergeUniquePermissions(named, legacy)

    if (tenantType === 'SUPPLIER' && hasOrgRole) {
      const permissions = mergeUniquePermissions(orgPerms, branchPerms)
      await setCache(cacheKey, permissions, PERMISSION_CACHE_TTL_SECONDS)
      return permissions
    }

    if (tenantType === 'SUPPLIER' && !hasOrgRole && branchPerms.length === 0) {
      await setCache(cacheKey, [], PERMISSION_CACHE_TTL_SECONDS)
      return []
    }

    const permissions = branchPerms
    await setCache(cacheKey, permissions, PERMISSION_CACHE_TTL_SECONDS)
    return permissions
  } catch (err) {
    if (err.code === '42P01') return []
    logger.error('getPermissionsForUser error', { error: err.message })
    return []
  }
}

/**
 * Resolve permissions from a tenant role id (for tests and admin tooling).
 */
export async function getPermissionsForTenantRole(roleId) {
  const { rows } = await query(
    `SELECT permission FROM tenant_role_permissions WHERE role_id = $1 ORDER BY permission`,
    [roleId]
  )
  return rows.map((r) => r.permission)
}

/**
 * Check if a list of permission codes includes the required key (or a broader one).
 */
export function hasPermission(permissions, required) {
  if (!Array.isArray(permissions)) return false
  if (permissions.includes(required)) return true
  const domain = required.replace(/_VIEW$|_CREATE$|_EDIT$|_SEND$|_MANAGE$/, '_MANAGE')
  if (domain !== required && permissions.includes(domain)) return true
  return false
}
