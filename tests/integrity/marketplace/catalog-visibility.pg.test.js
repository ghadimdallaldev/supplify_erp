import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../apps/api/src/lib/auth.js', async (importOriginal) => {
  const { withTestAuth } = await import('./auth-mock.js')
  return withTestAuth(await importOriginal())
})

import { resetMarketplaceDb, startApiForTest, startMarketplaceDb } from './harness.js'
import { block, createProduct, createRestaurant, createSupplierOrg, follow } from './fixtures.js'

let db
let api
let deals

beforeAll(async () => {
  db = await startMarketplaceDb()
  api = await startApiForTest()
  deals = await import('../../../apps/api/src/services/deal-promotions.service.js')
}, 180_000)
afterAll(async () => {
  await api?.close()
})
beforeEach(async () => {
  await resetMarketplaceDb(db.pool)
})

const h = (sub) => ({ 'x-test-user': sub })

async function get(sub, path) {
  const res = await fetch(`${api.baseUrl}${path}`, { headers: h(sub) })
  return { status: res.status, body: await res.json().catch(() => null) }
}

async function listByName(sub, name) {
  const res = await get(sub, `/api/products?q=${encodeURIComponent(name)}&limit=50`)
  expect(res.status, JSON.stringify(res.body)).toBe(200)
  return res.body.data.products
}

async function searchByName(sub, name) {
  const res = await get(sub, `/api/search?q=${encodeURIComponent(name)}&grouped=true`)
  expect(res.status, JSON.stringify(res.body)).toBe(200)
  const data = res.body.data
  return data.products ?? data.results?.products ?? []
}

async function createDeal(pool, supplierId) {
  const {
    rows: [d],
  } = await pool.query(
    `INSERT INTO promotions (supplier_id, name, type, discount_value, status, starts_at)
     VALUES ($1, 'Deal ' || substr(md5(random()::text), 1, 6), 'percentage_discount', 10, 'active',
             now() - interval '1 hour')
     RETURNING id`,
    [supplierId]
  )
  return d.id
}

