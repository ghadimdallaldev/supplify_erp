import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import express from '../../apps/api/node_modules/express/index.js'
import request from '../../apps/api/node_modules/supertest/index.js'

const hooks = vi.hoisted(() => ({
  beforeTransaction: null,
  beforeCommit: null,
  afterQuoteLock: null,
  singleConnection: false,
  poolQueryFailures: [],
  featureOverrideReads: 0,
  query: null,
}))
vi.mock('../../apps/api/src/config/env.js', () => ({
  config: {
    NODE_ENV: 'test',
    APP_ENV: 'dev',
    DEFAULT_TENANT_TIMEZONE: 'Asia/Beirut',
    CRONS_ENABLED: false,
    EMAIL_ENABLED: false,
  },
}))
vi.mock('../../apps/api/src/lib/cache.js', () => ({
  getCache: vi.fn(),
  setCache: vi.fn(),
  deleteCache: vi.fn(),
  deleteCacheByPrefix: vi.fn(async () => {}),
}))
vi.mock('../../apps/api/src/lib/audit.js', () => ({ writeAuditLog: vi.fn(async () => {}) }))
vi.mock('../../apps/api/src/lib/orders-calendar-cache.js', () => ({
  collectOrdersCalendarTenantIdsFromOrder: () => [],
  scheduleOrdersCalendarCacheInvalidation: vi.fn(),
}))
vi.mock('../../apps/api/src/services/dashboard-summary.service.js', () => ({
  invalidateDashboardSummaryCache: vi.fn(async () => {}),
}))
vi.mock('../../apps/api/src/services/notification.service.js', () => ({
  notifyOrderStatusChange: vi.fn(async () => ({})),
  notifyQuoteRequestReceived: vi.fn(async () => {}),
  notifyQuoteResponseReceived: vi.fn(async () => {}),
  notifyQuoteRequestDeclined: vi.fn(async () => {}),
}))
vi.mock('../../apps/api/src/routes/order-amendments.routes.js', () => ({
  orderAmendmentsRouter: {},
}))
vi.mock('../../apps/api/src/routes/orders-driver.routes.js', () => ({ ordersDriverRoutes: {} }))
vi.mock('../../apps/api/src/lib/driver-delivery.js', () => ({
  updateDriverDeliveryStatus: vi.fn(),
  getSupplierIdForOrder: vi.fn(),
  orderHasProofOfDelivery: vi.fn(),
}))
vi.mock('../../apps/api/src/services/delivery-routes.service.js', () => ({
  releaseOrderFromPlannedRoutes: vi.fn(),
}))
vi.mock('../../apps/api/src/services/promotions.service.js', () => ({
  applyBestPromotionToOrder: vi.fn(async () => null),
  hasActiveSupplierOrderPromotions: vi.fn(async () => false),
  hasActiveSupplierOrderPromotionsBatch: vi.fn(async () => new Map()),
}))
vi.mock('../../apps/api/src/services/deal-promotions.service.js', () => ({
  applyPromotionByIdToOrder: vi.fn(),
  validateCouponForOrder: vi.fn(),
}))
vi.mock('../../apps/api/src/services/loyalty.service.js', () => ({
  redeemLoyaltyAtCheckout: vi.fn(),
}))
vi.mock('../../apps/api/src/lib/request-subscription.js', () => ({
  resolveRequestSubscription: vi.fn(async () => ({ plan_name: 'audit', features: {} })),
}))
vi.mock('../../apps/api/src/lib/org-billing-tenant.js', () => ({
  resolveOrgBillingTenantId: async (id) => id,
}))
vi.mock('../../apps/api/src/lib/feature-flags.js', () => ({
  resolveFeatureEnabled: vi.fn(async () => ({ enabled: false })),
}))
vi.mock('../../apps/api/src/lib/subscription.js', async (original) => ({
  ...(await original()),
  resolveDailyMeterEnforcementFromSubscription: vi.fn(async () => ({
    subscription: { plan_name: 'audit' },
    resolved: { isUnlimited: true },
  })),
  resolveEffectivePlanFeatures: vi.fn(async () => ({})),
  getTenantSubscription: vi.fn(async () => ({ plan_name: 'audit', features: {} })),
  isFeatureEnabled: vi.fn(async (tenantId, tenantType, featureKey, options = {}) => {
    // A cold feature lookup uses the global pool, even during order creation.
    const { rows } = await (options.dbQuery || hooks.query)(
      `SELECT is_enabled FROM feature_flag_override
       WHERE tenant_id = $1 AND tenant_type = $2 AND feature_key = $3`,
      [tenantId, tenantType, featureKey]
    )
    return rows[0]?.is_enabled === true
  }),
}))
vi.mock('../../apps/api/src/lib/rbac.js', async (original) => ({
  ...(await original()),
  getRestaurantIdForRequest: async (req) => req.auditIdentity.restaurant,
  getSupplierIdForRequest: async (req) => req.auditIdentity.supplier,
}))
vi.mock('../../apps/api/src/lib/db.js', async () => {
  const { createRequire } = await import('node:module')
  const require = createRequire(new URL('../../apps/api/package.json', import.meta.url))
  const { Pool } = require('pg')
  const target = new URL(process.env.SUPPLIFY_AUDIT_DATABASE_URL || 'invalid:')
  if (target.hostname !== '127.0.0.1' || target.pathname !== '/rbac_audit')
    throw new Error('Refusing non-isolated checkout target')
  const pool = new Pool({ connectionString: target.href, max: 8 })
  const singlePool = new Pool({
    connectionString: target.href,
    max: 1,
    connectionTimeoutMillis: 500,
  })
  const selected = () => (hooks.singleConnection ? singlePool : pool)
  const query = async (sql, params) => {
    try {
      const result = await selected().query(sql, params)
      if (/FROM feature_flag_override/.test(sql)) hooks.featureOverrideReads += 1
      return result
    } catch (error) {
      hooks.poolQueryFailures.push(error.message)
      throw error
    }
  }
  hooks.query = query
  const withTransaction = async (callback) => {
    const hook = hooks.beforeTransaction
    hooks.beforeTransaction = null
    if (hook) await hook()
    const raw = await selected().connect()
    const client = {
      query: async (sql, params) => {
        const result = await raw.query(sql, params)
        if (hooks.afterQuoteLock && /ORDER BY qr\.id FOR SHARE OF qr/.test(sql))
          await hooks.afterQuoteLock(raw.processID)
        return result
      },
    }
    try {
      await client.query('BEGIN')
      await client.query("SET LOCAL statement_timeout='4000ms'")
      const result = await callback(client)
      if (hooks.beforeCommit) await hooks.beforeCommit()
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      raw.release()
    }
  }
  return {
    pool,
    singlePool,
    query,
    withTransaction,
    migrationQuery: query,
    withSavepoint: async (client, _name, callback) => callback(client),
  }
})

