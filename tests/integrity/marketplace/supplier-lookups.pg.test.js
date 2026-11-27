import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../apps/api/src/lib/auth.js', async (importOriginal) => {
  const { withTestAuth } = await import('./auth-mock.js')
  return withTestAuth(await importOriginal())
})

import { resetMarketplaceDb, startApiForTest, startMarketplaceDb } from './harness.js'
import {
  block,
  createOrder,
  createProduct,
  createRestaurant,
  createSupplierOrg,
  follow,
} from './fixtures.js'

let db
let api
let writes

beforeAll(async () => {
  db = await startMarketplaceDb()
  api = await startApiForTest()
  writes = await import('../../../apps/api/src/services/relationship-writes.service.js')
}, 180_000)
afterAll(async () => {
  await api?.close()
})
beforeEach(async () => {
  await resetMarketplaceDb(db.pool)
})

const UNKNOWN = '00000000-0000-4000-8000-0000000000aa'

async function call(sub, method, path, body) {
  const res = await fetch(`${api.baseUrl}${path}`, {
    method,
    headers: { 'x-test-user': sub, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

/** Drop the per-request id so two error bodies can be compared. */
const shape = (r) => ({ status: r.status, error: r.body?.error })

async function setup({ followed = true } = {}) {
  const org = await createSupplierOrg(db.pool)
  const supplierId = org.branchIds[0]
  const sub = org.users[0].userSub
  const product = await createProduct(db.pool, supplierId)
  const r = await createRestaurant(db.pool)
  if (followed) await follow(db.pool, r.id, org.orgId)
  return { org, supplierId, sub, product, r }
}

describe('suppliers reach only following restaurants (real PG)', () => {
  it('same response for unknown and non-follower', async () => {
    const { sub, product, r } = await setup({ followed: false })
    const { rows: branches } = await db.pool.query(
      `INSERT INTO branch (tenant_id, restaurant_id, name) VALUES ($1, $1, 'Other') RETURNING id`,
      [r.id]
    )
    const probes = [
      (rid) => call(sub, 'GET', `/api/restaurants/${rid}`),
      (rid) =>
        call(sub, 'POST', '/api/orders/manual', {
          restaurant_id: rid,
          items: [{ productId: product.id, quantity: 1 }],
        }),
      (rid) =>
        call(sub, 'POST', '/api/orders/manual', {
          restaurant_id: rid,
          branchId: branches[0].id,
          items: [{ productId: product.id, quantity: 1 }],
        }),
      (rid) =>
        call(sub, 'POST', '/api/restaurant-pricing', {
          restaurantId: rid,
          productId: product.id,
          price: 5,
        }),
      (rid) =>
        call(sub, 'POST', '/api/restaurant-pricing/bulk', {
          restaurantId: rid,
          items: [{ productId: product.id, price: 5 }],
        }),
    ]
    for (const probe of probes) {
      const unknown = shape(await probe(UNKNOWN))
      const stranger = shape(await probe(r.id))
      expect(stranger, JSON.stringify(stranger)).toEqual(unknown)
      expect(stranger.status).toBe(404)
      expect(stranger.error.name).toBe('RESTAURANT_NOT_AVAILABLE')
    }

    // PATCH: an unknown contract id and a non-follower's contract look the same.
    const {
      rows: [contract],
    } = await db.pool.query(
      `INSERT INTO restaurant_pricing (supplier_id, restaurant_id, product_id, price, currency, agreement_type, is_active)
       SELECT p.supplier_id, $1, p.id, 4, 'USD', 'CUSTOM', true FROM product p WHERE p.id = $2
       RETURNING id`,
      [r.id, product.id]
    )
    const unknownPatch = shape(
      await call(sub, 'PATCH', `/api/restaurant-pricing/${UNKNOWN}`, { price: 6 })
    )
    const strangerPatch = shape(
      await call(sub, 'PATCH', `/api/restaurant-pricing/${contract.id}`, { price: 6 })
    )
    expect(strangerPatch).toEqual(unknownPatch)
    expect(strangerPatch.status).toBe(404)
    const { rows: still } = await db.pool.query(
      'SELECT price::float AS price FROM restaurant_pricing WHERE id = $1',
      [contract.id]
    )
    expect(still[0].price).toBe(4)
  })

  it('PATCH after unfollow is 404; following again shows the contract', async () => {
    const { supplierId, sub, product, r } = await setup()
    const created = await call(sub, 'POST', '/api/restaurant-pricing', {
      restaurantId: r.id,
      productId: product.id,
      price: 5,
    })
    expect(created.status, JSON.stringify(created.body)).toBe(200)
    const id = created.body.data.pricing.id
    await writes.unfollowSupplier({ restaurantId: r.id, supplierId })

    const patch = await call(sub, 'PATCH', `/api/restaurant-pricing/${id}`, { price: 6 })
    expect(patch.status).toBe(404)
    const hidden = await call(sub, 'GET', '/api/restaurant-pricing')
    expect(hidden.body.data.pricing.map((p) => p.id)).not.toContain(id)

    await writes.followSupplier({ restaurantId: r.id, supplierId })
    const shown = await call(sub, 'GET', '/api/restaurant-pricing')
    expect(shown.body.data.pricing.map((p) => p.id)).toContain(id)
  })

  it('contract write racing a block: the write commits first or fails, never after the block', async () => {
    const { supplierId, sub, product, r } = await setup()
    for (let i = 0; i < 6; i++) {
      await db.pool.query('DELETE FROM restaurant_pricing WHERE restaurant_id = $1', [r.id])
      await db.pool.query('DELETE FROM supplier_blocklist WHERE restaurant_id = $1', [r.id])
      if (i > 0) await writes.followSupplier({ restaurantId: r.id, supplierId })

      const [write] = await Promise.all([
        call(sub, 'POST', '/api/restaurant-pricing', {
          restaurantId: r.id,
          productId: product.id,
          price: 5 + i,
        }),
        writes.blockSupplier({ restaurantId: r.id, supplierId }),
      ])
      const {
        rows: [row],
      } = await db.pool.query(
        `SELECT rp.updated_at, sb.created_at AS blocked_at
         FROM supplier_blocklist sb
         LEFT JOIN restaurant_pricing rp ON rp.restaurant_id = sb.restaurant_id
         WHERE sb.restaurant_id = $1`,
        [r.id]
      )
      if (write.status === 200) {
        expect(row.updated_at).not.toBeNull()
        expect(new Date(row.updated_at).getTime()).toBeLessThanOrEqual(
          new Date(row.blocked_at).getTime()
        )
      } else {
        expect(write.status).toBe(404)
        expect(row.updated_at).toBeNull()
      }
    }
  })

  it('list hides blocked followers and non-followers', async () => {
    const { org, sub, r: followed } = await setup()
    const blocked = await createRestaurant(db.pool)
    await follow(db.pool, blocked.id, org.orgId)
    await block(db.pool, blocked.id, org.orgId)
    const past = await createRestaurant(db.pool)
    await createOrder(db.pool, {
      restaurantId: past.id,
      supplierId: org.branchIds[0],
      status: 'DELIVERED',
    })
    const list = await call(sub, 'GET', '/api/restaurants')
    expect(list.status, JSON.stringify(list.body)).toBe(200)
    const ids = (list.body.data.restaurants || []).map((x) => x.id)
    expect(ids).toContain(followed.id)
    expect(ids).not.toContain(blocked.id)
    expect(ids).not.toContain(past.id)
  })

  it('manual order issues no restaurant/location query before the check', async () => {
    const { sub, product, r } = await setup({ followed: false })
    const seen = []
    const original = db.pool.query.bind(db.pool)
    const spy = vi.spyOn(db.pool, 'query').mockImplementation((text, ...rest) => {
      seen.push(String(typeof text === 'string' ? text : text?.text || ''))
      return original(text, ...rest)
    })
    try {
      const res = await call(sub, 'POST', '/api/orders/manual', {
        restaurant_id: r.id,
        items: [{ productId: product.id, quantity: 1 }],
      })
      expect(res.status).toBe(404)
    } finally {
      spy.mockRestore()
    }
    const probing = seen.filter((sql) => /\bFROM\s+(restaurant|branch)\b/i.test(sql))
    expect(probing).toEqual([])
  })
})