describe('restaurant catalog visibility (real PG)', () => {
  it("non-follower opens a public supplier's product: list price yes, qty no", async () => {
    const org = await createSupplierOrg(db.pool, { publicCatalog: true })
    const p = await createProduct(db.pool, org.branchIds[0], { price: 12, stock: 7 })
    const r = await createRestaurant(db.pool)

    const detail = await get(r.userSub, `/api/products/${p.id}`)
    expect(detail.status, JSON.stringify(detail.body)).toBe(200)
    const product = detail.body.data.product
    expect(Number(product.current_price)).toBe(12)
    expect(product.is_followed).toBe(false)
    expect(product.in_stock).toBe(true)
    expect(product).not.toHaveProperty('available_qty')

    const [row] = await listByName(r.userSub, p.name)
    expect(row.id).toBe(p.id)
    expect(row.is_followed).toBe(false)
    expect(row.in_stock).toBe(true)
    expect(row).not.toHaveProperty('available_qty')

    const [hit] = await searchByName(r.userSub, p.name)
    expect(hit?.id).toBe(p.id)
    expect(hit.is_followed).toBe(false)
    expect(hit).not.toHaveProperty('available_qty')

    const prices = await get(r.userSub, `/api/prices/product/${p.id}`)
    expect(prices.status).toBe(200)
    const inventory = await get(r.userSub, `/api/inventory/product/${p.id}`)
    expect(inventory.status).toBe(404)

    // A follower gets the quantity.
    await follow(db.pool, r.id, org.orgId)
    const followed = await get(r.userSub, `/api/products/${p.id}`)
    expect(followed.body.data.product.is_followed).toBe(true)
    expect(Number(followed.body.data.product.available_qty)).toBe(7)
    expect((await get(r.userSub, `/api/inventory/product/${p.id}`)).status).toBe(200)
  })

  it('public_catalog_enabled=false hides products and deals from non-followers only', async () => {
    const org = await createSupplierOrg(db.pool, { publicCatalog: false })
    const p = await createProduct(db.pool, org.branchIds[0])
    const dealId = await createDeal(db.pool, org.branchIds[0])
    const stranger = await createRestaurant(db.pool)
    const fan = await createRestaurant(db.pool)
    await follow(db.pool, fan.id, org.orgId)

    expect((await get(stranger.userSub, `/api/products/${p.id}`)).status).toBe(404)
    expect(await listByName(stranger.userSub, p.name)).toEqual([])
    expect(await searchByName(stranger.userSub, p.name)).toEqual([])
    expect((await get(stranger.userSub, `/api/prices/product/${p.id}`)).status).toBe(404)
    expect((await deals.discoverDealsForRestaurant(stranger.id)).map((d) => d.id)).not.toContain(
      dealId
    )
    expect(await deals.loadDealDetailForRestaurant(dealId, stranger.id)).toBeNull()

    expect((await get(fan.userSub, `/api/products/${p.id}`)).status).toBe(200)
    expect((await listByName(fan.userSub, p.name)).map((x) => x.id)).toEqual([p.id])
    expect((await deals.discoverDealsForRestaurant(fan.id)).map((d) => d.id)).toContain(dealId)
  })

  it('blocked supplier is invisible even when it was followed', async () => {
    const org = await createSupplierOrg(db.pool, { publicCatalog: true, branches: 2 })
    const p = await createProduct(db.pool, org.branchIds[1])
    const dealId = await createDeal(db.pool, org.branchIds[1])
    const r = await createRestaurant(db.pool)
    await follow(db.pool, r.id, org.orgId)
    await block(db.pool, r.id, org.orgId)

    expect((await get(r.userSub, `/api/products/${p.id}`)).status).toBe(404)
    expect(await listByName(r.userSub, p.name)).toEqual([])
    expect(await searchByName(r.userSub, p.name)).toEqual([])
    expect((await get(r.userSub, `/api/prices/product/${p.id}`)).status).toBe(404)
    expect((await deals.discoverDealsForRestaurant(r.id)).map((d) => d.id)).not.toContain(dealId)
  })

  it('contract price only to its restaurant', async () => {
    const org = await createSupplierOrg(db.pool, { publicCatalog: true })
    const p = await createProduct(db.pool, org.branchIds[0], { price: 20 })
    const owner = await createRestaurant(db.pool)
    const other = await createRestaurant(db.pool)
    await follow(db.pool, owner.id, org.orgId)
    await follow(db.pool, other.id, org.orgId)
    await db.pool.query(
      `INSERT INTO restaurant_pricing (restaurant_id, supplier_id, product_id, price, currency, is_active)
       VALUES ($1, $2, $3, 15, 'USD', true)`,
      [owner.id, org.branchIds[0], p.id]
    )
    const mine = (await get(owner.userSub, `/api/products/${p.id}`)).body.data.product
    expect(Number(mine.current_price)).toBe(15)
    expect(mine.pricing_source).toBe('CONTRACT_PRICE')
    expect(mine.contract_price_id).toBeTruthy()
    const theirs = (await get(other.userSub, `/api/products/${p.id}`)).body.data.product
    expect(Number(theirs.current_price)).toBe(20)
    expect(theirs.contract_price_id ?? null).toBeNull()
  })

  it('deal of a public supplier visible to a non-follower; deal of a private supplier only to followers', async () => {
    const pub = await createSupplierOrg(db.pool, { publicCatalog: true })
    const priv = await createSupplierOrg(db.pool, { publicCatalog: false })
    const pubDeal = await createDeal(db.pool, pub.branchIds[0])
    const privDeal = await createDeal(db.pool, priv.branchIds[0])
    const r = await createRestaurant(db.pool)

    const ids = (await deals.discoverDealsForRestaurant(r.id)).map((d) => d.id)
    expect(ids).toContain(pubDeal)
    expect(ids).not.toContain(privDeal)
    const detail = await deals.loadDealDetailForRestaurant(pubDeal, r.id)
    expect(detail?.id).toBe(pubDeal)
    expect(detail.is_followed).toBe(false)

    await follow(db.pool, r.id, priv.orgId, { supplierId: priv.branchIds[0] })
    const after = await deals.discoverDealsForRestaurant(r.id)
    expect(after.map((d) => d.id)).toContain(privDeal)
    expect(after.find((d) => d.id === privDeal).is_followed).toBe(true)
  })

  it('private-catalog images need org follow; sibling branch image allowed', async () => {
    const org = await createSupplierOrg(db.pool, { publicCatalog: false, branches: 2 })
    const r = await createRestaurant(db.pool)
    const key = (branchId) => `uploads/${branchId}/products/x.jpg`
    const fetchKey = async (branchId) =>
      (
        await fetch(`${api.baseUrl}/api/files/object?key=${encodeURIComponent(key(branchId))}`, {
          headers: h(r.userSub),
        })
      ).status

    expect(await fetchKey(org.branchIds[1])).toBe(403)
    // Follow recorded against the main branch; the sibling branch image is allowed.
    await follow(db.pool, r.id, org.orgId, { supplierId: org.branchIds[0] })
    expect(await fetchKey(org.branchIds[1])).not.toBe(403)
    await block(db.pool, r.id, org.orgId)
    expect(await fetchKey(org.branchIds[1])).toBe(403)
  })
})
