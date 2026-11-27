import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../apps/api/src/lib/auth.js', async (importOriginal) => {
  const { withTestAuth } = await import('./auth-mock.js')
  return withTestAuth(await importOriginal())
})
// Plan limits and gates are outside this suite's subject.
vi.mock('../../../apps/api/src/lib/subscription.js', async (importOriginal) => ({
  ...(await importOriginal()),
  requireFeature: () => (_req, _res, next) => next(),
  checkLimit: vi.fn(async () => ({ allowed: true, isOverLimit: false, isUnlimited: true })),
  incrementUsage: vi.fn(async () => true),
}))

import { resetMarketplaceDb, startApiForTest, startMarketplaceDb } from './harness.js'
import { createProduct, createSupplierOrg } from './fixtures.js'

let db
let api
let cats

beforeAll(async () => {
  db = await startMarketplaceDb()
  api = await startApiForTest()
}, 180_000)
afterAll(async () => {
  await api?.close()
})
beforeEach(async () => {
  await resetMarketplaceDb(db.pool)
  const { rows } = await db.pool.query(
    'SELECT id, slug, parent_category_id FROM product_category WHERE supplier_id IS NULL'
  )
  cats = Object.fromEntries(rows.map((r) => [r.slug, r]))
})

const leaf = (slug) => cats[slug].id
const dept = (slug) => cats[slug].parent_category_id

