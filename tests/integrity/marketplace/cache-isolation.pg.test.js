import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../apps/api/src/lib/auth.js', async (importOriginal) => {
  const { withTestAuth } = await import('./auth-mock.js')
  return withTestAuth(await importOriginal())
})

import { resetMarketplaceDb, startApiForTest, startMarketplaceDb } from './harness.js'
import { createProduct, createRestaurant, createSupplierOrg, follow } from './fixtures.js'

let db
let api
let cache
let relCache

beforeAll(async () => {
  db = await startMarketplaceDb()
  api = await startApiForTest()
  cache = await import('../../../apps/api/src/lib/cache.js')
  relCache = await import('../../../apps/api/src/lib/relationship-cache.js')
}, 180_000)
afterAll(async () => {
  await api?.close()
})
beforeEach(async () => {
  await resetMarketplaceDb(db.pool)
})

const h = (sub) => ({ 'x-test-user': sub, 'content-type': 'application/json' })

async function platformCategoryId() {
  const { rows } = await db.pool.query(
    `SELECT id FROM product_category
     WHERE supplier_id IS NULL AND parent_category_id IS NOT NULL AND is_active = true
     ORDER BY name LIMIT 1`
  )
  return rows[0].id
}

/** A leaf's count in the caller's category tree (0 when restaurants get it omitted as empty). */
async function categoryCount(sub, categoryId) {
  const res = await fetch(`${api.baseUrl}/api/products/categories`, { headers: h(sub) })
  expect(res.status).toBe(200)
  const body = await res.json()
  const leaves = body.data.departments.flatMap((d) => d.categories)
  return leaves.find((c) => c.id === categoryId)?.product_count ?? 0
}

describe('relationship-aware caches (real PG, in-memory cache)', () => {
  it('two restaurants never share a category-count cache entry', async () => {
    const categoryId = await platformCategoryId()
    const privateOrg = await createSupplierOrg(db.pool, { publicCatalog: false })
    await createProduct(db.pool, privateOrg.branchIds[0], { categoryId })
    const a = await createRestaurant(db.pool)
    const b = await createRestaurant(db.pool)
    await follow(db.pool, a.id, privateOrg.orgId)

    expect(await categoryCount(a.userSub, categoryId)).toBe(1)
    expect(await categoryCount(b.userSub, categoryId)).toBe(0)
    // and in the other order, after both entries exist
    expect(await categoryCount(a.userSub, categoryId)).toBe(1)
  })

  it('block invalidates the blocker dashboard summary and reorder recommendations immediately', async () => {
    const org = await createSupplierOrg(db.pool, { publicCatalog: false })
    await createProduct(db.pool, org.branchIds[0])
    const r = await createRestaurant(db.pool)
    await follow(db.pool, r.id, org.orgId)

    const summary = async () => {
      const res = await fetch(`${api.baseUrl}/api/admin/dashboard/summary`, {
        headers: h(r.userSub),
      })
      expect(res.status).toBe(200)
      return (await res.json()).data
    }
    const before = await summary()
    expect(before.stats.totalProducts).toBe(1)
    await cache.setCache(`reorder-ai-rec:${r.id}:x`, { stale: true }, 600)

    const blocked = await fetch(`${api.baseUrl}/api/suppliers/${org.branchIds[0]}/block`, {
      method: 'POST',
      headers: h(r.userSub),
      body: '{}',
    })
    expect(blocked.status).toBe(200)
    expect((await summary()).stats.totalProducts).toBe(0)
    expect(await cache.getCache(`reorder-ai-rec:${r.id}:x`)).toBeNull()
  })

  it('bulk import bumps catalog version', async () => {
    const org = await createSupplierOrg(db.pool)
    const { executeProductImport } = await import(
      '../../../apps/api/src/services/product-import.service.js'
    )
    const before = await relCache.getCatalogVersion()
    const result = await executeProductImport(
      org.branchIds[0],
      'name,sku,price,stock,unit\nBulk Tomato,BULK-1,2.5,10,kg\n',
      { userId: org.users[0].userId }
    )
    expect(result.summary.created).toBe(1)
    expect(await relCache.getCatalogVersion()).toBeGreaterThan(before)
  })

  it('supplier command center drops a restaurant right after unfollow', async () => {
    const org = await createSupplierOrg(db.pool, { branches: 2 })
    const r = await createRestaurant(db.pool)
    await follow(db.pool, r.id, org.orgId)
    for (const id of org.branchIds) {
      await cache.setCache(`supplier:command-center:${id}`, { restaurants: [r.id] }, 600)
    }
    const res = await fetch(`${api.baseUrl}/api/suppliers/${org.branchIds[1]}/follow`, {
      method: 'DELETE',
      headers: h(r.userSub),
    })
    expect(res.status).toBe(200)
    for (const id of org.branchIds) {
      expect(await cache.getCache(`supplier:command-center:${id}`)).toBeNull()
    }
  })
})
