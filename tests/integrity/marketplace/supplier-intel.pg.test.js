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

beforeAll(async () => {
  db = await startMarketplaceDb()
  api = await startApiForTest()
}, 180_000)
afterAll(async () => {
  await api?.close()
})
beforeEach(async () => {
  await resetMarketplaceDb(db.pool)
})

const svc = (p) => import(`../../../apps/api/src/services/${p}`)

/** Two orders 60 and 40 days ago with two products: a "due" customer with pair evidence. */
async function regularCustomer(supplierId, restaurantId, products) {
  for (const daysAgo of [60, 40]) {
    const order = await createOrder(db.pool, {
      restaurantId,
      supplierId,
      status: 'DELIVERED',
      productId: products[0].id,
    })
    await db.pool.query(
      `INSERT INTO order_item (order_id, product_id, supplier_id, quantity, unit_price, line_total)
       VALUES ($1, $2, $3, 1, 10, 10)`,
      [order.id, products[1].id, supplierId]
    )
    await db.pool.query(
      `UPDATE customer_order SET placed_at = now() - ($2::int * interval '1 day'),
                                 created_at = now() - ($2::int * interval '1 day')
       WHERE id = $1`,
      [order.id, daysAgo]
    )
  }
}

async function world() {
  const org = await createSupplierOrg(db.pool)
  const supplierId = org.branchIds[0]
  const products = [
    await createProduct(db.pool, supplierId),
    await createProduct(db.pool, supplierId),
    await createProduct(db.pool, supplierId),
  ]
  const follower = await createRestaurant(db.pool, { name: 'Follower Bistro' })
  const lapsed = await createRestaurant(db.pool, { name: 'Lapsed Diner' })
  const blocker = await createRestaurant(db.pool, { name: 'Blocking Cafe' })
  await follow(db.pool, follower.id, org.orgId)
  await follow(db.pool, blocker.id, org.orgId)
  await block(db.pool, blocker.id, org.orgId)
  for (const r of [follower, lapsed, blocker]) await regularCustomer(supplierId, r.id, products)
  // The follower never bought product 3 with product 1, but others did: cross-sell evidence.
  for (const r of [lapsed, blocker]) {
    await createOrder(db.pool, {
      restaurantId: r.id,
      supplierId,
      status: 'DELIVERED',
      productId: products[2].id,
    })
  }
  return { org, supplierId, products, follower, lapsed, blocker }
}

