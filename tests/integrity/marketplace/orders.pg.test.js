import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../apps/api/src/lib/auth.js', async (importOriginal) => {
  const { withTestAuth } = await import('./auth-mock.js')
  return withTestAuth(await importOriginal())
})

import { resetMarketplaceDb, startApiForTest, startMarketplaceDb } from './harness.js'
import {
  createOrder,
  createProduct,
  createRestaurant,
  createSupplierOrg,
  follow,
} from './fixtures.js'

let db
let api
let relationship
let writes

beforeAll(async () => {
  db = await startMarketplaceDb()
  api = await startApiForTest()
  relationship = await import('../../../apps/api/src/lib/relationship.js')
  writes = await import('../../../apps/api/src/services/relationship-writes.service.js')
}, 180_000)
afterAll(async () => {
  await api?.close()
})
beforeEach(async () => {
  await resetMarketplaceDb(db.pool)
})

const h = (sub) => ({ 'x-test-user': sub, 'content-type': 'application/json' })

async function placeOrder(sub, items) {
  const res = await fetch(`${api.baseUrl}/api/orders`, {
    method: 'POST',
    headers: h(sub),
    body: JSON.stringify({ items }),
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

describe('orders require a follow (real PG)', () => {
  it('a followed supplier can be ordered from', async () => {
    const org = await createSupplierOrg(db.pool)
    const p = await createProduct(db.pool, org.branchIds[0])
    const r = await createRestaurant(db.pool)
    await follow(db.pool, r.id, org.orgId)
    const res = await placeOrder(r.userSub, [{ productId: p.id, quantity: 1 }])
    expect(res.status, JSON.stringify(res.body)).toBe(201)
  })

  it('cart with an unfollowed supplier is FOLLOW_REQUIRED listing it', async () => {
    const followed = await createSupplierOrg(db.pool, { name: 'Followed Co' })
    const stranger = await createSupplierOrg(db.pool, { name: 'Stranger Co' })
    const p1 = await createProduct(db.pool, followed.branchIds[0])
    const p2 = await createProduct(db.pool, stranger.branchIds[0])
    const r = await createRestaurant(db.pool)
    await follow(db.pool, r.id, followed.orgId)
    const res = await placeOrder(r.userSub, [
      { productId: p1.id, quantity: 1 },
      { productId: p2.id, quantity: 1 },
    ])
    expect(res.status).toBe(403)
    expect(res.body.error.name).toBe('FOLLOW_REQUIRED')
    expect(res.body.error.details.suppliers).toEqual([
      { id: stranger.branchIds[0], name: expect.any(String) },
    ])
    const { rows } = await db.pool.query(
      'SELECT count(*)::int AS c FROM customer_order WHERE restaurant_id = $1',
      [r.id]
    )
    expect(rows[0].c).toBe(0)
  })

  it('past order no longer grants ordering', async () => {
    const org = await createSupplierOrg(db.pool)
    const p = await createProduct(db.pool, org.branchIds[0])
    const r = await createRestaurant(db.pool)
    await createOrder(db.pool, {
      restaurantId: r.id,
      supplierId: org.branchIds[0],
      status: 'DELIVERED',
    })
    const res = await placeOrder(r.userSub, [{ productId: p.id, quantity: 1 }])
    expect(res.status).toBe(403)
    expect(res.body.error.name).toBe('FOLLOW_REQUIRED')
  })

  it('multi-supplier cart takes locks in org-id order (no deadlock under 20 concurrent carts and 20 concurrent unfollows)', async () => {
    const orgA = await createSupplierOrg(db.pool)
    const orgB = await createSupplierOrg(db.pool)
    const pa = await createProduct(db.pool, orgA.branchIds[0], { stock: 500 })
    const pb = await createProduct(db.pool, orgB.branchIds[0], { stock: 500 })
    const r = await createRestaurant(db.pool)
    await follow(db.pool, r.id, orgA.orgId)
    await follow(db.pool, r.id, orgB.orgId)

    const carts = Array.from({ length: 20 }, (_, i) =>
      placeOrder(
        r.userSub,
        i % 2
          ? [
              { productId: pa.id, quantity: 1 },
              { productId: pb.id, quantity: 1 },
            ]
          : [
              { productId: pb.id, quantity: 1 },
              { productId: pa.id, quantity: 1 },
            ]
      )
    )
    const toggles = Array.from({ length: 20 }, async (_, i) => {
      const supplierId = (i % 2 ? orgA : orgB).branchIds[0]
      await writes.unfollowSupplier({ restaurantId: r.id, supplierId })
      await writes
        .followSupplier({ restaurantId: r.id, supplierId, source: 'manual' })
        .catch(() => {})
    })
    const results = await Promise.all(carts)
    await Promise.all(toggles)
    for (const res of results) {
      expect([201, 403], JSON.stringify(res.body)).toContain(res.status)
      if (res.status === 403) expect(res.body.error.name).toBe('FOLLOW_REQUIRED')
    }
  }, 60_000)

  it('order vs unfollow is serialised', async () => {
    const org = await createSupplierOrg(db.pool)
    const p = await createProduct(db.pool, org.branchIds[0])
    const r = await createRestaurant(db.pool)
    await follow(db.pool, r.id, org.orgId)
    const { lockAndAssertOrderRelationships } = await import(
      '../../../apps/api/src/services/order-relationship-guard.service.js'
    )

    // 1) An order transaction holds the shared lock: the unfollow waits, the order commits.
    const orderTx = await db.pool.connect()
    try {
      await orderTx.query('BEGIN')
      await lockAndAssertOrderRelationships(orderTx, r.id, [org.branchIds[0]])
      let unfollowDone = false
      const unfollow = writes
        .unfollowSupplier({ restaurantId: r.id, supplierId: org.branchIds[0] })
        .then(() => {
          unfollowDone = true
        })
      await sleep(400)
      expect(unfollowDone).toBe(false)
      const { rows: o } = await orderTx.query(
        `INSERT INTO customer_order (restaurant_id, status, total_amount, currency)
         VALUES ($1, 'PLACED', 10, 'USD') RETURNING id`,
        [r.id]
      )
      await orderTx.query('COMMIT')
      await unfollow
      expect(unfollowDone).toBe(true)
      const { rows } = await db.pool.query('SELECT 1 FROM customer_order WHERE id = $1', [o[0].id])
      expect(rows).toHaveLength(1)
    } finally {
      orderTx.release()
    }

    // 2) Reverse: an in-flight unfollow holds the exclusive lock; the order waits for it and
    //    then fails with FOLLOW_REQUIRED.
    await follow(db.pool, r.id, org.orgId)
    const relTx = await db.pool.connect()
    try {
      await relTx.query('BEGIN')
      await relationship.lockRelationshipExclusive(relTx, r.id, org.orgId)
      await relTx.query(
        'DELETE FROM supplier_follow WHERE restaurant_id = $1 AND supplier_org_id = $2',
        [r.id, org.orgId]
      )
      let orderDone = false
      const order = placeOrder(r.userSub, [{ productId: p.id, quantity: 1 }]).then((res) => {
        orderDone = true
        return res
      })
      await sleep(600)
      expect(orderDone).toBe(false)
      await relTx.query('COMMIT')
      const res = await order
      expect(res.status).toBe(403)
      expect(res.body.error.name).toBe('FOLLOW_REQUIRED')
    } finally {
      relTx.release()
    }
  }, 30_000)
})