async function call(sub, method, path, body) {
  const res = await fetch(`${api.baseUrl}${path}`, {
    method,
    headers: { 'x-test-user': sub, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

async function shelf(supplierId, name) {
  const {
    rows: [s],
  } = await db.pool.query(
    'INSERT INTO supplier_shelf (supplier_id, name) VALUES ($1, $2) RETURNING id',
    [supplierId, name]
  )
  return s.id
}

async function shelfIdsOf(productId) {
  const { rows } = await db.pool.query(
    'SELECT shelf_id FROM product_shelf WHERE product_id = $1 ORDER BY shelf_id',
    [productId]
  )
  return rows.map((r) => r.shelf_id)
}

const sku = () => `SKU-${Math.random().toString(36).slice(2, 10)}`

describe('product writes require a leaf platform category (real PG)', () => {
  it('create without category is 400', async () => {
    const org = await createSupplierOrg(db.pool)
    const res = await call(org.users[0].userSub, 'POST', '/api/products', {
      sku: sku(),
      name: 'Burrata',
    })
    expect(res.status, JSON.stringify(res.body)).toBe(400)
    expect(res.body.error).toEqual({
      name: 'VALIDATION_ERROR',
      code: 'chooseCategory',
      message: 'Choose a category for this product',
    })
  })

  it('department id rejected', async () => {
    const org = await createSupplierOrg(db.pool)
    const res = await call(org.users[0].userSub, 'POST', '/api/products', {
      sku: sku(),
      name: 'Burrata',
      category_id: dept('cheese'),
    })
    expect(res.status, JSON.stringify(res.body)).toBe(400)
    expect(res.body.error).toMatchObject({ name: 'VALIDATION_ERROR', code: 'categoryNotLeaf' })
  })

  it('creates on a leaf with own shelves, never writes the legacy text', async () => {
    const org = await createSupplierOrg(db.pool)
    const branch = org.branchIds[0]
    const fridge = await shelf(branch, 'Fridge')
    const res = await call(org.users[0].userSub, 'POST', '/api/products', {
      sku: sku(),
      name: 'Burrata',
      category: 'Fromages frais',
      category_id: leaf('cheese'),
      shelfIds: [fridge],
    })
    expect(res.status, JSON.stringify(res.body)).toBe(201)
    const { product } = res.body.data
    expect(product).toMatchObject({ category_id: leaf('cheese'), shelf_ids: [fridge] })
    const {
      rows: [row],
    } = await db.pool.query('SELECT category, category_needs_review FROM product WHERE id = $1', [
      product.id,
    ])
    expect(row).toEqual({ category: null, category_needs_review: false })
    expect(await shelfIdsOf(product.id)).toEqual([fridge])
  })

  it('foreign shelf rejected (another supplier, and another branch of the same org)', async () => {
    const org = await createSupplierOrg(db.pool, { branches: 2 })
    const other = await createSupplierOrg(db.pool)
    for (const foreign of [
      await shelf(other.branchIds[0], 'Theirs'),
      await shelf(org.branchIds[1], 'Branch 2'),
    ]) {
      const res = await call(org.users[0].userSub, 'POST', '/api/products', {
        sku: sku(),
        name: 'Burrata',
        category_id: leaf('cheese'),
        shelfIds: [foreign],
      })
      expect(res.status, JSON.stringify(res.body)).toBe(400)
      expect(res.body.error.code).toBe('foreignShelf')
    }
    const { rows } = await db.pool.query(
      'SELECT count(*)::int AS n FROM product WHERE supplier_id = $1',
      [org.branchIds[0]]
    )
    expect(rows[0].n).toBe(0)
  })

  it('archived shelf rejected', async () => {
    const org = await createSupplierOrg(db.pool)
    const old = await shelf(org.branchIds[0], 'Old')
    await db.pool.query('UPDATE supplier_shelf SET archived_at = now() WHERE id = $1', [old])
    const res = await call(org.users[0].userSub, 'POST', '/api/products', {
      sku: sku(),
      name: 'Burrata',
      category_id: leaf('cheese'),
      shelfIds: [old],
    })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('foreignShelf')
  })

  it('update: same rules; shelfIds replace; a resolved category clears the review flag', async () => {
    const org = await createSupplierOrg(db.pool)
    const branch = org.branchIds[0]
    const p = await createProduct(db.pool, branch, { categoryId: leaf('other') })
    await db.pool.query('UPDATE product SET category_needs_review = true WHERE id = $1', [p.id])
    const a = await shelf(branch, 'A')
    const b = await shelf(branch, 'B')
    const sub = org.users[0].userSub

    expect(
      (await call(sub, 'PATCH', `/api/products/${p.id}`, { category_id: null })).body.error.code
    ).toBe('chooseCategory')
    expect(
      (await call(sub, 'PATCH', `/api/products/${p.id}`, { category_id: dept('cheese') })).body
        .error.code
    ).toBe('categoryNotLeaf')

    const first = await call(sub, 'PATCH', `/api/products/${p.id}`, {
      category_id: leaf('cheese'),
      shelfIds: [a, b],
    })
    expect(first.status, JSON.stringify(first.body)).toBe(200)
    expect([...(await shelfIdsOf(p.id))].sort()).toEqual([a, b].sort())
    const second = await call(sub, 'PATCH', `/api/products/${p.id}`, { shelfIds: [b] })
    expect(second.status, JSON.stringify(second.body)).toBe(200)
    expect(await shelfIdsOf(p.id)).toEqual([b])
    const {
      rows: [row],
    } = await db.pool.query(
      'SELECT category_id, category_needs_review FROM product WHERE id = $1',
      [p.id]
    )
    expect(row).toEqual({ category_id: leaf('cheese'), category_needs_review: false })
  })
})

describe('shelves API (real PG)', () => {
  it('shelf product_count distinct; archived shelves hidden', async () => {
    const org = await createSupplierOrg(db.pool)
    const branch = org.branchIds[0]
    const sub = org.users[0].userSub
    const created = await call(sub, 'POST', '/api/products/shelves', {
      name: 'Fridge',
      name_ar: 'براد',
    })
    expect(created.status, JSON.stringify(created.body)).toBe(201)
    const shelfId = created.body.data.shelf.id
    const p1 = await createProduct(db.pool, branch, { categoryId: leaf('cheese') })
    const p2 = await createProduct(db.pool, branch, { categoryId: leaf('dairy') })
    const put = await call(sub, 'PUT', `/api/products/shelves/${shelfId}/products`, {
      productIds: [p1.id, p2.id, p1.id],
    })
    expect(put.status, JSON.stringify(put.body)).toBe(200)

    const list = await call(sub, 'GET', '/api/products/shelves')
    expect(list.status).toBe(200)
    expect(list.body.data.shelves).toEqual([
      expect.objectContaining({
        id: shelfId,
        name: 'Fridge',
        name_ar: 'براد',
        product_count: 2,
        archived_at: null,
      }),
    ])

    const dup = await call(sub, 'POST', '/api/products/shelves', { name: ' fridge ' })
    expect(dup.status).toBe(409)
    expect(dup.body.error.name).toBe('SHELF_NAME_TAKEN')
  })

  it('PATCH shelf products adds and removes without touching other members', async () => {
    const org = await createSupplierOrg(db.pool)
    const other = await createSupplierOrg(db.pool)
    const branch = org.branchIds[0]
    const sub = org.users[0].userSub
    const shelfId = await shelf(branch, 'Big shelf')
    const products = []
    for (let i = 0; i < 4; i += 1) {
      products.push(await createProduct(db.pool, branch, { categoryId: leaf('cheese') }))
    }
    const [p1, p2, p3, p4] = products.map((p) => p.id)
    await call(sub, 'PUT', `/api/products/shelves/${shelfId}/products`, {
      productIds: [p1, p2, p3],
    })

    const res = await call(sub, 'PATCH', `/api/products/shelves/${shelfId}/products`, {
      add: [p4, p2],
      remove: [p1],
    })
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    expect(res.body.data.shelf.product_count).toBe(3)
    const { rows } = await db.pool.query(
      'SELECT product_id FROM product_shelf WHERE shelf_id = $1 ORDER BY product_id',
      [shelfId]
    )
    expect(rows.map((r) => r.product_id)).toEqual([p2, p3, p4].sort())

    const theirs = await createProduct(db.pool, other.branchIds[0], { categoryId: leaf('cheese') })
    const foreign = await call(sub, 'PATCH', `/api/products/shelves/${shelfId}/products`, {
      add: [theirs.id],
    })
    expect(foreign.status).toBe(400)
    expect(foreign.body.error.code).toBe('foreignProducts')
  })

  it('foreign productIds and foreign shelves are refused', async () => {
    const org = await createSupplierOrg(db.pool)
    const other = await createSupplierOrg(db.pool)
    const sub = org.users[0].userSub
    const mine = await shelf(org.branchIds[0], 'Mine')
    const theirs = await shelf(other.branchIds[0], 'Theirs')
    const theirProduct = await createProduct(db.pool, other.branchIds[0], {
      categoryId: leaf('cheese'),
    })

    const put = await call(sub, 'PUT', `/api/products/shelves/${mine}/products`, {
      productIds: [theirProduct.id],
    })
    expect(put.status).toBe(400)
    expect(put.body.error.code).toBe('foreignProducts')
    expect(
      (await call(sub, 'PATCH', `/api/products/shelves/${theirs}`, { name: 'Hijack' })).status
    ).toBe(404)
    expect((await call(sub, 'DELETE', `/api/products/shelves/${theirs}`)).status).toBe(404)
  })

  it('archive in-use shelf is SHELF_IN_USE with names', async () => {
    const org = await createSupplierOrg(db.pool)
    const branch = org.branchIds[0]
    const sub = org.users[0].userSub
    const shelfId = await shelf(branch, 'Promo')
    const {
      rows: [deal],
    } = await db.pool.query(
      `INSERT INTO promotions (supplier_id, name, type, discount_value, status, starts_at, applies_to)
       VALUES ($1, 'Summer cheese', 'percentage_discount', 10, 'active', now() - interval '1 hour',
               'specific_shelves') RETURNING id`,
      [branch]
    )
    await db.pool.query('INSERT INTO promotion_targets (promotion_id, shelf_id) VALUES ($1, $2)', [
      deal.id,
      shelfId,
    ])
    const {
      rows: [wh],
    } = await db.pool.query(
      `INSERT INTO warehouse (supplier_id, tenant_id, name) VALUES ($1, $1, 'North depot') RETURNING id`,
      [branch]
    )
    const {
      rows: [rule],
    } = await db.pool.query(
      `INSERT INTO warehouse_routing_rule (supplier_id, warehouse_id, rule_type, shelf_id, is_active)
       VALUES ($1, $2, 'shelf', $3, true) RETURNING id`,
      [branch, wh.id, shelfId]
    )

    const refused = await call(sub, 'DELETE', `/api/products/shelves/${shelfId}`)
    expect(refused.status, JSON.stringify(refused.body)).toBe(409)
    expect(refused.body.error.name).toBe('SHELF_IN_USE')
    expect(refused.body.error.details).toEqual({
      deals: [{ id: deal.id, name: 'Summer cheese' }],
      rules: [{ id: rule.id, name: expect.stringContaining('North depot') }],
    })

    await db.pool.query("UPDATE promotions SET status = 'paused' WHERE id = $1", [deal.id])
    await db.pool.query('UPDATE warehouse_routing_rule SET is_active = false WHERE id = $1', [
      rule.id,
    ])
    const archived = await call(sub, 'DELETE', `/api/products/shelves/${shelfId}`)
    expect(archived.status, JSON.stringify(archived.body)).toBe(200)
    const {
      rows: [row],
    } = await db.pool.query('SELECT archived_at FROM supplier_shelf WHERE id = $1', [shelfId])
    expect(row.archived_at).not.toBeNull()
    expect((await call(sub, 'GET', '/api/products/shelves')).body.data.shelves).toEqual([])
  })

  it('reorders shelves in one call', async () => {
    const org = await createSupplierOrg(db.pool)
    const sub = org.users[0].userSub
    const a = await shelf(org.branchIds[0], 'A')
    const b = await shelf(org.branchIds[0], 'B')
    const res = await call(sub, 'PUT', '/api/products/shelves/order', { shelfIds: [b, a] })
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    const list = await call(sub, 'GET', '/api/products/shelves')
    expect(list.body.data.shelves.map((s) => s.id)).toEqual([b, a])
  })

  it('old supplier /categories CRUD is 404', async () => {
    const org = await createSupplierOrg(db.pool)
    const sub = org.users[0].userSub
    const anyId = leaf('cheese')
    expect((await call(sub, 'POST', '/api/products/categories', { name: 'Mine' })).status).toBe(404)
    expect(
      (await call(sub, 'PATCH', `/api/products/categories/${anyId}`, { name: 'X' })).status
    ).toBe(404)
    expect((await call(sub, 'DELETE', `/api/products/categories/${anyId}`)).status).toBe(404)
  })
})
