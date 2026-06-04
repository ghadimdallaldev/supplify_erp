import { getCache, setCache, deleteCache } from './cache.js'
import { singleflight } from './singleflight.js'
import { noteCacheHit, noteCacheMiss } from '../middlewares/request-timing.js'

const STAFF_LIST_CACHE_TTL_SECONDS = 45

const STAFF_LIST_ENDPOINTS = ['members', 'shifts', 'pto', 'swaps', 'payroll', 'time-entries']

export function staffListCacheKey(endpoint, restaurantId) {
  return `staff:list:${endpoint}:${restaurantId}`
}

/**
 * @template T
 * @param {string} endpoint
 * @param {string} restaurantId
 * @param {import('express').Request} [req]
 * @param {() => Promise<T>} loader
 * @returns {Promise<T>}
 */
export async function cachedStaffList(endpoint, restaurantId, req, loader) {
  const cacheKey = staffListCacheKey(endpoint, restaurantId)
  const cached = await getCache(cacheKey)
  if (cached !== null) {
    noteCacheHit(req, 'staffList')
    return cached
  }
  noteCacheMiss(req, 'staffList')

  return singleflight(cacheKey, async () => {
    const again = await getCache(cacheKey)
    if (again !== null) {
      noteCacheHit(req, 'staffList')
      return again
    }
    const data = await loader()
    await setCache(cacheKey, data, STAFF_LIST_CACHE_TTL_SECONDS).catch(() => {})
    return data
  })
}

export async function invalidateStaffListCache(restaurantId) {
  if (!restaurantId) return
  await Promise.all(
    STAFF_LIST_ENDPOINTS.map((endpoint) =>
      deleteCache(staffListCacheKey(endpoint, restaurantId)).catch(() => {})
    )
  )
}

/**
 * Invalidate staff list caches after successful non-GET staff mutations.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function staffListCacheInvalidationMiddleware(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next()
  }

  const originalJson = res.json.bind(res)
  res.json = (body) => {
    if (body?.ok !== false) {
      const restaurantId =
        req.tenantContext?.tenantType === 'RESTAURANT' ? req.tenantContext.tenantId : null
      if (restaurantId) {
        invalidateStaffListCache(restaurantId).catch(() => {})
      }
    }
    return originalJson(body)
  }
  next()
}