describe('supplier intelligence respects the follow rule (real PG)', () => {
  it('at-risk, cross-sell, cadence and loyalty exclude non-followers', async () => {
    const { supplierId, follower, lapsed, blocker, products } = await world()
    const { getReorderIntelligence } = await svc('supplier-reorder-intelligence.service.js')
    const intel = await getReorderIntelligence(supplierId)
    const atRisk = intel.customersAtRisk.map((c) => c.restaurantId)
    expect(atRisk).toContain(follower.id)
    expect(atRisk).not.toContain(lapsed.id)
    expect(atRisk).not.toContain(blocker.id)

    const { listSupplierCrossSellOpportunities } = await svc(
      'supplier-cross-sell-intelligence.service.js'
    )
    const cross = await listSupplierCrossSellOpportunities(supplierId)
    const crossIds = new Set(cross.opportunities.map((o) => o.restaurantId))
    expect([...crossIds].every((id) => id === follower.id)).toBe(true)

    const today = (await db.pool.query(`SELECT EXTRACT(DOW FROM now())::int AS d`)).rows[0].d
    for (const r of [follower, lapsed, blocker]) {
      await db.pool.query(
        `INSERT INTO restaurant_order_cadence (restaurant_id, supplier_id, product_id, cadence_level, day_of_week, label)
         VALUES ($1, $2, $3, 'product', $4, 'Tomatoes')`,
        [r.id, supplierId, products[0].id, today]
      )
    }
    const { listSupplierAtRisk } = await svc('reorder-cadence.service.js')
    const cadence = (await listSupplierAtRisk(supplierId)).map((c) => c.restaurantId)
    expect(cadence).toContain(follower.id)
    expect(cadence).not.toContain(lapsed.id)
    expect(cadence).not.toContain(blocker.id)

    for (const r of [follower, lapsed, blocker]) {
      await db.pool.query(
        `INSERT INTO restaurant_loyalty_balance (supplier_id, restaurant_id, points_balance) VALUES ($1, $2, 50)`,
        [supplierId, r.id]
      )
    }
    const { listSupplierLoyaltyBalances } = await svc('loyalty.service.js')
    const balances = (await listSupplierLoyaltyBalances(supplierId)).map((b) => b.restaurant_id)
    expect(balances).toEqual([follower.id])
  })

  it('reminder draft and open-chat require follow', async () => {
    const { supplierId, follower, lapsed, org } = await world()
    const { createSupplierFollowUpDraft } = await svc('supplier-reorder-assistance.service.js')
    const userId = org.users[0].userId
    expect(
      await createSupplierFollowUpDraft(supplierId, lapsed.id, userId, { openChat: true })
    ).toBeNull()
    const { rows: none } = await db.pool.query(
      'SELECT count(*)::int AS c FROM conversation WHERE restaurant_id = $1',
      [lapsed.id]
    )
    expect(none[0].c).toBe(0)

    const draft = await createSupplierFollowUpDraft(supplierId, follower.id, userId)
    expect(draft).not.toBeNull()
    // The follower unfollows before the draft is sent: sending is refused.
    await db.pool.query('DELETE FROM supplier_follow WHERE restaurant_id = $1', [follower.id])
    const { sendReorderReminderDraft } = await svc('supplier-reorder-intelligence.service.js')
    expect(await sendReorderReminderDraft(supplierId, draft.id, userId)).toBeNull()
  })

  it('top restaurants groups non-followers as Other customers', async () => {
    const { supplierId, follower, lapsed, blocker } = await world()
    const { supplierTopRestaurants } = await svc('reports.service.js')
    const res = await supplierTopRestaurants(supplierId, {
      from: new Date(Date.now() - 365 * 86400000),
      to: new Date(Date.now() + 86400000),
    })
    const named = res.data.filter((row) => row.restaurant_id)
    expect(named.map((row) => row.restaurant_id)).toEqual([follower.id])
    const other = res.data.filter((row) => !row.restaurant_id)
    expect(other).toHaveLength(1)
    expect(other[0].restaurant_name).toBe('Other customers')
    expect(JSON.stringify(res.data)).not.toContain(lapsed.name)
    expect(JSON.stringify(res.data)).not.toContain(blocker.name)
  })

  it('assistant reorder suggestions never include blocked suppliers and label non-followed ones', async () => {
    const r = await createRestaurant(db.pool)
    const followed = await createSupplierOrg(db.pool, { name: 'Followed Foods' })
    const stranger = await createSupplierOrg(db.pool, { name: 'Stranger Foods' })
    const blocked = await createSupplierOrg(db.pool, { name: 'Blocked Foods' })
    await follow(db.pool, r.id, followed.orgId)
    await block(db.pool, r.id, blocked.orgId)
    const ids = {}
    for (const [key, org] of Object.entries({ followed, stranger, blocked })) {
      const p = await createProduct(db.pool, org.branchIds[0])
      ids[key] = org.branchIds[0]
      await db.pool.query(
        `INSERT INTO restaurant_inventory (restaurant_id, product_id, quantity, low_stock_threshold)
         VALUES ($1, $2, 0, 5)`,
        [r.id, p.id]
      )
    }
    const { getReorderAssistance } = await svc('restaurant-reorder-assistance.service.js')
    const { suggestions } = await getReorderAssistance(r.id)
    const bySupplier = new Map(suggestions.map((s) => [s.supplierId, s]))
    expect(bySupplier.has(ids.blocked)).toBe(false)
    expect(bySupplier.get(ids.followed)).toMatchObject({ isFollowed: true, canOrder: true })
    expect(bySupplier.get(ids.stranger)).toMatchObject({ isFollowed: false, canOrder: false })

    // get_followed_suppliers lists followed organisations only (never the blocked one).
    const { executeAssistantTool } = await import(
      '../../../apps/api/src/services/assistant-tools/index.js'
    )
    const out = await executeAssistantTool(
      { tenantId: r.id, tenantType: 'RESTAURANT', permissions: ['CATALOG_VIEW'] },
      'get_followed_suppliers',
      {}
    )
    const result = out.result || out.data || out
    expect(result.suppliers.map((x) => x.supplierId)).toEqual([followed.orgId])
  })

  it('packing slip after unfollow shows order snapshot, not live profile', async () => {
    const org = await createSupplierOrg(db.pool)
    const supplierId = org.branchIds[0]
    const p = await createProduct(db.pool, supplierId)
    const r = await createRestaurant(db.pool)
    await follow(db.pool, r.id, org.orgId)
    await db.pool.query(`UPDATE restaurant SET address_json = $2 WHERE id = $1`, [
      r.id,
      { street: '1 Order Street', city: 'Beirut' },
    ])
    const placed = await fetch(`${api.baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'x-test-user': r.userSub, 'content-type': 'application/json' },
      body: JSON.stringify({ items: [{ productId: p.id, quantity: 1 }] }),
    })
    const body = await placed.json()
    expect(placed.status, JSON.stringify(body)).toBe(201)
    const orderId = body.data.order?.id || body.data.orders?.[0]?.id || body.data.id
    await db.pool.query('DELETE FROM supplier_follow WHERE restaurant_id = $1', [r.id])
    await db.pool.query(`UPDATE restaurant SET address_json = $2 WHERE id = $1`, [
      r.id,
      { street: '99 Moved Avenue', city: 'Tripoli' },
    ])
    const slip = await fetch(`${api.baseUrl}/api/orders/${orderId}/packing-slip`, {
      headers: { 'x-test-user': org.users[0].userSub },
    })
    const slipBody = await slip.json()
    expect(slip.status, JSON.stringify(slipBody)).toBe(200)
    const text = JSON.stringify(slipBody)
    expect(text).toContain('1 Order Street')
    expect(text).not.toContain('99 Moved Avenue')
  })
  it('accounting CSV exports stay order-scoped: own invoices only, kept after unfollow', async () => {
    const mine = await createSupplierOrg(db.pool)
    const other = await createSupplierOrg(db.pool)
    const r = await createRestaurant(db.pool)
    const insert = (supplierId, number) =>
      db.pool.query(
        `INSERT INTO invoice (invoice_number, supplier_id, restaurant_id, invoice_date, due_date, status, total_amount, balance_due)
         VALUES ($1, $2, $3, current_date, current_date + 30, 'ISSUED', 10, 10)`,
        [number, supplierId, r.id]
      )
    await insert(mine.branchIds[0], 'INV-MINE-1')
    await insert(other.branchIds[0], 'INV-OTHER-1')
    // No follow at all: financial records stay readable to the supplier (spec §6.4).
    const { exportInvoicesCsv } = await svc('supplier-accounting-export.service.js')
    const from = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    const to = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    const csv = await exportInvoicesCsv(mine.branchIds[0], { from, to })
    expect(csv).toContain('INV-MINE-1')
    expect(csv).not.toContain('INV-OTHER-1')
  })
})
