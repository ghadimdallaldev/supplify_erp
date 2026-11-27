/**
 * Caches whose contents depend on restaurant → supplier-organisation relationships.
 *
 * - `catalogVersion` (Redis counter, in-process fallback) is part of every catalog-meta key and
 *   is bumped on any product, catalog-visibility or relationship change, so stale entries are
 *   simply never read again (they expire by TTL).
 * - Category/tag meta keys are per viewer: restaurants see only catalogs visible to them.
 * - A relationship change also deletes the restaurant's dashboard summary, its reorder AI
 *   recommendations (and marks forecasts dirty), and the command center + dashboard summary of
 *   every branch of the supplier organisation.
 */
import { deleteCache, deleteCacheByPrefix, getRedisClient } from './cache.js'
import { query } from './db.js'
import { logger } from './logger.js'
import { onRelationshipChanged } from './relationship.js'

const CATALOG_VERSION_KEY = 'catalog:version'
let memoryCatalogVersion = 0

export async function getCatalogVersion() {
  const redis = getRedisClient()
  if (redis) {
    try {
      return Number((await redis.get(CATALOG_VERSION_KEY)) || 0)
    } catch (error) {
      logger.warn('catalog version read failed', { error: error.message })
    }
  }
  return memoryCatalogVersion
}

export async function bumpCatalogVersion() {
  const redis = getRedisClient()
  if (redis) {
    try {
      return Number(await redis.incr(CATALOG_VERSION_KEY))
    } catch (error) {
      logger.warn('catalog version bump failed', { error: error.message })
    }
  }
  memoryCatalogVersion += 1
  return memoryCatalogVersion
}

/** Best-effort bump for write paths: a failed bump must never fail the write. */
export async function bumpCatalogVersionSafe() {
  try {
    return await bumpCatalogVersion()
  } catch (error) {
    logger.warn('catalog version bump failed', { error: error.message })
    return null
  }
}

/** `productCats:v3:r:<restaurantId>:<version>` */
export function restaurantCatalogMetaKey(kind, restaurantId, version) {
  return `${kind}:v3:r:${restaurantId}:${version}`
}

/** `productCats:v3:s:<supplierId>:<version>`, or `productCats:v3:admin:<version>` without one. */
export function supplierCatalogMetaKey(kind, supplierId, version) {
  return supplierId ? `${kind}:v3:s:${supplierId}:${version}` : `${kind}:v3:admin:${version}`
}

async function orgBranchIds(supplierOrgId) {
  if (!supplierOrgId) return []
  const { rows } = await query('SELECT id FROM supplier WHERE organization_id = $1', [
    supplierOrgId,
  ])
  return rows.map((r) => r.id)
}

/**
 * @param {{ restaurantId?: string|null, supplierOrgId?: string|null }} change
 */
export async function invalidateRelationshipCaches({ restaurantId, supplierOrgId }) {
  const keys = []
  if (restaurantId) keys.push(`dashboard:summary:v2:RESTAURANT:${restaurantId}`)
  for (const branchId of await orgBranchIds(supplierOrgId)) {
    keys.push(`supplier:command-center:${branchId}`, `dashboard:summary:v2:SUPPLIER:${branchId}`)
  }
  const tasks = keys.map((k) => deleteCache(k).catch(() => {}))
  if (restaurantId) {
    tasks.push(deleteCacheByPrefix(`reorder-ai-rec:${restaurantId}:`).catch(() => {}))
    tasks.push(
      import('../services/reorder-forecast-cache.service.js')
        .then((m) => m.markReorderForecastDirty(restaurantId, { reason: 'relationship_change' }))
        .catch((error) =>
          logger.warn('forecast dirty on relationship change failed', { error: error.message })
        )
    )
  }
  tasks.push(bumpCatalogVersionSafe())
  await Promise.all(tasks)
}

let unregister = null

/** Register once (idempotent); called at app construction. */
export function registerRelationshipCacheHook() {
  if (unregister) unregister()
  unregister = onRelationshipChanged((event) => invalidateRelationshipCaches(event))
  return unregister
}
