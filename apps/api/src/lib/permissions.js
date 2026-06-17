/**
 * Tenant-scoped RBAC: permission keys and helpers.
 * Resolves from per-tenant named roles (tenant_user_roles) and legacy user_role tables.
 */
import { query } from './db.js'
import { logger } from './logger.js'
import { getCache, setCache, deleteCache } from './cache.js'
import { singleflight } from './singleflight.js'
import { invalidateTenantContextCache } from './tenant-context-cache.js'
import { PERMISSION_KEYS } from './permission-keys.js'
import { getOrgRolePermissions } from './supplier-org.js'
import { getRestaurantOrgRolePermissions } from './restaurant-org.js'
import {
  ensureTenantSystemRoles,
  getAllPermissionsForTenantType,
  userHasOwnerRole,
} from './tenant-roles.js'

export { PERMISSION_KEYS }

const PERMISSION_CACHE_TTL_SECONDS = 120
const ROLES_CACHE_TTL_SECONDS = 180

export function permissionCacheKey(userId, tenantId, tenantType) {
  return `perms:${userId}:${tenantId}:${tenantType}`
}

export function rolesCacheKey(userId, tenantId, tenantType) {
  return `roles:${userId}:${tenantId ?? 'null'}:${tenantType}`
}

export async function invalidateUserPermissionCache(userId, tenantId, tenantType) {
  if (!userId || tenantType === 'ADMIN') {
    if (tenantType === 'ADMIN') {
      await deleteCache(permissionCacheKey(userId, null, 'ADMIN'))
      await deleteCache(rolesCacheKey(userId, null, 'ADMIN'))
    }
    return
  }
  await deleteCache(permissionCacheKey(userId, tenantId, tenantType))
  await deleteCache(rolesCacheKey(userId, tenantId, tenantType))
  await invalidateTenantContextCache(userId, tenantId, tenantType)
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
 * @param {import('express').Request} [req] Optional request for per-request memoization.
 */
export async function getRolesForUser(userId, tenantId, tenantType, req = null) {
  const memoKey = `${userId}:${tenantId}:${tenantType}`
  if (req?._rolesMemoKey === memoKey && Array.isArray(req._rolesMemo)) {
    return req._rolesMemo
  }
  try {
    const cacheKey = rolesCacheKey(userId, tenantId, tenantType)
    const cached = await getCache(cacheKey)
    if (Array.isArray(cached)) {
      if (req) {
        req._rolesMemoKey = memoKey
        req._rolesMemo = cached
      }
      return cached
    }

    const roles = await singleflight(cacheKey, async () => {
      const again = await getCache(cacheKey)
      if (Array.isArray(again)) return again

      let resolved
      if (tenantType === 'RESTAURANT' || tenantType === 'SUPPLIER') {
        const named = await getTenantNamedRoleCodes(userId, tenantId, tenantType)
        resolved =
          named.length > 0 ? named : await getLegacyRolesForUser(userId, tenantId, tenantType)
      } else {
        resolved = await getLegacyRolesForUser(userId, tenantId, tenantType)
      }

      await setCache(cacheKey, resolved, ROLES_CACHE_TTL_SECONDS).catch(() => {})
      return resolved
    })

    if (req) {
      req._rolesMemoKey = memoKey
      req._rolesMemo = roles
    }
    return roles
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

    return singleflight(cacheKey, async () => {
      const again = await getCache(cacheKey)
      if (Array.isArray(again)) return again

      if (tenantType === 'RESTAURANT' || tenantType === 'SUPPLIER') {
        if (await userHasOwnerRole(userId, tenantId, tenantType)) {
          // Owner role is ALL — return the canonical list even if DB role rows lag behind new keys.
          ensureTenantSystemRoles(tenantId, tenantType).catch(() => {})
          const permissions = getAllPermissionsForTenantType(tenantType)
          await setCache(cacheKey, permissions, PERMISSION_CACHE_TTL_SECONDS)
          return permissions
        }
      }

      let named = []
      let legacy = []
      let orgPerms = []
      let hasOrgRole = false
      let hasNamedAssignment = false

      const orgLookupPromise =
        tenantType === 'SUPPLIER'
          ? query(`SELECT organization_id FROM supplier WHERE id = $1`, [tenantId]).then(
              async ({ rows: orgRows }) => {
                const organizationId = orgRows[0]?.organization_id
                if (!organizationId) return { hasOrgRole: false, orgPerms: [] }
                const { rows: orgMembership } = await query(
                  `SELECT 1 FROM org_user_roles WHERE user_id = $1 AND organization_id = $2`,
                  [userId, organizationId]
                )
                if (!orgMembership.length) return { hasOrgRole: false, orgPerms: [] }
                const orgPerms = await getOrgRolePermissions(userId, organizationId, tenantId)
                return { hasOrgRole: true, orgPerms }
              }
            )
          : tenantType === 'RESTAURANT'
            ? query(`SELECT organization_id FROM restaurant WHERE id = $1`, [tenantId]).then(
                async ({ rows: orgRows }) => {
                  const organizationId = orgRows[0]?.organization_id
                  if (!organizationId) return { hasOrgRole: false, orgPerms: [] }
                  const { rows: orgMembership } = await query(
                    `SELECT 1 FROM restaurant_org_user_roles WHERE user_id = $1 AND organization_id = $2`,
                    [userId, organizationId]
                  )
                  if (!orgMembership.length) return { hasOrgRole: false, orgPerms: [] }
                  const orgPerms = await getRestaurantOrgRolePermissions(
                    userId,
                    organizationId,
                    tenantId
                  )
                  return { hasOrgRole: true, orgPerms }
                }
              )
            : Promise.resolve({ hasOrgRole: false, orgPerms: [] })

      const namedPromise =
        tenantType === 'RESTAURANT' || tenantType === 'SUPPLIER'
          ? getTenantNamedPermissionsForUser(userId, tenantId, tenantType).catch((err) => {
              if (err.code === '42P01') return []
              throw err
            })
          : Promise.resolve([])

      const legacyPromise = getLegacyPermissionsForUser(userId, tenantId, tenantType).catch(
        (err) => {
          if (err.code === '42P01') return []
          throw err
        }
      )

      const assignmentPromise =
        tenantType === 'RESTAURANT' || tenantType === 'SUPPLIER'
          ? query(
              `SELECT 1 FROM tenant_user_roles WHERE user_id = $1 AND tenant_id = $2 AND tenant_type = $3 LIMIT 1`,
              [userId, tenantId, tenantType]
            ).then(({ rows }) => rows.length > 0)
          : Promise.resolve(false)

      const [orgResult, namedResult, legacyResult, assigned] = await Promise.all([
        orgLookupPromise.catch((err) => {
          if (err.code === '42P01') return { hasOrgRole: false, orgPerms: [] }
          throw err
        }),
        namedPromise,
        legacyPromise,
        assignmentPromise,
      ])

      hasOrgRole = orgResult.hasOrgRole
      orgPerms = orgResult.orgPerms
      named = namedResult
      legacy = legacyResult
      hasNamedAssignment = assigned

      const branchPerms = hasNamedAssignment ? named : mergeUniquePermissions(named, legacy)

      if ((tenantType === 'SUPPLIER' || tenantType === 'RESTAURANT') && hasOrgRole) {
        // Org membership gates multi-branch scope; an explicit tenant role defines workspace access.
        // Do not union org role permissions onto invited staff (e.g. Catalog Manager + Regional Manager org).
        const permissions = hasNamedAssignment
          ? named
          : mergeUniquePermissions(orgPerms, branchPerms)
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
    })
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