import { pool, singlePool } from '../../apps/api/src/lib/db.js'
import createRouter from '../../apps/api/src/routes/orders/create.js'
import {
  createQuoteRequest,
  submitQuoteResponse,
} from '../../apps/api/src/services/quote-requests.service.js'
import { resolveSupplierDeliveryDate } from '../../apps/api/src/lib/supplier-last-order.js'
import { updateQuoteRequestStatus } from '../../apps/api/src/services/quote-requests.service.js'
import { supplierOrderCreateSchema } from '../../apps/api/src/routes/orders/orders.helpers.js'
import { hashOrderPlacementPayload } from '../../apps/api/src/services/order-placement-idempotency.service.js'

afterAll(() => Promise.all([pool.end(), singlePool.end()]))
beforeEach(() => {
  hooks.beforeTransaction = null
  hooks.beforeCommit = null
  hooks.afterQuoteLock = null
  hooks.singleConnection = false
  hooks.poolQueryFailures = []
  hooks.featureOverrideReads = 0
})

async function fixture() {
  const ids = Object.fromEntries(
    [
      'restaurant',
      'supplier',
      'secondSupplier',
      'outsider',
      'product',
      'secondProduct',
      'user',
    ].map((key) => [key, randomUUID()])
  )
  await pool.query('INSERT INTO restaurant(id,name,slug) VALUES($1::uuid,$1::text,$1::text)', [
    ids.restaurant,
  ])
  for (const supplier of [ids.supplier, ids.secondSupplier, ids.outsider])
    await pool.query(
      "INSERT INTO supplier(id,name,slug,account_status) VALUES($1::uuid,$1::text,$1::text,'ACTIVE')",
      [supplier]
    )
  for (const [product, supplier] of [
    [ids.product, ids.supplier],
    [ids.secondProduct, ids.secondSupplier],
  ]) {
    await pool.query(
      'INSERT INTO product(id,supplier_id,sku,name) VALUES($1::uuid,$2,$1::text,$1::text)',
      [product, supplier]
    )
    await pool.query(
      "INSERT INTO price(product_id,amount,currency,valid_from) VALUES($1,10,'USD',now()-interval '1 day')",
      [product]
    )
    await pool.query('UPDATE inventory SET available_qty=100,reserved_qty=0 WHERE product_id=$1', [
      product,
    ])
    await pool.query('INSERT INTO supplier_follow(restaurant_id,supplier_id) VALUES($1,$2)', [
      ids.restaurant,
      supplier,
    ])
  }
  const created = await createQuoteRequest({
    restaurantId: ids.restaurant,
    items: [{ productId: ids.product, quantity: 4 }],
    supplierIds: [ids.supplier],
  })
  const {
    rows: [invitation],
  } = await pool.query('SELECT id FROM quote_request_suppliers WHERE quote_request_id=$1', [
    created.quoteRequest.id,
  ])
  const {
    rows: [item],
  } = await pool.query('SELECT id FROM quote_request_items WHERE quote_request_id=$1', [
    created.quoteRequest.id,
  ])
  await submitQuoteResponse({
    supplierId: ids.supplier,
    quoteRequestSupplierId: invitation.id,
    items: [{ quoteRequestItemId: item.id, unitPrice: 2.75, quantity: 4, currency: 'USD' }],
  })
  const {
    rows: [line],
  } = await pool.query(
    'SELECT ri.id FROM quote_response_items ri JOIN quote_responses r ON r.id=ri.quote_response_id WHERE r.quote_request_supplier_id=$1',
    [invitation.id]
  )
  return {
    ...ids,
    request: created.quoteRequest.id,
    invitation: invitation.id,
    item: item.id,
    line: line.id,
  }
}

