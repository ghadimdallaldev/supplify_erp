import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it, vi } from 'vitest'
import express from '../../apps/api/node_modules/express/index.js'
import request from '../../apps/api/node_modules/supertest/index.js'

vi.mock('../../apps/api/src/config/env.js', () => ({
  config: { NODE_ENV: 'test', APP_ENV: 'dev', CRONS_ENABLED: false, EMAIL_ENABLED: false },
}))
vi.mock('../../apps/api/src/lib/cache.js', () => ({
  getCache: async () => null,
  setCache: async () => {},
  deleteCache: async () => {},
}))
vi.mock('../../apps/api/src/services/notification.service.js', async (original) => ({
  ...(await original()),
  notifyQuoteRequestReceived: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../apps/api/src/lib/db.js', async () => {
  const { createRequire } = await import('node:module')
  const require = createRequire(new URL('../../apps/api/package.json', import.meta.url))
  const { Pool } = require('pg')
  const url = new URL(process.env.SUPPLIFY_AUDIT_DATABASE_URL || 'invalid:')
  if (url.hostname !== '127.0.0.1' || url.pathname !== '/rbac_audit')
    throw new Error('Refusing a non-isolated audit database')
  const pool = new Pool({ connectionString: url.href, max: 8 })
  const withTransaction = async (fn) => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await fn(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
  return { pool, query: (sql, params) => pool.query(sql, params), withTransaction }
})

import { pool, withTransaction } from '../../apps/api/src/lib/db.js'
import { createRestaurantOrdersInTransaction } from '../../apps/api/src/services/restaurant-order-create.service.js'
import { releaseStockForOrder } from '../../apps/api/src/services/supplier-order-stock.service.js'
import {
  claimOrderPlacementKey,
  completeOrderPlacementKey,
  hashOrderPlacementPayload,
  lookupOrderPlacementKey,
} from '../../apps/api/src/services/order-placement-idempotency.service.js'
import { RESTAURANT_PRODUCT_SUPPLIER_ACCESS_SQL } from '../../apps/api/src/lib/product-supplier-access.js'
import { getWasteIntelligence } from '../../apps/api/src/services/restaurant-waste-intelligence.service.js'
import { getWeeklyIntelligenceSummary } from '../../apps/api/src/services/restaurant-weekly-intelligence-summary.service.js'
import { createExpiryLot } from '../../apps/api/src/services/inventory-expiry.service.js'
import { getReorderAssistance } from '../../apps/api/src/services/restaurant-reorder-assistance.service.js'
import orderListRouter from '../../apps/api/src/routes/orders/list.js'
import {
  createRecipe,
  getRecipeById,
  updateRecipe,
} from '../../apps/api/src/services/recipe.service.js'
import {
  createQuoteRequest,
  getQuoteRequestDetail,
} from '../../apps/api/src/services/quote-requests.service.js'

afterAll(() => pool.end())

async function fixture(stock = 10) {
  const ids = Object.fromEntries(
    ['restaurant', 'otherRestaurant', 'supplier', 'otherSupplier', 'product', 'otherProduct'].map(
      (key) => [key, randomUUID()]
    )
  )
  for (const id of [ids.restaurant, ids.otherRestaurant])
    await pool.query('INSERT INTO restaurant(id,name,slug) VALUES($1::uuid,$1::text,$1::text)', [
      id,
    ])
  for (const id of [ids.supplier, ids.otherSupplier])
    await pool.query('INSERT INTO supplier(id,name,slug) VALUES($1::uuid,$1::text,$1::text)', [id])
  for (const [id, supplier] of [
    [ids.product, ids.supplier],
    [ids.otherProduct, ids.otherSupplier],
  ]) {
    await pool.query(
      'INSERT INTO product(id,supplier_id,sku,name) VALUES($1::uuid,$2,$1::text,$1::text)',
      [id, supplier]
    )
    await pool.query(
      'INSERT INTO inventory(product_id,available_qty,reserved_qty) VALUES($1,$2,0) ON CONFLICT(product_id) DO UPDATE SET available_qty=EXCLUDED.available_qty,reserved_qty=0',
      [id, stock]
    )
  }
  return ids
}

function groupsFor(ids, quantity = 2, includeOther = false) {
  const line = (product, currency = 'USD') => ({
    productId: product,
    quantity,
    unitPrice: 3.25,
    currency,
    product: { id: product, sku: product },
    pricingSource: 'DEFAULT_PRICE',
  })
  return new Map([
    [ids.supplier, [line(ids.product)]],
    ...(includeOther ? [[ids.otherSupplier, [line(ids.otherProduct, 'EUR')]]] : []),
  ])
}

async function place(
  ids,
  { groups = groupsFor(ids), status = 'PLACED', key = null, restaurantId = ids.restaurant } = {}
) {
  const requestHash = hashOrderPlacementPayload({
    items: [...groups.values()].flat().map(({ productId, quantity }) => ({ productId, quantity })),
  })
  return withTransaction(async (client) => {
    const claim = await claimOrderPlacementKey(client, { restaurantId, key, requestHash })
    if (claim.replay) return claim.replay
    const result = await createRestaurantOrdersInTransaction({
      client,
      restaurantId,
      orderStatus: status,
      supplierGroups: groups,
      supplierProfiles: new Map([...groups.keys()].map((id) => [id, { id }])),
      supplierPromoEligibility: new Map(),
      supplierMultiWarehouse: new Map(),
      dailyMeterEnforcement: { resolved: { isUnlimited: true } },
      orderData: {},
      promotionHandlers: null,
    })
    await completeOrderPlacementKey(client, claim, result)
    return result
  })
}

async function stock(product) {
  const { rows } = await pool.query(
    'SELECT available_qty::float8 AS available,reserved_qty::float8 AS reserved FROM inventory WHERE product_id=$1',
    [product]
  )
  return rows[0]
}
async function ordersFor(restaurant) {
  const { rows } = await pool.query(
    'SELECT id,total_amount::float8 AS total,status,currency FROM customer_order WHERE restaurant_id=$1',
    [restaurant]
  )
  return rows
}

describe('restaurant purchasing transactions in disposable PostgreSQL', () => {
  it('splits suppliers, retains each currency, persists totals, and reserves each product once', async () => {
    const ids = await fixture()
    const result = await place(ids, { groups: groupsFor(ids, 2, true) })
    expect(result.orders).toHaveLength(2)
    expect(
      (await ordersFor(ids.restaurant)).map((order) => [order.currency, order.total]).sort()
    ).toEqual([
      ['EUR', 6.5],
      ['USD', 6.5],
    ])
    expect(await stock(ids.product)).toEqual({ available: 8, reserved: 2 })
    expect(await stock(ids.otherProduct)).toEqual({ available: 8, reserved: 2 })
  })

  it('rolls back every supplier order and stock change when one supplier cannot fulfill', async () => {
    const ids = await fixture()
    await pool.query('UPDATE inventory SET available_qty=1 WHERE product_id=$1', [ids.otherProduct])
    await expect(place(ids, { groups: groupsFor(ids, 2, true) })).rejects.toThrow(/Insufficient/i)
    expect(await ordersFor(ids.restaurant)).toEqual([])
    expect(await stock(ids.product)).toEqual({ available: 10, reserved: 0 })
    expect(await stock(ids.otherProduct)).toEqual({ available: 1, reserved: 0 })
  })

  it('serializes competing purchases so available stock cannot be oversold', async () => {
    const ids = await fixture(5)
    const result = await Promise.allSettled([
      place(ids, { groups: groupsFor(ids, 4) }),
      place(ids, { groups: groupsFor(ids, 4) }),
    ])
    expect(result.filter((row) => row.status === 'fulfilled')).toHaveLength(1)
    expect(await ordersFor(ids.restaurant)).toHaveLength(1)
    expect(await stock(ids.product)).toEqual({ available: 1, reserved: 4 })
  })

  it('replays concurrent retries without duplicating orders or stock reservations', async () => {
    const ids = await fixture()
    const key = randomUUID()
    const result = await Promise.all([place(ids, { key }), place(ids, { key })])
    expect(result[0].orders[0].id).toBe(result[1].orders[0].id)
    expect(await ordersFor(ids.restaurant)).toHaveLength(1)
    expect(await stock(ids.product)).toEqual({ available: 8, reserved: 2 })
  })

  it('rejects reuse of a successful placement key for a different basket', async () => {
    const ids = await fixture()
    const key = randomUUID()
    await place(ids, { key })
    await expect(place(ids, { key, groups: groupsFor(ids, 3) })).rejects.toMatchObject({
      code: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
    })
    expect(await ordersFor(ids.restaurant)).toHaveLength(1)
    expect(await stock(ids.product)).toEqual({ available: 8, reserved: 2 })
  })

  it('rolls back a failed placement claim so the same request can retry after replenishment', async () => {
    const ids = await fixture(1)
    const key = randomUUID()
    await expect(place(ids, { key })).rejects.toThrow(/Insufficient/i)
    expect(
      (
        await pool.query('SELECT id FROM order_placement_idempotency WHERE restaurant_id=$1', [
          ids.restaurant,
        ])
      ).rows
    ).toEqual([])
    await pool.query('UPDATE inventory SET available_qty=5 WHERE product_id=$1', [ids.product])
    await place(ids, { key })
    expect(await ordersFor(ids.restaurant)).toHaveLength(1)
  })

  it('isolates placement replay keys between restaurants', async () => {
    const ids = await fixture()
    const key = randomUUID()
    await place(ids, { key })
    const requestHash = hashOrderPlacementPayload({
      items: [{ productId: ids.product, quantity: 2 }],
    })
    expect(
      await lookupOrderPlacementKey((...args) => pool.query(...args), {
        restaurantId: ids.otherRestaurant,
        key,
        requestHash,
      })
    ).toBeNull()
    await place(ids, { key, restaurantId: ids.otherRestaurant })
    expect(await ordersFor(ids.restaurant)).toHaveLength(1)
    expect(await ordersFor(ids.otherRestaurant)).toHaveLength(1)
  })

  it('saves draft orders without deducting or reserving stock', async () => {
    const ids = await fixture()
    await place(ids, { status: 'DRAFT' })
    expect(await stock(ids.product)).toEqual({ available: 10, reserved: 0 })
    expect(await ordersFor(ids.restaurant)).toEqual([
      expect.objectContaining({ status: 'DRAFT', total: 6.5 }),
    ])
  })

  it('rejects mixed currencies inside a supplier order atomically', async () => {
    const ids = await fixture()
    const groups = groupsFor(ids)
    groups.get(ids.supplier).push({ ...groups.get(ids.supplier)[0], currency: 'EUR' })
    await expect(place(ids, { groups })).rejects.toThrow(/Mixed currencies/)
    expect(await ordersFor(ids.restaurant)).toEqual([])
    expect(await stock(ids.product)).toEqual({ available: 10, reserved: 0 })
  })

  it('restores placed legacy stock and clears reservations on cancellation', async () => {
    const ids = await fixture()
    const result = await place(ids)
    await withTransaction(async (client) => {
      await client.query("UPDATE customer_order SET status='CANCELLED' WHERE id=$1", [
        result.orders[0].id,
      ])
      await releaseStockForOrder(client, result.orders[0].id)
    })
    expect(await stock(ids.product)).toEqual({ available: 10, reserved: 0 })
  })

  it('allows followed catalog access and denies an unrelated restaurant', async () => {
    const ids = await fixture()
    await pool.query('INSERT INTO supplier_follow(supplier_id,restaurant_id) VALUES($1,$2)', [
      ids.supplier,
      ids.restaurant,
    ])
    expect(
      (await pool.query(RESTAURANT_PRODUCT_SUPPLIER_ACCESS_SQL, [ids.supplier, ids.restaurant]))
        .rowCount
    ).toBe(1)
    expect(
      (
        await pool.query(RESTAURANT_PRODUCT_SUPPLIER_ACCESS_SQL, [
          ids.supplier,
          ids.otherRestaurant,
        ])
      ).rowCount
    ).toBe(0)
  })

  it('executes the real waste intelligence query for a restaurant with no recorded waste', async () => {
    const ids = await fixture()
    const result = await getWasteIntelligence(ids.restaurant)
    expect(result.summary.current.incidents).toBe(0)
    expect(result.hotspots).toEqual([])
  })

  it('keeps waste costs and evidence windows scoped to the requested restaurant', async () => {
    const ids = await fixture()
    await pool.query(
      `INSERT INTO inventory_adjustment(restaurant_id,product_id,adjustment_type,quantity,unit_cost,total_cost,reason,created_at)
      VALUES($1,$3,'WASTAGE',2,3,6,'isolated fixture',NOW()),
            ($1,$3,'WASTAGE',4,3,12,'isolated fixture',NOW()),
            ($1,$3,'WASTAGE',2,3,6,'isolated fixture',NOW()-INTERVAL '10 days'),
            ($2,$3,'WASTAGE',200,3,600,'other tenant fixture',NOW())`,
      [ids.restaurant, ids.otherRestaurant, ids.product]
    )
    const result = await getWasteIntelligence(ids.restaurant, { days: 7 })
    expect(result.summary.current.incidents).toBe(2)
    expect(result.summary.current.wasteCost).toBe(18)
    expect(result.summary.previous.wasteCost).toBe(6)
    expect(result.hotspots[0]).toMatchObject({ productId: ids.product, currentWasteCost: 18 })
  })

  it('accepts supplier and restaurant adjustment types and still rejects unknown values', async () => {
    const ids = await fixture()
    for (const type of ['IN', 'OUT', 'WASTAGE', 'SPOILAGE', 'COUNT_CORRECTION', 'OTHER']) {
      await expect(
        pool.query(
          'INSERT INTO inventory_adjustment(product_id,restaurant_id,adjustment_type,quantity,reason) VALUES($1,$2,$3,1,$3)',
          [ids.product, ids.restaurant, type]
        )
      ).resolves.toMatchObject({ rowCount: 1 })
    }
    await expect(
      pool.query(
        "INSERT INTO inventory_adjustment(product_id,adjustment_type,quantity,reason) VALUES($1,'UNSUPPORTED',1,'invalid fixture')",
        [ids.product]
      )
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('executes every weekly intelligence source against PostgreSQL without fabricating review signals', async () => {
    const ids = await fixture()
    const result = await getWeeklyIntelligenceSummary(ids.restaurant)
    expect(result.summary).toEqual({
      wasteHotspots: 0,
      supplierExceptions: 0,
      overOrderedProducts: 0,
      invoicesWithAnomalies: 0,
      stockoutRisks: 0,
    })
  })

  it('carries the actual expiry lot item name into reorder suggestions', async () => {
    const ids = await fixture()
    const lot = await createExpiryLot(ids.restaurant, {
      itemName: 'Expiry name regression fixture',
      productId: ids.product,
      supplierId: ids.supplier,
      quantity: 2,
      unit: 'unit',
      expiryDate: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
    })
    const result = await getReorderAssistance(ids.restaurant)
    expect(result.suggestions.find((item) => item.id === `expiry-${lot.id}`)).toMatchObject({
      productName: 'Expiry name regression fixture',
      action: 'manual_review',
    })
  })

  it('lists the purchased supplier and currency while retaining restaurant isolation', async () => {
    const ids = await fixture()
    const own = await place(ids, { status: 'DRAFT' })
    await place(ids, { status: 'DRAFT', restaurantId: ids.otherRestaurant })
    const app = express()
    app.use((req, _res, next) => {
      req.userData = { role: 'RESTAURANT' }
      req._requestTenantResolved = true
      req._requestTenantCache = { tenantType: 'RESTAURANT', tenantId: ids.restaurant }
      next()
    })
    app.use('/api/orders', orderListRouter)
    const response = await request(app).get('/api/orders?includeItems=false').expect(200)
    expect(response.body.data.orders).toHaveLength(1)
    expect(response.body.data.orders[0]).toMatchObject({
      id: own.orders[0].id,
      supplier_name: ids.supplier,
      currency: 'USD',
    })
    expect(response.body.data.pagination.total).toBe(1)
  })

  it('keeps page boundaries deterministic when orders share a creation timestamp', async () => {
    const ids = await fixture()
    await place(ids, { status: 'DRAFT' })
    await place(ids, { status: 'DRAFT' })
    await pool.query(
      "UPDATE customer_order SET created_at='2026-11-16T10:00:00Z' WHERE restaurant_id=$1",
      [ids.restaurant]
    )
    const app = express()
    app.use((req, _res, next) => {
      req.userData = { role: 'RESTAURANT' }
      req._requestTenantResolved = true
      req._requestTenantCache = { tenantType: 'RESTAURANT', tenantId: ids.restaurant }
      next()
    })
    app.use('/api/orders', orderListRouter)
    const first = await request(app)
      .get('/api/orders?includeItems=false&limit=1&offset=0')
      .expect(200)
    const second = await request(app)
      .get('/api/orders?includeItems=false&limit=1&offset=1')
      .expect(200)
    const expected = (
      await pool.query('SELECT id FROM customer_order WHERE restaurant_id=$1 ORDER BY id DESC', [
        ids.restaurant,
      ])
    ).rows.map((row) => row.id)
    expect([first.body.data.orders[0].id, second.body.data.orders[0].id]).toEqual(expected)
  })

  it('creates and recalculates recipe costs without exposing another restaurant recipe', async () => {
    const ids = await fixture()
    const recipe = await createRecipe(ids.restaurant, {
      name: 'Isolated recipe costing fixture',
      sellingPrice: 10,
      currency: 'USD',
      portionCount: 2,
      ingredients: [
        {
          ingredientType: 'MANUAL',
          displayName: 'Manual ingredient',
          quantity: 4,
          recipeUnit: 'g',
          purchaseUnit: 'g',
          costSource: 'MANUAL',
          manualUnitPrice: 0.5,
        },
      ],
    })
    expect(recipe.costPerPortion).toBe(1)
    expect(recipe.foodCostPct).toBe(10)
    await expect(getRecipeById(ids.otherRestaurant, recipe.id)).rejects.toThrow('Recipe not found')
    const updated = await updateRecipe(ids.restaurant, recipe.id, {
      name: recipe.name,
      portionCount: 1,
    })
    expect(updated.costPerPortion).toBe(2)
  })

  it('creates a quote request with actual product rows and denies another restaurant its detail', async () => {
    const ids = await fixture()
    const result = await createQuoteRequest({
      restaurantId: ids.restaurant,
      items: [{ productId: ids.product, quantity: 2 }],
      supplierIds: [ids.supplier],
      note: 'Isolated quote fixture',
    })
    expect(result.itemCount).toBe(1)
    expect(result.supplierCount).toBe(1)
    const detail = await getQuoteRequestDetail(result.quoteRequest.id, ids.restaurant)
    expect(detail.items).toHaveLength(1)
    await expect(
      getQuoteRequestDetail(result.quoteRequest.id, ids.otherRestaurant)
    ).rejects.toThrow()
  })
})
