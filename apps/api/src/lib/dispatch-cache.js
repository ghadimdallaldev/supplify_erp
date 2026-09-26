import { deleteCacheByPrefix } from './cache.js'

/** Bump with the board query shape. Invalidation must use this same prefix. */
export const DISPATCH_CACHE_VERSION = 'v2'

export function dispatchCacheKey(supplierId, days, warehouseId) {
  return `fulfillment:dispatch:${DISPATCH_CACHE_VERSION}:${supplierId}:${days}:${warehouseId || 'all'}`
}

/**
 * Drop every dispatch-board cache variant for a supplier after an assignment change.
 * The prefix must match `dispatchCacheKey`, including the version segment.
 */
export async function invalidateDispatchCacheForSupplier(supplierId) {
  if (!supplierId) return
  await deleteCacheByPrefix(`fulfillment:dispatch:${DISPATCH_CACHE_VERSION}:${supplierId}:`).catch(
    () => {}
  )
}
