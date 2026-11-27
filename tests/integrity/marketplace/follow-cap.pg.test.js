import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../apps/api/src/lib/auth.js', async (importOriginal) => {
  const { withTestAuth } = await import('./auth-mock.js')
  return withTestAuth(await importOriginal())
})
// Every restaurant plan has suppliers_per_restaurant = -1 today and tenant overrides can only
// raise a limit, so the cap value is mocked; the locking and counting under test stay real.
vi.mock('../../../apps/api/src/lib/subscription.js', async (importOriginal) => ({
  ...(await importOriginal()),
  checkLimit: async () => ({ isUnlimited: false, limit: 3 }),
}))

import { resetMarketplaceDb, startApiForTest, startMarketplaceDb } from './harness.js'
import { createRestaurant, createSupplierOrg, follow } from './fixtures.js'

let db
let api
let writes
let subscription

beforeAll(async () => {
  db = await startMarketplaceDb()
  api = await startApiForTest()
  writes = await import('../../../apps/api/src/services/relationship-writes.service.js')
  subscription = await import('../../../apps/api/src/lib/subscription.js')
}, 180_000)
afterAll(async () => {
  await api?.close()
})
beforeEach(async () => {
  await resetMarketplaceDb(db.pool)
})

async function followLimit(restaurantId) {
  const check = await subscription.checkLimit(
    restaurantId,
    'RESTAURANT',
    'suppliers_per_restaurant'
  )
  expect(check.isUnlimited).toBeFalsy()
  expect(Number.isFinite(check.limit)).toBe(true)
  return check.limit
}

describe('follow cap and relationship write races (real PG)', () => {
  it('concurrent follows at cap: exactly one of 10 parallel follows is inserted', async () => {
    const r = await createRestaurant(db.pool)
    // Touch the subscription once so the restaurant has its plan row.
    await fetch(`${api.baseUrl}/api/suppliers/followed`, { headers: { 'x-test-user': r.userSub } })
    const limit = await followLimit(r.id)
    for (let i = 0; i < limit - 1; i++) {
      const org = await createSupplierOrg(db.pool)
      await follow(db.pool, r.id, org.orgId)
    }
    const targets = []
    for (let i = 0; i < 10; i++) targets.push(await createSupplierOrg(db.pool))

    const results = await Promise.allSettled(
      targets.map((t) =>
        writes.followSupplier({ restaurantId: r.id, supplierId: t.branchIds[0], source: 'manual' })
      )
    )
    const ok = results.filter((x) => x.status === 'fulfilled')
    const capped = results.filter(
      (x) => x.status === 'rejected' && x.reason instanceof writes.SupplierFollowLimitError
    )
    expect(ok).toHaveLength(1)
    expect(capped).toHaveLength(9)
    const { rows } = await db.pool.query(
      'SELECT count(*)::int AS n FROM supplier_follow WHERE restaurant_id = $1',
      [r.id]
    )
    expect(rows[0].n).toBe(limit)
  })

  it('follow and block race leaves no follow row', async () => {
    const r = await createRestaurant(db.pool)
    for (let i = 0; i < 15; i++) {
      const org = await createSupplierOrg(db.pool, { branches: 2 })
      const [a, b] = org.branchIds
      await Promise.allSettled([
        writes.followSupplier({ restaurantId: r.id, supplierId: a, source: 'manual' }),
        writes.blockSupplier({ restaurantId: r.id, supplierId: b }),
      ])
      const { rows } = await db.pool.query(
        `SELECT (SELECT count(*)::int FROM supplier_follow WHERE restaurant_id = $1 AND supplier_org_id = $2) AS f,
                (SELECT count(*)::int FROM supplier_blocklist WHERE restaurant_id = $1 AND supplier_org_id = $2) AS b`,
        [r.id, org.orgId]
      )
      expect(rows[0]).toEqual({ f: 0, b: 1 })
    }
  })

  it('HTTP follow is idempotent, blocked follow is 409 SUPPLIER_BLOCKED, unblock restores following', async () => {
    const r = await createRestaurant(db.pool)
    const org = await createSupplierOrg(db.pool, { branches: 2 })
    const h = { 'x-test-user': r.userSub, 'content-type': 'application/json' }
    const base = `${api.baseUrl}/api/suppliers`
    expect(
      (await fetch(`${base}/${org.branchIds[0]}/follow`, { method: 'POST', headers: h })).status
    ).toBe(200)
    const again = await fetch(`${base}/${org.branchIds[1]}/follow`, { method: 'POST', headers: h })
    expect(again.status).toBe(200)
    const { rows } = await db.pool.query(
      'SELECT supplier_org_id FROM supplier_follow WHERE restaurant_id = $1',
      [r.id]
    )
    expect(rows).toEqual([{ supplier_org_id: org.orgId }])

    expect(
      (await fetch(`${base}/${org.branchIds[1]}/block`, { method: 'POST', headers: h, body: '{}' }))
        .status
    ).toBe(200)
    const blocked = await fetch(`${base}/${org.branchIds[0]}/follow`, {
      method: 'POST',
      headers: h,
    })
    expect(blocked.status).toBe(409)
    expect((await blocked.json()).error.name).toBe('SUPPLIER_BLOCKED')
    expect(
      (await fetch(`${base}/${org.branchIds[0]}/block`, { method: 'DELETE', headers: h })).status
    ).toBe(200)
    expect(
      (await fetch(`${base}/${org.branchIds[0]}/follow`, { method: 'POST', headers: h })).status
    ).toBe(200)
  })
})
