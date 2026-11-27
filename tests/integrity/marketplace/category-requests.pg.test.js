import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../apps/api/src/lib/auth.js', async (importOriginal) => {
  const { withTestAuth } = await import('./auth-mock.js')
  return withTestAuth(await importOriginal())
})

import { randomUUID } from 'node:crypto'
import { resetMarketplaceDb, startApiForTest, startMarketplaceDb } from './harness.js'
import { createProduct, createSupplierOrg } from './fixtures.js'

let db
let api
let cats
let service

beforeAll(async () => {
  db = await startMarketplaceDb()
  api = await startApiForTest()
  service = await import('../../../apps/api/src/services/category-requests.service.js')
}, 180_000)
afterAll(async () => {
  // Approvals add platform categories; the next process snapshots the tree at start-up, so
  // leave it exactly as seeded.
  if (db) await resetMarketplaceDb(db.pool)
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

async function adminUser() {
  const {
    rows: [u],
  } = await db.pool.query(
    `INSERT INTO app_user (keycloak_sub, email, display_name, role)
     VALUES ($1, $2, 'Admin', 'ADMIN') RETURNING id`,
    [`test-admin-${randomUUID()}`, `admin-${randomUUID().slice(0, 8)}@marketplace.test`]
  )
  return u.id
}

async function requestFor(org, name, productIds) {
  const res = await call(org.users[0].userSub, 'POST', '/api/products/category-requests', {
    proposedName: name,
    proposedParentId: dept('cheese'),
    productIds,
  })
  expect(res.status, JSON.stringify(res.body)).toBe(201)
  return res.body.data.request
}

async function productRows(ids) {
  const { rows } = await db.pool.query(
    `SELECT id, category_id, category_needs_review, category_request_id FROM product
     WHERE id = ANY($1::uuid[]) ORDER BY id`,
    [ids]
  )
  return rows
}

describe('supplier category requests (real PG)', () => {
  it('a request parks its products on Other for review', async () => {
    const org = await createSupplierOrg(db.pool)
    const p = await createProduct(db.pool, org.branchIds[0], { categoryId: leaf('cheese') })
    const request = await requestFor(org, 'Truffles', [p.id])
    expect(request).toMatchObject({ status: 'pending', proposed_name: 'Truffles' })
    expect(await productRows([p.id])).toEqual([
      {
        id: p.id,
        category_id: leaf('other'),
        category_needs_review: true,
        category_request_id: request.id,
      },
    ])
  })

  it('duplicate pending request is 409', async () => {
    const org = await createSupplierOrg(db.pool)
    const p = await createProduct(db.pool, org.branchIds[0], { categoryId: leaf('cheese') })
    const first = await requestFor(org, 'Truffles', [p.id])
    const dup = await call(org.users[0].userSub, 'POST', '/api/products/category-requests', {
      proposedName: ' truffle ',
      productIds: [p.id],
    })
    expect(dup.status, JSON.stringify(dup.body)).toBe(409)
    expect(dup.body.error).toMatchObject({
      name: 'CATEGORY_REQUEST_EXISTS',
      details: { existingId: first.id },
    })
    // Another supplier may ask for the same name.
    const other = await createSupplierOrg(db.pool)
    const q = await createProduct(db.pool, other.branchIds[0], { categoryId: leaf('cheese') })
    await requestFor(other, 'Truffles', [q.id])
  })

  it('foreign productIds rejected', async () => {
    const org = await createSupplierOrg(db.pool)
    const other = await createSupplierOrg(db.pool)
    const theirs = await createProduct(db.pool, other.branchIds[0], { categoryId: leaf('cheese') })
    const res = await call(org.users[0].userSub, 'POST', '/api/products/category-requests', {
      proposedName: 'Truffles',
      productIds: [theirs.id],
    })
    expect(res.status, JSON.stringify(res.body)).toBe(400)
    expect(res.body.error.code).toBe('foreignProducts')
    expect((await productRows([theirs.id]))[0].category_id).toBe(leaf('cheese'))
  })

  it('a supplier lists only its own requests', async () => {
    const org = await createSupplierOrg(db.pool)
    const other = await createSupplierOrg(db.pool)
    const p = await createProduct(db.pool, org.branchIds[0], { categoryId: leaf('cheese') })
    const q = await createProduct(db.pool, other.branchIds[0], { categoryId: leaf('cheese') })
    const mine = await requestFor(org, 'Truffles', [p.id])
    await requestFor(other, 'Caviar', [q.id])
    const res = await call(org.users[0].userSub, 'GET', '/api/products/category-requests')
    expect(res.status).toBe(200)
    expect(res.body.data.requests.map((r) => r.id)).toEqual([mine.id])
  })
})

describe('admin resolution (real PG)', () => {
  it('concurrent approvals create one category', async () => {
    const org = await createSupplierOrg(db.pool)
    const p = await createProduct(db.pool, org.branchIds[0], { categoryId: leaf('cheese') })
    const request = await requestFor(org, 'Truffles', [p.id])
    const adminId = await adminUser()
    const results = await Promise.allSettled([
      service.approveCategoryRequest(
        request.id,
        { parentId: dept('cheese') },
        { adminUserId: adminId }
      ),
      service.approveCategoryRequest(
        request.id,
        { parentId: dept('cheese') },
        { adminUserId: adminId }
      ),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find((r) => r.status === 'rejected')
    expect(rejected.reason).toMatchObject({ name: 'CATEGORY_REQUEST_RESOLVED', statusCode: 409 })
    const { rows } = await db.pool.query(
      `SELECT id FROM product_category WHERE supplier_id IS NULL AND lower(name) = 'truffles'`
    )
    expect(rows).toHaveLength(1)
  })

  it('approve after reject is 409, and nothing changes', async () => {
    const org = await createSupplierOrg(db.pool)
    const p = await createProduct(db.pool, org.branchIds[0], { categoryId: leaf('cheese') })
    const request = await requestFor(org, 'Truffles', [p.id])
    const adminId = await adminUser()
    await service.rejectCategoryRequest(
      request.id,
      { note: 'Use Cheese' },
      { adminUserId: adminId }
    )
    await expect(
      service.approveCategoryRequest(
        request.id,
        { parentId: dept('cheese') },
        { adminUserId: adminId }
      )
    ).rejects.toMatchObject({ name: 'CATEGORY_REQUEST_RESOLVED' })
    await expect(
      service.mergeCategoryRequest(
        request.id,
        { categoryId: leaf('cheese') },
        { adminUserId: adminId }
      )
    ).rejects.toMatchObject({ name: 'CATEGORY_REQUEST_RESOLVED' })
    const {
      rows: [row],
    } = await db.pool.query('SELECT status, admin_note FROM category_request WHERE id = $1', [
      request.id,
    ])
    expect(row).toEqual({ status: 'rejected', admin_note: 'Use Cheese' })
    expect((await productRows([p.id]))[0]).toMatchObject({
      category_id: leaf('other'),
      category_needs_review: true,
    })
  })

  it('approve moves all flagged products', async () => {
    const org = await createSupplierOrg(db.pool)
    const branch = org.branchIds[0]
    const p1 = await createProduct(db.pool, branch, { categoryId: leaf('cheese') })
    const p2 = await createProduct(db.pool, branch, { categoryId: leaf('dairy') })
    const request = await requestFor(org, 'Truffles', [p1.id, p2.id])
    const adminId = await adminUser()
    const result = await service.approveCategoryRequest(
      request.id,
      {
        parentId: dept('cheese'),
        name: 'Truffles & Mushrooms',
        name_ar: 'كمأة',
        aliases: ['truffe'],
      },
      { adminUserId: adminId }
    )
    expect(result.category).toMatchObject({
      name: 'Truffles & Mushrooms',
      name_ar: 'كمأة',
      parent_category_id: dept('cheese'),
      supplier_id: null,
    })
    expect(result.movedProducts).toBe(2)
    for (const row of await productRows([p1.id, p2.id])) {
      expect(row).toMatchObject({ category_id: result.category.id, category_needs_review: false })
    }
    const {
      rows: [req],
    } = await db.pool.query(
      'SELECT status, resolved_category_id, resolved_by FROM category_request WHERE id = $1',
      [request.id]
    )
    expect(req).toEqual({
      status: 'approved',
      resolved_category_id: result.category.id,
      resolved_by: adminId,
    })
  })

  it('merge maps to an existing leaf and learns the proposed name as an alias', async () => {
    const org = await createSupplierOrg(db.pool)
    const p = await createProduct(db.pool, org.branchIds[0], { categoryId: leaf('cheese') })
    const request = await requestFor(org, 'Halloumi blocks', [p.id])
    const adminId = await adminUser()
    await service.mergeCategoryRequest(
      request.id,
      { categoryId: leaf('cheese') },
      { adminUserId: adminId }
    )
    expect((await productRows([p.id]))[0]).toMatchObject({
      category_id: leaf('cheese'),
      category_needs_review: false,
    })
    const {
      rows: [c],
    } = await db.pool.query('SELECT aliases FROM product_category WHERE id = $1', [leaf('cheese')])
    expect(c.aliases).toContain('Halloumi blocks')
    await expect(
      service.mergeCategoryRequest(
        request.id,
        { categoryId: dept('cheese') },
        { adminUserId: adminId }
      )
    ).rejects.toMatchObject({ name: 'CATEGORY_REQUEST_RESOLVED' })
  })

  it('merge into a department is refused', async () => {
    const org = await createSupplierOrg(db.pool)
    const p = await createProduct(db.pool, org.branchIds[0], { categoryId: leaf('cheese') })
    const request = await requestFor(org, 'Truffles', [p.id])
    await expect(
      service.mergeCategoryRequest(
        request.id,
        { categoryId: dept('cheese') },
        { adminUserId: null }
      )
    ).rejects.toMatchObject({ name: 'VALIDATION_ERROR', code: 'categoryNotLeaf' })
  })

  it('the supplier is notified when the request is resolved', async () => {
    const org = await createSupplierOrg(db.pool)
    const p = await createProduct(db.pool, org.branchIds[0], { categoryId: leaf('cheese') })
    const request = await requestFor(org, 'Truffles', [p.id])
    await service.approveCategoryRequest(
      request.id,
      { parentId: dept('cheese') },
      { adminUserId: null }
    )
    const { rows } = await db.pool.query(
      `SELECT notification_type, reference_id FROM notification_log WHERE user_id = $1`,
      [org.users[0].userId]
    )
    expect(rows).toEqual(
      expect.arrayContaining([
        { notification_type: 'CATEGORY_REQUEST_RESOLVED', reference_id: request.id },
      ])
    )
  })
})
