import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const hooks = vi.hoisted(() => ({ beforeTransaction: null, beforeCommit: null }))
vi.mock('../../apps/api/src/services/notification.service.js', () => ({
  notifyQuoteRequestReceived: vi.fn(async () => {}),
  notifyQuoteResponseReceived: vi.fn(async () => {}),
  notifyQuoteRequestDeclined: vi.fn(async () => {}),
}))
vi.mock('../../apps/api/src/config/env.js', () => ({
  config: { NODE_ENV: 'test', APP_ENV: 'dev', DEFAULT_TENANT_TIMEZONE: 'Asia/Beirut' },
}))
vi.mock('../../apps/api/src/lib/db.js', async () => {
  const { createRequire } = await import('node:module')
  const require = createRequire(new URL('../../apps/api/package.json', import.meta.url))
  const { Pool } = require('pg')
  const url = new URL(process.env.SUPPLIFY_AUDIT_DATABASE_URL || 'invalid:')
  if (url.hostname !== '127.0.0.1' || url.pathname !== '/rbac_audit')
    throw new Error('Refusing non-isolated quote audit target')
  const pool = new Pool({ connectionString: url.href, max: 8 })
  const query = (sql, params) => pool.query(sql, params)
  const withTransaction = async (callback) => {
    const hook = hooks.beforeTransaction
    hooks.beforeTransaction = null
    if (hook) await hook()
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query("SET LOCAL statement_timeout = '4000ms'")
      const result = await callback(client)
      if (hooks.beforeCommit) await hooks.beforeCommit()
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
  return { pool, query, withTransaction }
})

import { pool } from '../../apps/api/src/lib/db.js'
import {
  createQuoteRequest,
  listSupplierQuoteRequests,
  getQuoteRequestDetail,
  getSupplierQuoteRequestDetail,
  submitQuoteResponse,
  declineQuoteRequest,
  buildCartPayloadFromResponse,
} from '../../apps/api/src/services/quote-requests.service.js'
import {
  resolveQuotePrice,
  resolveProductPricesBatch,
  findOpenQuoteLocksForOrder,
  findOpenQuotedProductsForOrder,
} from '../../apps/api/src/services/resolve-product-price.service.js'
import { ValidationError } from '../../apps/api/src/middlewares/errorHandler.js'
import {
  notifyQuoteResponseReceived,
  notifyQuoteRequestDeclined,
} from '../../apps/api/src/services/notification.service.js'

afterAll(() => pool.end())
beforeEach(() => {
  hooks.beforeTransaction = null
  hooks.beforeCommit = null
  vi.clearAllMocks()
})

async function fixture() {
  const ids = Object.fromEntries(
    [
      'supplier',
      'otherSupplier',
      'restaurant',
      'otherRestaurant',
      'product',
      'otherProduct',
      'substitute',
    ].map((key) => [key, randomUUID()])
  )
  for (const supplier of [ids.supplier, ids.otherSupplier])
    await pool.query(
      "INSERT INTO supplier(id,name,slug,account_status) VALUES($1::uuid,$1::text,$1::text,'ACTIVE')",
      [supplier]
    )
  for (const restaurant of [ids.restaurant, ids.otherRestaurant])
    await pool.query('INSERT INTO restaurant(id,name,slug) VALUES($1::uuid,$1::text,$1::text)', [
      restaurant,
    ])
  for (const [product, supplier] of [
    [ids.product, ids.supplier],
    [ids.substitute, ids.supplier],
    [ids.otherProduct, ids.otherSupplier],
  ]) {
    await pool.query(
      'INSERT INTO product(id,supplier_id,sku,name) VALUES($1::uuid,$2,$1::text,$1::text)',
      [product, supplier]
    )
    await pool.query(
      "INSERT INTO price(product_id,amount,currency,valid_from) VALUES($1,10,'USD',now()-interval '1 day')",
      [product]
    )
  }
  const created = await createQuoteRequest({
    restaurantId: ids.restaurant,
    items: [
      { productId: ids.product, quantity: 4 },
      { productId: ids.otherProduct, quantity: 2 },
    ],
    supplierIds: [ids.supplier, ids.otherSupplier],
    neededBy: '2099-02-03',
  })
  const { rows: items } = await pool.query(
    'SELECT id,product_id FROM quote_request_items WHERE quote_request_id=$1',
    [created.quoteRequest.id]
  )
  const { rows: suppliers } = await pool.query(
    'SELECT id,supplier_id FROM quote_request_suppliers WHERE quote_request_id=$1',
    [created.quoteRequest.id]
  )
  return {
    ...ids,
    request: created.quoteRequest.id,
    item: items.find((row) => row.product_id === ids.product).id,
    otherItem: items.find((row) => row.product_id === ids.otherProduct).id,
    inbox: suppliers.find((row) => row.supplier_id === ids.supplier).id,
    otherInbox: suppliers.find((row) => row.supplier_id === ids.otherSupplier).id,
    created,
  }
}

function respond(ids, patch = {}) {
  return submitQuoteResponse({
    supplierId: ids.supplier,
    quoteRequestSupplierId: ids.inbox,
    items: [
      {
        quoteRequestItemId: ids.item,
        unitPrice: 2.75,
        currency: 'USD',
        deliveryDate: '2099-02-04',
        ...patch,
      },
    ],
  })
}

async function legacyResponse(ids, { item = ids.item, substitute = null, price = 1 } = {}) {
  const {
    rows: [response],
  } = await pool.query(
    'INSERT INTO quote_responses(quote_request_supplier_id) VALUES($1) RETURNING id',
    [ids.inbox]
  )
  const {
    rows: [line],
  } = await pool.query(
    'INSERT INTO quote_response_items(quote_response_id,quote_request_item_id,unit_price,substitute_product_id) VALUES($1,$2,$3,$4) RETURNING id',
    [response.id, item, price, substitute]
  )
  await pool.query("UPDATE quote_request_suppliers SET status='responded' WHERE id=$1", [ids.inbox])
  return line.id
}

describe('supplier quotes with real PostgreSQL', () => {
  it('creates, scopes, responds, compares and resolves the quoted cart price', async () => {
    const ids = await fixture()
    const inbox = await listSupplierQuoteRequests(ids.supplier)
    expect(inbox.inbox).toHaveLength(1)
    expect(inbox.inbox[0].itemCount).toBe(1)
    expect(
      (await getSupplierQuoteRequestDetail(ids.supplier, ids.inbox)).items.map((item) => item.id)
    ).toEqual([ids.item])
    await respond(ids)
    const cart = await buildCartPayloadFromResponse({
      restaurantId: ids.restaurant,
      quoteRequestId: ids.request,
      quoteRequestSupplierId: ids.inbox,
    })
    expect(cart.items[0]).toMatchObject({
      productId: ids.product,
      quotedUnitPrice: 2.75,
      quantity: 4,
    })
    expect(
      (
        await resolveProductPricesBatch({
          restaurantId: ids.restaurant,
          items: [{ productId: ids.product, supplierId: ids.supplier, quantity: 4 }],
          quoteLocks: [
            {
              productId: ids.product,
              quoteRequestSupplierId: ids.inbox,
              quoteResponseItemId: cart.items[0].quoteResponseItemId,
            },
          ],
        })
      )[0]
    ).toMatchObject({ unitPrice: 2.75, source: 'QUOTE_PRICE' })
  })

  it('keeps request and delivery calendar fields as literal date strings', async () => {
    const ids = await fixture()
    const submitted = await respond(ids)
    expect(ids.created.quoteRequest.neededBy).toBe('2099-02-03')
    expect((await listSupplierQuoteRequests(ids.supplier)).inbox[0].neededBy).toBe('2099-02-03')
    expect(submitted.neededBy).toBe('2099-02-03')
    expect(submitted.response.items[0].deliveryDate).toBe('2099-02-04')
    expect(
      (await getQuoteRequestDetail(ids.request, ids.restaurant)).suppliers.find(
        (row) => row.id === ids.inbox
      ).response.items[0].deliveryDate
    ).toBe('2099-02-04')
  })

  it('rejects another invited supplier product line without writing a response', async () => {
    const ids = await fixture()
    await expect(respond(ids, { quoteRequestItemId: ids.otherItem })).rejects.toBeInstanceOf(
      ValidationError
    )
    expect(
      (
        await pool.query('SELECT id FROM quote_responses WHERE quote_request_supplier_id=$1', [
          ids.inbox,
        ])
      ).rows
    ).toHaveLength(0)
  })

  it('rejects a substitute product owned by another supplier', async () => {
    const ids = await fixture()
    await expect(respond(ids, { substituteProductId: ids.otherProduct })).rejects.toBeInstanceOf(
      ValidationError
    )
  })

  it('requires a numeric nonnegative price for every available line', async () => {
    const ids = await fixture()
    await expect(respond(ids, { unitPrice: null })).rejects.toBeInstanceOf(ValidationError)
  })

  it('rejects duplicate request lines as validation rather than a database constraint failure', async () => {
    const ids = await fixture()
    await expect(
      submitQuoteResponse({
        supplierId: ids.supplier,
        quoteRequestSupplierId: ids.inbox,
        items: [1, 2].map(() => ({ quoteRequestItemId: ids.item, unitPrice: 2 })),
      })
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('rechecks a decline committed after response preflight', async () => {
    const ids = await fixture()
    hooks.beforeTransaction = () =>
      pool.query("UPDATE quote_request_suppliers SET status='declined' WHERE id=$1", [ids.inbox])
    await expect(respond(ids)).rejects.toBeInstanceOf(ValidationError)
    expect(
      (await pool.query('SELECT status FROM quote_request_suppliers WHERE id=$1', [ids.inbox]))
        .rows[0].status
    ).toBe('declined')
  })

  it('rechecks closure before declining instead of committing from an old read', async () => {
    const ids = await fixture()
    let changed = false
    const interleavedQuery = async (sql, params) => {
      const result = await pool.query(sql, params)
      if (!changed && /SELECT qrs\.\*/.test(sql)) {
        changed = true
        await pool.query("UPDATE quote_requests SET status='closed' WHERE id=$1", [ids.request])
      }
      return result
    }
    await expect(
      declineQuoteRequest(
        { supplierId: ids.supplier, quoteRequestSupplierId: ids.inbox },
        interleavedQuery
      )
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it.each(['foreign-line', 'foreign-substitute', 'foreign-request'])(
    'ignores historical %s response corruption in cart and all quote pricing reads',
    async (kind) => {
      const ids = await fixture()
      const productId = kind === 'foreign-line' ? ids.otherProduct : ids.product
      let corruptItem = ids.otherItem
      if (kind === 'foreign-request') {
        const {
          rows: [request],
        } = await pool.query('INSERT INTO quote_requests(restaurant_id) VALUES($1) RETURNING id', [
          ids.otherRestaurant,
        ])
        const {
          rows: [item],
        } = await pool.query(
          'INSERT INTO quote_request_items(quote_request_id,product_id,quantity) VALUES($1,$2,1) RETURNING id',
          [request.id, ids.product]
        )
        corruptItem = item.id
      }
      const line = await legacyResponse(
        ids,
        kind === 'foreign-substitute' ? { substitute: ids.otherProduct } : { item: corruptItem }
      )
      const lock = { productId, quoteRequestSupplierId: ids.inbox, quoteResponseItemId: line }
      const single = await resolveQuotePrice({
        restaurantId: ids.restaurant,
        ...lock,
        supplierId: kind === 'foreign-line' ? ids.otherSupplier : ids.supplier,
      })
      expect(single).toBeNull()
      expect(
        await findOpenQuoteLocksForOrder({
          restaurantId: ids.restaurant,
          productIds: [ids.product, ids.otherProduct],
        })
      ).toEqual([])
      expect(
        (
          await findOpenQuotedProductsForOrder({
            restaurantId: ids.restaurant,
            productIds: [ids.product, ids.otherProduct],
          })
        ).size
      ).toBe(0)
      expect(
        (
          await resolveProductPricesBatch({
            restaurantId: ids.restaurant,
            items: [
              { productId, supplierId: kind === 'foreign-line' ? ids.otherSupplier : ids.supplier },
            ],
            quoteLocks: [lock],
          })
        )[0].source
      ).toBe('DEFAULT_PRICE')
      await expect(
        buildCartPayloadFromResponse({
          restaurantId: ids.restaurant,
          quoteRequestSupplierId: ids.inbox,
        })
      ).rejects.toBeInstanceOf(ValidationError)
      expect((await getSupplierQuoteRequestDetail(ids.supplier, ids.inbox)).response.items).toEqual(
        []
      )
      expect(
        (await getQuoteRequestDetail(ids.request, ids.restaurant)).suppliers.find(
          (row) => row.id === ids.inbox
        ).response.items
      ).toEqual([])
    }
  )

  it('applies a substitute quote only to the offered substitute SKU', async () => {
    const ids = await fixture()
    const line = await legacyResponse(ids, { substitute: ids.substitute })
    const lock = { quoteRequestSupplierId: ids.inbox, quoteResponseItemId: line }
    expect(
      await resolveQuotePrice({
        restaurantId: ids.restaurant,
        productId: ids.product,
        supplierId: ids.supplier,
        ...lock,
      })
    ).toBeNull()
    expect(
      (
        await resolveQuotePrice({
          restaurantId: ids.restaurant,
          productId: ids.substitute,
          supplierId: ids.supplier,
          ...lock,
        })
      ).unitPrice
    ).toBe(1)
    expect(
      (
        await findOpenQuotedProductsForOrder({
          restaurantId: ids.restaurant,
          productIds: [ids.product, ids.substitute],
        })
      ).has(ids.product)
    ).toBe(false)
    expect(
      (
        await findOpenQuoteLocksForOrder({
          restaurantId: ids.restaurant,
          productIds: [ids.product, ids.substitute],
        })
      ).map((row) => row.productId)
    ).toEqual([ids.substitute])
    expect(
      (
        await resolveProductPricesBatch({
          restaurantId: ids.restaurant,
          items: [{ productId: ids.product, supplierId: ids.supplier }],
          quoteLocks: [{ productId: ids.product, ...lock }],
        })
      )[0].source
    ).toBe('DEFAULT_PRICE')
    expect(
      (
        await resolveProductPricesBatch({
          restaurantId: ids.restaurant,
          items: [{ productId: ids.substitute, supplierId: ids.supplier }],
          quoteLocks: [{ productId: ids.substitute, ...lock }],
        })
      )[0]
    ).toMatchObject({ source: 'QUOTE_PRICE', unitPrice: 1 })
    expect(
      (
        await buildCartPayloadFromResponse({
          restaurantId: ids.restaurant,
          quoteRequestSupplierId: ids.inbox,
        })
      ).items[0]
    ).toMatchObject({ productId: ids.substitute, product: { supplier_id: ids.supplier } })
  })

  it('isolates another restaurant from quote cart and pricing reads', async () => {
    const ids = await fixture()
    const line = await legacyResponse(ids)
    await expect(
      buildCartPayloadFromResponse({
        restaurantId: ids.otherRestaurant,
        quoteRequestSupplierId: ids.inbox,
      })
    ).rejects.toMatchObject({ name: 'ForbiddenError' })
    expect(
      await resolveQuotePrice({
        restaurantId: ids.otherRestaurant,
        productId: ids.product,
        quoteRequestSupplierId: ids.inbox,
        quoteResponseItemId: line,
      })
    ).toBeNull()
    expect(
      await findOpenQuoteLocksForOrder({
        restaurantId: ids.otherRestaurant,
        productIds: [ids.product],
      })
    ).toEqual([])
    await expect(getSupplierQuoteRequestDetail(ids.otherSupplier, ids.inbox)).rejects.toMatchObject(
      { name: 'NotFoundError' }
    )
  })

  it('serializes overlapping response and decline decisions after both preflights', async () => {
    const ids = await fixture()
    let release, timer
    const gate = new Promise((resolve) => {
      release = resolve
    })
    hooks.beforeTransaction = async () => {
      hooks.beforeTransaction = () => release()
      await Promise.race([
        gate,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('Quote concurrency barrier timed out')), 3000)
        }),
      ])
    }
    try {
      const results = await Promise.allSettled([
        respond(ids),
        declineQuoteRequest({ supplierId: ids.supplier, quoteRequestSupplierId: ids.inbox }),
      ])
      expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected'])
      expect(results.find((result) => result.status === 'rejected').reason).toBeInstanceOf(
        ValidationError
      )
      const {
        rows: [row],
      } = await pool.query('SELECT status FROM quote_request_suppliers WHERE id=$1', [ids.inbox])
      const { rows } = await pool.query(
        'SELECT id FROM quote_responses WHERE quote_request_supplier_id=$1',
        [ids.inbox]
      )
      expect(rows).toHaveLength(row.status === 'responded' ? 1 : 0)
      expect(
        vi.mocked(notifyQuoteResponseReceived).mock.calls.length +
          vi.mocked(notifyQuoteRequestDeclined).mock.calls.length
      ).toBe(1)
    } finally {
      clearTimeout(timer)
      release()
    }
  })

  it('rolls an edited response back atomically when an application error occurs before commit', async () => {
    const ids = await fixture()
    const first = await respond(ids)
    vi.mocked(notifyQuoteResponseReceived).mockClear()
    hooks.beforeCommit = () => {
      throw new Error('Injected quote rollback')
    }
    await expect(respond(ids, { unitPrice: 8 })).rejects.toThrow('Injected quote rollback')
    hooks.beforeCommit = null
    const after = await getSupplierQuoteRequestDetail(ids.supplier, ids.inbox)
    expect(after.response.id).toBe(first.response.id)
    expect(after.response.items[0]).toMatchObject({ unitPrice: 2.75, deliveryDate: '2099-02-04' })
    expect(notifyQuoteResponseReceived).not.toHaveBeenCalled()
  })

  it('allows a price-free unavailable response but refuses to load it into a cart', async () => {
    const ids = await fixture()
    const response = await respond(ids, { isAvailable: false, unitPrice: null })
    expect(response.response.items[0]).toMatchObject({ isAvailable: false, unitPrice: null })
    await expect(
      buildCartPayloadFromResponse({
        restaurantId: ids.restaurant,
        quoteRequestSupplierId: ids.inbox,
      })
    ).rejects.toBeInstanceOf(ValidationError)
  })
})
