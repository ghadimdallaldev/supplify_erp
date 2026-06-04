import { getCache, setCache, deleteCache } from './cache.js'
import { singleflight } from './singleflight.js'
import { getEffectiveTenant } from './impersonation.js'
import { getRolesForUser, getPermissionsForUser } from './permissions.js'
import { noteCacheHit, noteCacheMiss } from '../middlewares/request-timing.js'

export const TENANT_CONTEXT_CACHE_TTL_SECONDS = 120

export function tenantContextCacheKey(userId, tenantId, tenantType) {
  return `tctx:${userId}:${tenantId}:${tenantType}`
}

/**
 * Cross-request tenant context bundle is only safe on the common RESTAURANT/SUPPLIER path
 * (no impersonation, branch switch, or active-tenant cookie).
 * @param {import('express').Request} req
 */
export function canUseCrossRequestTenantCaches(req) {
  if (!req.userData) return false
  if (getEffectiveTenant(req)) return false
  if (req.headers['x-branch-id'] && req.userData.role === 'SUPPLIER') return false
  if (req.activeTenantContext?.userId === req.userData.id && req.activeTenantContext?.tenantId) {
    return false
  }
  const tenantType = req.userData.role
  return tenantType === 'RESTAURANT' || tenantType === 'SUPPLIER'
}

/**
 * @returns {Promise<{ roles: string[], permissions: string[] }>}
 */
export async function getTenantContextBundle(userId, tenantId, tenantType, req = null) {
  const cacheKey = tenantContextCacheKey(userId, tenantId, tenantType)
  const cached = await getCache(cacheKey)
  if (cached && Array.isArray(cached.roles) && Array.isArray(cached.permissions)) {
    noteCacheHit(req, 'tctx')
    return cached
  }
  noteCacheMiss(req, 'tctx')

  return singleflight(cacheKey, async () => {
    const again = await getCache(cacheKey)
    if (again && Array.isArray(again.roles) && Array.isArray(again.permissions)) {
      noteCacheHit(req, 'tctx')
      return again
    }

    const [roles, permissions] = await Promise.all([
      getRolesForUser(userId, tenantId, tenantType, req),
      getPermissionsForUser(userId, tenantId, tenantType),
    ])
    const bundle = { roles, permissions }
    if (roles.length > 0) {
      await setCache(cacheKey, bundle, TENANT_CONTEXT_CACHE_TTL_SECONDS).catch(() => {})
    }
    return bundle
  })
}

export async function setTenantContextBundle(userId, tenantId, tenantType, roles, permissions) {
  if (!userId || !tenantId || !tenantType || !Array.isArray(roles) || roles.length === 0) return
  await setCache(
    tenantContextCacheKey(userId, tenantId, tenantType),
    { roles, permissions: permissions ?? [] },
    TENANT_CONTEXT_CACHE_TTL_SECONDS
  ).catch(() => {})
}

export async function invalidateTenantContextCache(userId, tenantId, tenantType) {
  if (!userId || !tenantId || !tenantType) return
  await deleteCache(tenantContextCacheKey(userId, tenantId, tenantType)).catch(() => {})
}
