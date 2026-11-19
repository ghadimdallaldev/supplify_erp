import { deleteCache } from './cache.js'
import { getRolesForUser, getPermissionsForUser } from './permissions.js'

export const TENANT_CONTEXT_CACHE_TTL_SECONDS = 120

export function tenantContextCacheKey(userId, tenantId, tenantType) {
  return `tctx:${userId}:${tenantId}:${tenantType}`
}

/**
 * Retained for rolling-upgrade compatibility. Authorization is request-local only.
 */
export function canUseCrossRequestTenantCaches() {
  // Revocations must take effect even if Redis invalidation or replica fan-out fails.
  return false
}

/**
 * @returns {Promise<{ roles: string[], permissions: string[] }>}
 */
export async function getTenantContextBundle(userId, tenantId, tenantType, req = null) {
  const [roles, permissions] = await Promise.all([
    getRolesForUser(userId, tenantId, tenantType, req),
    getPermissionsForUser(userId, tenantId, tenantType),
  ])
  return { roles, permissions }
}

// Compatibility for callers during a rolling upgrade: do not publish stale allow decisions.
export async function setTenantContextBundle() {}

export async function invalidateTenantContextCache(userId, tenantId, tenantType) {
  if (!userId || !tenantId || !tenantType) return
  await deleteCache(tenantContextCacheKey(userId, tenantId, tenantType)).catch(() => {})
}