function appFor(ids, supplier = null) {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    req.auditIdentity = { restaurant: ids.restaurant, supplier }
    req.userData = { id: ids.user, role: supplier ? 'SUPPLIER' : 'RESTAURANT' }
    req.user = { id: ids.user }
    req.tenantContext = {
      tenantId: supplier || ids.restaurant,
      tenantType: req.userData.role,
      permissions: ['ORDERS_CREATE'],
    }
    req.requestId = 'checkout-audit'
    next()
  })
  app.use('/api/orders', createRouter)
  return app
}
function payload(ids, manual = false) {
  return {
    items: [{ productId: ids.product, quantity: 2 }],
    deliveryDate: '2099-02-03',
    ...(manual
      ? { restaurant_id: ids.restaurant }
      : {
          quoteLocks: [
            {
              productId: ids.product,
              quoteRequestSupplierId: ids.invitation,
              quoteResponseItemId: ids.line,
            },
          ],
        }),
  }
}
async function placed(ids) {
  return (
    await pool.query(
      'SELECT id,total_amount::float8 AS total,requested_delivery_date::text AS day FROM customer_order WHERE restaurant_id=$1',
      [ids.restaurant]
    )
  ).rows
}
async function stock(ids) {
  return (
    await pool.query(
      'SELECT available_qty::float8 AS available,reserved_qty::float8 AS reserved FROM inventory WHERE product_id=$1',
      [ids.product]
    )
  ).rows[0]
}

