import { deleteCacheByPrefix } from './cache.js'

/**
 * Drop all dispatch board cache variants for a supplier after assignment changes.
 * Key prefix matches `fulfillment:dispatch:v1:${supplierId}:` in fulfillment/board.js.
 */
export async function invalidateDispatchCacheForSupplier(supplierId) {
  if (!supplierId) return
  await deleteCacheByPrefix(`fulfillment:dispatch:v1:${supplierId}:`).catch(() => {})
}
