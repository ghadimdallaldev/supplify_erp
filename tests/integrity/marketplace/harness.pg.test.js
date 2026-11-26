import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../apps/api/src/lib/auth.js', async (importOriginal) => {
  const { withTestAuth } = await import('./auth-mock.js')
  return withTestAuth(await importOriginal())
})

import { resetMarketplaceDb, startApiForTest, startMarketplaceDb } from './harness.js'
import {
  block,
  createConversation,
  createOrder,
  createProduct,
  createRestaurant,
  createSupplierOrg,
  follow,
} from './fixtures.js'

let db
let api

beforeAll(async () => {
  db = await startMarketplaceDb()
  api = await startApiForTest()
})
afterAll(async () => {
  await api?.close()
})
beforeEach(async () => {
  await resetMarketplaceDb(db.pool)
})

describe('marketplace real-postgres harness', () => {
  it('applies all migrations and fixtures create an org with two branches', async () => {
    const { rows: applied } = await db.pool.query(
      'SELECT count(*)::int AS n FROM schema_migrations'
    )
    expect(applied[0].n).toBeGreaterThan(200)

    const org = await createSupplierOrg(db.pool, { branches: 2 })
    expect(org.branchIds).toHaveLength(2)
    const { rows } = await db.pool.query(
      'SELECT organization_id FROM supplier WHERE id = ANY($1::uuid[])',
      [org.branchIds]
    )
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((r) => r.organization_id))).toEqual(new Set([org.orgId]))
  })

  it('serves authenticated requests for a fixture restaurant user over HTTP', async () => {
    const org = await createSupplierOrg(db.pool, { branches: 1 })
    const restaurant = await createRestaurant(db.pool)
    await follow(db.pool, restaurant.id, org.orgId)

    const res = await fetch(`${api.baseUrl}/api/suppliers/followed`, {
      headers: { 'x-test-user': restaurant.userSub },
    })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(JSON.stringify(body.data)).toContain(org.branchIds[0])
  })

  it('fixtures create products with price and stock, orders, conversations and blocks', async () => {
    const org = await createSupplierOrg(db.pool, { branches: 1 })
    const restaurant = await createRestaurant(db.pool)
    const product = await createProduct(db.pool, org.branchIds[0], { price: 7, stock: 3 })
    const { rows: priced } = await db.pool.query(
      `SELECT pr.amount::float AS amount, i.available_qty::float AS qty
       FROM price pr JOIN inventory i ON i.product_id = pr.product_id WHERE pr.product_id = $1`,
      [product.id]
    )
    expect(priced[0]).toEqual({ amount: 7, qty: 3 })

    const order = await createOrder(db.pool, {
      restaurantId: restaurant.id,
      supplierId: org.branchIds[0],
      productId: product.id,
    })
    const conv = await createConversation(db.pool, restaurant.id, org.branchIds[0])
    await block(db.pool, restaurant.id, org.orgId)
    const { rows } = await db.pool.query(
      `SELECT (SELECT count(*)::int FROM order_item WHERE order_id = $1) AS lines,
              (SELECT count(*)::int FROM conversation_participant WHERE conversation_id = $2) AS parts,
              (SELECT count(*)::int FROM supplier_blocklist WHERE restaurant_id = $3) AS blocks`,
      [order.id, conv.id, restaurant.id]
    )
    expect(rows[0]).toEqual({ lines: 1, parts: 2, blocks: 1 })
  })

  it('reset removes business rows but keeps the seeded platform categories', async () => {
    const before = await db.pool.query(
      'SELECT count(*)::int AS n FROM product_category WHERE supplier_id IS NULL'
    )
    await createSupplierOrg(db.pool)
    await resetMarketplaceDb(db.pool)
    const { rows } = await db.pool.query(
      `SELECT (SELECT count(*)::int FROM supplier) AS suppliers,
              (SELECT count(*)::int FROM product_category WHERE supplier_id IS NULL) AS cats`
    )
    expect(rows[0]).toEqual({ suppliers: 0, cats: before.rows[0].n })
    expect(before.rows[0].n).toBeGreaterThanOrEqual(16)
  })

  it('rejects requests without a test identity', async () => {
    const res = await fetch(`${api.baseUrl}/api/suppliers/followed`)
    expect(res.status).toBe(401)
  })
})
