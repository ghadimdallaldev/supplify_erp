import { query } from './db.js'
import { getCache, setCache, deleteCache } from './cache.js'
import { singleflight } from './singleflight.js'

const TENANT_PROFILE_CACHE_TTL_SECONDS = 300

export function tenantProfileCacheKey(tenantType, tenantId) {
  return `tenant:profile:${tenantType}:${tenantId}`
}

export async function invalidateTenantProfileCache(tenantId, tenantType) {
  if (!tenantId || !tenantType) return
  await deleteCache(tenantProfileCacheKey(tenantType, tenantId)).catch(() => {})
}

/**
 * Cached supplier/restaurant row for /auth/me and similar read paths.
 * @returns {Promise<object|null>}
 */
export async function getTenantProfileRow(tenantType, tenantId) {
  if (!tenantId || (tenantType !== 'SUPPLIER' && tenantType !== 'RESTAURANT')) return null

  const cacheKey = tenantProfileCacheKey(tenantType, tenantId)
  const cached = await getCache(cacheKey)
  if (cached !== null) return cached === 'null' ? null : cached

  return singleflight(cacheKey, async () => {
    const again = await getCache(cacheKey)
    if (again !== null) return again === 'null' ? null : again

    const table = tenantType === 'SUPPLIER' ? 'supplier' : 'restaurant'
    const { rows } = await query(`SELECT * FROM ${table} WHERE id = $1`, [tenantId])
    const row = rows[0] || null
    await setCache(cacheKey, row ?? 'null', TENANT_PROFILE_CACHE_TTL_SECONDS).catch(() => {})
    return row
  })
}
