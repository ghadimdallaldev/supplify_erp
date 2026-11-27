import { beforeEach, describe, expect, it, vi } from 'vitest'

const deleted = vi.hoisted(() => ({ keys: [], prefixes: [], dirty: [] }))

vi.mock('./cache.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getRedisClient: () => null,
    deleteCache: vi.fn(async (key) => {
      deleted.keys.push(key)
      return actual.deleteCache(key)
    }),
    deleteCacheByPrefix: vi.fn(async (prefix) => {
      deleted.prefixes.push(prefix)
      return actual.deleteCacheByPrefix(prefix)
    }),
  }
})
vi.mock('./db.js', () => ({
  query: vi.fn(async () => ({ rows: [{ id: 'branch-a' }, { id: 'branch-b' }] })),
}))
vi.mock('../services/reorder-forecast-cache.service.js', () => ({
  markReorderForecastDirty: vi.fn(async (restaurantId, ...rest) =>
    deleted.dirty.push([restaurantId, rest])
  ),
}))

import {
  bumpCatalogVersion,
  getCatalogVersion,
  invalidateRelationshipCaches,
  registerRelationshipCacheHook,
  restaurantCatalogMetaKey,
  supplierCatalogMetaKey,
} from './relationship-cache.js'
import { emitRelationshipChanged, resetRelationshipHooksForTests } from './relationship.js'

beforeEach(() => {
  deleted.keys = []
  deleted.prefixes = []
  deleted.dirty = []
  resetRelationshipHooksForTests()
})

describe('relationship cache', () => {
  it('bumpCatalogVersion increments the version', async () => {
    const before = await getCatalogVersion()
    const after = await bumpCatalogVersion()
    expect(after).toBe(before + 1)
    expect(await getCatalogVersion()).toBe(after)
  })

  it('two restaurants never share a category-count cache key', () => {
    expect(restaurantCatalogMetaKey('productCats', 'r1', 4)).not.toBe(
      restaurantCatalogMetaKey('productCats', 'r2', 4)
    )
    expect(restaurantCatalogMetaKey('productCats', 'r1', 4)).toBe('productCats:v3:r:r1:4')
    expect(supplierCatalogMetaKey('productCats', 's1', 4)).toBe('productCats:v3:s:s1:4')
    expect(supplierCatalogMetaKey('productCats', null, 4)).toBe('productCats:v3:admin:4')
  })

  it('invalidates restaurant summary, reorder recs, forecasts and every branch command center', async () => {
    const v = await getCatalogVersion()
    await invalidateRelationshipCaches({ restaurantId: 'r1', supplierOrgId: 'org-1' })
    expect(deleted.keys).toEqual(
      expect.arrayContaining([
        'dashboard:summary:v2:RESTAURANT:r1',
        'supplier:command-center:branch-a',
        'supplier:command-center:branch-b',
        'dashboard:summary:v2:SUPPLIER:branch-a',
        'dashboard:summary:v2:SUPPLIER:branch-b',
      ])
    )
    expect(deleted.prefixes).toContain('reorder-ai-rec:r1:')
    expect(deleted.dirty).toHaveLength(1)
    expect(deleted.dirty[0][0]).toBe('r1')
    expect(await getCatalogVersion()).toBe(v + 1)
  })

  it('is registered as a relationship hook', async () => {
    registerRelationshipCacheHook()
    registerRelationshipCacheHook() // idempotent
    await emitRelationshipChanged({ restaurantId: 'r9', supplierOrgId: 'org-9', kind: 'block' })
    expect(deleted.keys.filter((k) => k === 'dashboard:summary:v2:RESTAURANT:r9')).toHaveLength(1)
  })
})