describe('supplier order checkout over HTTP with real PostgreSQL', () => {
  it('commits a restaurant quote order, stock reservation, daily meter and idempotent replay', async () => {
    const ids = await fixture(),
      app = appFor(ids),
      key = 'checkout-' + randomUUID()
    const first = await request(app)
      .post('/api/orders')
      .set('Idempotency-Key', key)
      .send(payload(ids))
    expect(first.status, JSON.stringify(first.body)).toBe(201)
    expect(first.body.data.order.items[0]).toMatchObject({
      pricing_source: 'QUOTE_PRICE',
      quote_response_item_id: ids.line,
    })
    expect(Number(first.body.data.order.items[0].unit_price)).toBe(2.75)
    expect(await stock(ids)).toEqual({ available: 98, reserved: 2 })
    expect((await placed(ids))[0].total).toBe(5.5)
    const replay = await request(app)
      .post('/api/orders')
      .set('Idempotency-Key', key)
      .send(payload(ids))
    expect(replay.status).toBe(200)
    expect(replay.body.data.order.id).toBe(first.body.data.order.id)
    expect(await stock(ids)).toEqual({ available: 98, reserved: 2 })
    expect(
      Number(
        (
          await pool.query(
            "SELECT current_value FROM usage_meter WHERE tenant_id=$1 AND meter_type='orders_per_day'",
            [ids.restaurant]
          )
        ).rows[0].current_value
      )
    ).toBe(1)
  })
  it.each(['closed', 'price', 'quantity'])(
    'rejects stale quote %s committed between preflight and transaction',
    async (change) => {
      const ids = await fixture()
      hooks.beforeTransaction = () =>
        change === 'closed'
          ? pool.query("UPDATE quote_requests SET status='closed' WHERE id=$1", [ids.request])
          : pool.query(
              `UPDATE quote_response_items SET ${change === 'price' ? 'unit_price=8' : 'quantity=1'} WHERE id=$1`,
              [ids.line]
            )
      const response = await request(appFor(ids)).post('/api/orders').send(payload(ids))
      expect(response.status, JSON.stringify(response.body)).toBe(400)
      expect(await placed(ids)).toHaveLength(0)
      expect(await stock(ids)).toEqual({ available: 100, reserved: 0 })
    }
  )
  it('persists the quote response item on a supplier manual order', async () => {
    const ids = await fixture()
    const response = await request(appFor(ids, ids.supplier))
      .post('/api/orders/manual')
      .send(payload(ids, true))
    expect(response.status, JSON.stringify(response.body)).toBe(201)
    expect(response.body.data.order.items[0]).toMatchObject({
      pricing_source: 'QUOTE_PRICE',
      quote_response_item_id: ids.line,
    })
  })

  it('requires quote locks when a response arrives after the catalog-price preflight', async () => {
    const ids = await fixture(),
      body = payload(ids)
    delete body.quoteLocks
    await pool.query('DELETE FROM quote_responses WHERE quote_request_supplier_id=$1', [
      ids.invitation,
    ])
    await pool.query("UPDATE quote_request_suppliers SET status='pending' WHERE id=$1", [
      ids.invitation,
    ])
    hooks.beforeTransaction = () =>
      submitQuoteResponse({
        supplierId: ids.supplier,
        quoteRequestSupplierId: ids.invitation,
        items: [{ quoteRequestItemId: ids.item, unitPrice: 2.75, quantity: 4, currency: 'USD' }],
      })
    const response = await request(appFor(ids)).post('/api/orders').send(body)
    expect(response.status, JSON.stringify(response.body)).toBe(400)
    expect(await placed(ids)).toHaveLength(0)
    expect(await stock(ids)).toEqual({ available: 100, reserved: 0 })
  })

  it('serializes concurrent supplier retries into one manual order', async () => {
    const ids = await fixture(),
      app = appFor(ids, ids.supplier),
      key = 'concurrent-' + randomUUID(),
      body = payload(ids, true)
    const responses = await Promise.all(
      [1, 2].map(() =>
        request(app).post('/api/orders/manual').set('Idempotency-Key', key).send(body)
      )
    )
    expect(responses.map((response) => response.status).sort()).toEqual([200, 201])
    expect(responses[0].body.data.order.id).toBe(responses[1].body.data.order.id)
    expect(await placed(ids)).toHaveLength(1)
    expect(await stock(ids)).toEqual({ available: 98, reserved: 2 })
  })
  it('places manual orders with a single database connection', async () => {
    const ids = await fixture()
    hooks.singleConnection = true
    const response = await request(appFor(ids, ids.supplier))
      .post('/api/orders/manual')
      .send(payload(ids, true))
    expect(response.status, JSON.stringify(response.body)).toBe(201)
    expect(hooks.poolQueryFailures).toEqual([])
    expect(hooks.featureOverrideReads).toBeGreaterThan(0)
  })
  it('never replays another supplier manual-order response before checking ownership', async () => {
    const ids = await fixture(),
      key = 'manual-' + randomUUID(),
      body = payload(ids, true)
    const own = await request(appFor(ids, ids.supplier))
      .post('/api/orders/manual')
      .set('Idempotency-Key', key)
      .send(body)
    expect(own.status, JSON.stringify(own.body)).toBe(201)
    const foreign = await request(appFor(ids, ids.outsider))
      .post('/api/orders/manual')
      .set('Idempotency-Key', key)
      .send(body)
    expect(foreign.status).toBe(400)
    expect(foreign.body.data).toBeNull()
  })
  it('allows independent suppliers to use the same key for the same restaurant', async () => {
    const ids = await fixture(),
      key = 'independent-' + randomUUID()
    const first = await request(appFor(ids, ids.supplier))
      .post('/api/orders/manual')
      .set('Idempotency-Key', key)
      .send(payload(ids, true))
    expect(first.status, JSON.stringify(first.body)).toBe(201)
    const second = await request(appFor(ids, ids.secondSupplier))
      .post('/api/orders/manual')
      .set('Idempotency-Key', key)
      .send({ ...payload(ids, true), items: [{ productId: ids.secondProduct, quantity: 2 }] })
    expect(second.status, JSON.stringify(second.body)).toBe(201)
    expect(await placed(ids)).toHaveLength(2)
  })
  it('stores the resolved manual delivery day when the caller omits it', async () => {
    const ids = await fixture(),
      body = payload(ids, true)
    delete body.deliveryDate
    const response = await request(appFor(ids, ids.supplier)).post('/api/orders/manual').send(body)
    expect(response.status, JSON.stringify(response.body)).toBe(201)
    expect((await placed(ids))[0].day).toBe(
      resolveSupplierDeliveryDate({ last_order_mode: 'none' }).deliveryDate
    )
  })

  it('replays an owned historical manual key without creating another order', async () => {
    const ids = await fixture(),
      body = payload(ids, true),
      key = 'historical-' + randomUUID(),
      app = appFor(ids, ids.supplier)
    const first = await request(app).post('/api/orders/manual').send(body)
    expect(first.status).toBe(201)
    const hash = hashOrderPlacementPayload({
      ...supplierOrderCreateSchema.parse(body),
      branchId: null,
    })
    await pool.query(
      "INSERT INTO order_placement_idempotency(restaurant_id,actor_scope,idempotency_key,request_hash,status,response_json) VALUES($1,$2,$3,$4,'SUCCEEDED',$5::jsonb)",
      [ids.restaurant, 'RESTAURANT:' + ids.restaurant, key, hash, JSON.stringify(first.body.data)]
    )
    const replay = await request(app)
      .post('/api/orders/manual')
      .set('Idempotency-Key', key)
      .send(body)
    expect(replay.status, JSON.stringify(replay.body)).toBe(200)
    expect(replay.body.data.order.id).toBe(first.body.data.order.id)
    expect(await placed(ids)).toHaveLength(1)
    expect(await stock(ids)).toEqual({ available: 98, reserved: 2 })
    const foreign = await request(appFor(ids, ids.outsider))
      .post('/api/orders/manual')
      .set('Idempotency-Key', key)
      .send(body)
    expect(foreign.status).toBe(400)
    expect(foreign.body.data).toBeNull()
  })

  it('keeps successful manual retries valid after quote closure and rejects key reuse with different quantities', async () => {
    const ids = await fixture(),
      body = payload(ids, true),
      key = 'manual-replay-' + randomUUID(),
      app = appFor(ids, ids.supplier)
    const first = await request(app)
      .post('/api/orders/manual')
      .set('Idempotency-Key', key)
      .send(body)
    expect(first.status).toBe(201)
    await updateQuoteRequestStatus(ids.request, ids.restaurant, 'closed')
    const replay = await request(app)
      .post('/api/orders/manual')
      .set('Idempotency-Key', key)
      .send(body)
    expect(replay.status).toBe(200)
    expect(replay.body.data.order.id).toBe(first.body.data.order.id)
    const mismatch = await request(app)
      .post('/api/orders/manual')
      .set('Idempotency-Key', key)
      .send({ ...body, items: [{ productId: ids.product, quantity: 3 }] })
    expect(mismatch.status).toBe(409)
    expect(await stock(ids)).toEqual({ available: 98, reserved: 2 })
  })

  it('rolls back order, stock, usage and placement key together, then permits the same-key retry', async () => {
    const ids = await fixture(),
      app = appFor(ids),
      key = 'rollback-' + randomUUID()
    hooks.beforeCommit = () => {
      throw new Error('Injected checkout rollback')
    }
    const failed = await request(app)
      .post('/api/orders')
      .set('Idempotency-Key', key)
      .send(payload(ids))
    expect(failed.status).toBe(500)
    expect(await placed(ids)).toHaveLength(0)
    expect(await stock(ids)).toEqual({ available: 100, reserved: 0 })
    expect(
      (
        await pool.query('SELECT id FROM order_placement_idempotency WHERE restaurant_id=$1', [
          ids.restaurant,
        ])
      ).rows
    ).toHaveLength(0)
    expect(
      (await pool.query('SELECT id FROM usage_meter WHERE tenant_id=$1', [ids.restaurant])).rows
    ).toHaveLength(0)
    hooks.beforeCommit = null
    const retried = await request(app)
      .post('/api/orders')
      .set('Idempotency-Key', key)
      .send(payload(ids))
    expect(retried.status).toBe(201)
    expect(await stock(ids)).toEqual({ available: 98, reserved: 2 })
  })

  it.each(['close', 'edit'])('holds quote %s until the in-flight order commits', async (action) => {
    const ids = await fixture()
    let parentResolve, releaseResolve
    const held = new Promise((resolve) => {
        parentResolve = resolve
      }),
      released = new Promise((resolve) => {
        releaseResolve = resolve
      })
    hooks.afterQuoteLock = async (pid) => {
      hooks.afterQuoteLock = null
      parentResolve(pid)
      await released
    }
    const settle = (promise) =>
      promise.then(
        (value) => ({ value }),
        (error) => ({ error })
      )
    const checkout = settle(
      request(appFor(ids))
        .post('/api/orders')
        .send(payload(ids))
        .then((response) => response)
    )
    let writer
    try {
      const pid = await held
      writer = settle(
        action === 'close'
          ? updateQuoteRequestStatus(ids.request, ids.restaurant, 'closed')
          : submitQuoteResponse({
              supplierId: ids.supplier,
              quoteRequestSupplierId: ids.invitation,
              items: [{ quoteRequestItemId: ids.item, unitPrice: 8, quantity: 4, currency: 'USD' }],
            })
      )
      const deadline = Date.now() + 2500
      let blocked = false
      while (Date.now() < deadline) {
        const { rows } = await pool.query(
          'SELECT pid FROM pg_stat_activity WHERE $1::int = ANY(pg_blocking_pids(pid))',
          [pid]
        )
        if (rows.length) {
          blocked = true
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
      expect(blocked).toBe(true)
      releaseResolve()
      const [orderResult, writerResult] = await Promise.all([checkout, writer])
      expect(orderResult.value.status, JSON.stringify(orderResult.value.body)).toBe(201)
      expect(writerResult.error).toBeUndefined()
      expect((await placed(ids))[0].total).toBe(5.5)
    } finally {
      releaseResolve()
      await Promise.all([checkout, ...(writer ? [writer] : [])])
      hooks.afterQuoteLock = null
    }
  })
})
