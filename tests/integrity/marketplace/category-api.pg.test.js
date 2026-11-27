import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../apps/api/src/lib/auth.js', async (importOriginal) => {
  const { withTestAuth } = await import('./auth-mock.js')
  return withTestAuth(await importOriginal())
})
// Plan gates are outside this suite's subject (inventory management is plan-gated).
vi.mock('../../../apps/api/src/lib/subscription.js', async (importOriginal) => ({
  ...(await importOriginal()),
  requireFeature: () => (_req, _res, next) => next(),
}))

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
let categoryIds

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
  categoryIds = Object.fromEntries(rows.map((r) => [r.slug, r]))
})

const id = (slug) => categoryIds[slug].id
const deptOf = (slug) => categoryIds[slug].parent_category_id

async function get(sub, path) {
  const res = await fetch(`${api.baseUrl}${path}`, { headers: { 'x-test-user': sub } })
  return { status: res.status, body: await res.json().catch(() => null) }
}

async function tree(sub) {
  const res = await get(sub, '/api/products/categories')
  expect(res.status, JSON.stringify(res.body)).toBe(200)
  return res.body.data.departments
}

const leaves = (departments) => departments.flatMap((d) => d.categories)

describe('GET /api/products/categories (real PG)', () => {
  it('tree nests leaves under departments', async () => {
    const org = await createSupplierOrg(db.pool)
    await createProduct(db.pool, org.branchIds[0], { categoryId: id('cheese') })
    const departments = await tree(org.users[0].userSub)
    // Suppliers get the full tree with their own counts.
    const dairy = departments.find((d) => d.id === deptOf('cheese'))
    expect(dairy.categories.find((c) => c.slug === 'cheese').product_count).toBe(1)
    expect(dairy.product_count).toBe(1)
    expect(leaves(departments).find((c) => c.slug === 'vegetables').product_count).toBe(0)
    for (const d of departments) {
      for (const c of d.categories) expect(categoryIds[c.slug].parent_category_id).toBe(d.id)
    }
  })

  it('restaurant counts are per-viewer and exclude private and blocked suppliers', async () => {
    const open = await createSupplierOrg(db.pool, { publicCatalog: true })
    const closed = await createSupplierOrg(db.pool, { publicCatalog: false })
    const blocked = await createSupplierOrg(db.pool, { publicCatalog: true })
    await createProduct(db.pool, open.branchIds[0], { categoryId: id('cheese') })
    await createProduct(db.pool, closed.branchIds[0], { categoryId: id('cheese') })
    await createProduct(db.pool, closed.branchIds[0], { categoryId: id('vegetables') })
    await createProduct(db.pool, blocked.branchIds[0], { categoryId: id('olive-oil') })
    const follower = await createRestaurant(db.pool)
    const stranger = await createRestaurant(db.pool)
    await follow(db.pool, follower.id, closed.orgId)
    await block(db.pool, follower.id, blocked.orgId)

    const forFollower = leaves(await tree(follower.userSub))
    expect(forFollower.find((c) => c.slug === 'cheese').product_count).toBe(2)
    expect(forFollower.find((c) => c.slug === 'vegetables').product_count).toBe(1)
    expect(forFollower.find((c) => c.slug === 'olive-oil')).toBeUndefined()

    const strangerTree = await tree(stranger.userSub)
    const forStranger = leaves(strangerTree)
    expect(forStranger.find((c) => c.slug === 'cheese').product_count).toBe(1)
    // Empty nodes are omitted for restaurants.
    expect(forStranger.find((c) => c.slug === 'vegetables')).toBeUndefined()
    expect(forStranger.find((c) => c.slug === 'olive-oil').product_count).toBe(1)
    expect(strangerTree.every((d) => d.categories.length > 0 && d.product_count > 0)).toBe(true)
  })

  it('counts distinct products', async () => {
    const org = await createSupplierOrg(db.pool)
    const branch = org.branchIds[0]
    const p = await createProduct(db.pool, branch, { categoryId: id('cheese') })
    const shelves = []
    for (const name of ['Fridge', 'Promo']) {
      const {
        rows: [s],
      } = await db.pool.query(
        'INSERT INTO supplier_shelf (supplier_id, name) VALUES ($1, $2) RETURNING id',
        [branch, name]
      )
      shelves.push(s.id)
      await db.pool.query(
        'INSERT INTO product_shelf (product_id, shelf_id, supplier_id) VALUES ($1, $2, $3)',
        [p.id, s.id, branch]
      )
    }
    const r = await createRestaurant(db.pool)
    const cheese = leaves(await tree(r.userSub)).find((c) => c.slug === 'cheese')
    expect(cheese.product_count).toBe(1)
  })
})

describe('GET /api/products?categoryId= (real PG)', () => {
  it('department filter includes leaves', async () => {
    const org = await createSupplierOrg(db.pool)
    const cheese = await createProduct(db.pool, org.branchIds[0], { categoryId: id('cheese') })
    const milk = await createProduct(db.pool, org.branchIds[0], { categoryId: id('dairy') })
    const tomato = await createProduct(db.pool, org.branchIds[0], { categoryId: id('vegetables') })
    const r = await createRestaurant(db.pool)

    const byDept = await get(r.userSub, `/api/products?categoryId=${deptOf('cheese')}&limit=50`)
    expect(byDept.status, JSON.stringify(byDept.body)).toBe(200)
    const ids = byDept.body.data.products.map((p) => p.id).sort()
    expect(ids).toEqual([cheese.id, milk.id].sort())
    expect(ids).not.toContain(tomato.id)

    const byLeaf = await get(r.userSub, `/api/products?categoryId=${id('cheese')}&limit=50`)
    const [row] = byLeaf.body.data.products
    expect(byLeaf.body.data.products).toHaveLength(1)
    expect(row).toMatchObject({
      id: cheese.id,
      category_id: id('cheese'),
      category_name: expect.any(String),
      category_name_ar: expect.any(String),
      department_id: deptOf('cheese'),
    })
    expect(row.category).toBe(row.category_name)
  })

  it('a product on a supplier-owned or non-leaf id reads as Other', async () => {
    const org = await createSupplierOrg(db.pool)
    const p = await createProduct(db.pool, org.branchIds[0], { categoryId: null })
    const r = await createRestaurant(db.pool)
    const res = await get(r.userSub, `/api/products?categoryId=${id('other')}&limit=50`)
    expect(res.body.data.products.map((x) => x.id)).toEqual([p.id])
    expect(res.body.data.products[0].category_id).toBe(id('other'))
  })
})

describe('category search (real PG)', () => {
  it('search finds category for خبز and pain', async () => {
    const org = await createSupplierOrg(db.pool)
    const loaf = await createProduct(db.pool, org.branchIds[0], {
      name: 'Sourdough loaf',
      categoryId: id('bakery-bread'),
    })
    const r = await createRestaurant(db.pool)
    for (const q of ['خبز', 'pain']) {
      const res = await get(r.userSub, `/api/search?q=${encodeURIComponent(q)}&grouped=true`)
      expect(res.status, JSON.stringify(res.body)).toBe(200)
      expect(res.body.data.categories[0]).toMatchObject({
        id: id('bakery-bread'),
        slug: 'bakery-bread',
        name: expect.any(String),
        name_ar: expect.any(String),
        department_id: deptOf('bakery-bread'),
        product_count: 1,
      })
      // q hits the category name → products in that category, though the name does not match.
      expect(res.body.data.products.map((p) => p.id)).toContain(loaf.id)
      const list = await get(r.userSub, `/api/products?q=${encodeURIComponent(q)}&limit=50`)
      expect(list.body.data.products.map((p) => p.id)).toContain(loaf.id)
    }
  })

  it('restaurants do not see categories with no visible products', async () => {
    const closed = await createSupplierOrg(db.pool, { publicCatalog: false })
    await createProduct(db.pool, closed.branchIds[0], { categoryId: id('bakery-bread') })
    const r = await createRestaurant(db.pool)
    const res = await get(r.userSub, `/api/search?q=pain&grouped=true`)
    expect(res.body.data.categories).toEqual([])
  })

  it('category-suggestions names leaves and auto-selects a confident match', async () => {
    const org = await createSupplierOrg(db.pool)
    const res = await get(
      org.users[0].userSub,
      `/api/products/category-suggestions?name=${encodeURIComponent('Tomato paste 400g')}`
    )
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    expect(res.body.data.autoCategoryId).toBe(id('tomato-products'))
    expect(res.body.data.suggestions[0]).toMatchObject({
      categoryId: id('tomato-products'),
      departmentName: expect.any(String),
    })
    const r = await createRestaurant(db.pool)
    const denied = await get(r.userSub, '/api/products/category-suggestions?name=bread')
    expect(denied.status).toBe(403)
  })
})

describe('readers on platform categories (real PG)', () => {
  it('spend report groups by platform category with department', async () => {
    const org = await createSupplierOrg(db.pool)
    const supplierId = org.branchIds[0]
    const r = await createRestaurant(db.pool)
    const cheese = await createProduct(db.pool, supplierId, {
      categoryId: id('cheese'),
      category: 'Fromages', // legacy text is ignored
    })
    await createOrder(db.pool, { restaurantId: r.id, supplierId, productId: cheese.id, price: 10 })
    await createOrder(db.pool, { restaurantId: r.id, supplierId, productId: cheese.id, price: 5 })
    // The order fixture leaves placed_at NULL; the report reads placed orders only.
    await db.pool.query('UPDATE customer_order SET placed_at = now() WHERE restaurant_id = $1', [
      r.id,
    ])
    const reports = await import('../../../apps/api/src/services/reports.service.js')
    const { data } = await reports.restaurantSpendByCategory(r.id, {
      from: new Date(Date.now() - 86_400_000),
      to: new Date(Date.now() + 86_400_000),
    })
    const cheeseRow = data.find((row) => row.category_id === id('cheese'))
    expect(cheeseRow).toMatchObject({
      category: expect.any(String),
      category_name_ar: expect.any(String),
      department_id: deptOf('cheese'),
      department_name: expect.any(String),
    })
    expect(Number(cheeseRow.total_spend)).toBe(15)
    expect(cheeseRow.order_count).toBe(2)
    expect(data.find((row) => row.category === 'Fromages')).toBeUndefined()
  })

  it('orders calendar filters by platform category and lists categories as objects', async () => {
    const org = await createSupplierOrg(db.pool)
    const supplierId = org.branchIds[0]
    const r = await createRestaurant(db.pool)
    const cheese = await createProduct(db.pool, supplierId, { categoryId: id('cheese') })
    const tomato = await createProduct(db.pool, supplierId, { categoryId: id('vegetables') })
    const cheeseOrder = await createOrder(db.pool, {
      restaurantId: r.id,
      supplierId,
      productId: cheese.id,
    })
    await createOrder(db.pool, { restaurantId: r.id, supplierId, productId: tomato.id })
    await db.pool.query('UPDATE customer_order SET placed_at = now() WHERE restaurant_id = $1', [
      r.id,
    ])

    const all = await get(r.userSub, '/api/orders/calendar')
    expect(all.status, JSON.stringify(all.body)).toBe(200)
    expect(all.body.data.filters.categories.map((c) => c.id).sort()).toEqual(
      [id('cheese'), id('vegetables')].sort()
    )
    expect(all.body.data.filters.categories[0]).toMatchObject({
      name: expect.any(String),
      name_ar: expect.any(String),
    })

    const byDept = await get(r.userSub, `/api/orders/calendar?categoryId=${deptOf('cheese')}`)
    expect(byDept.status, JSON.stringify(byDept.body)).toBe(200)
    const orderIds = [...new Set(byDept.body.data.events.map((e) => e.orderId))]
    expect(orderIds).toEqual([cheeseOrder.id])
    expect(byDept.body.data.events[0].categories).toEqual([
      expect.objectContaining({ id: id('cheese') }),
    ])
  })

  it('inventory category filter uses platform category', async () => {
    const org = await createSupplierOrg(db.pool)
    const r = await createRestaurant(db.pool)
    const cheese = await createProduct(db.pool, org.branchIds[0], {
      categoryId: id('cheese'),
      category: 'Vegetables', // stale legacy text must not match
    })
    const tomato = await createProduct(db.pool, org.branchIds[0], { categoryId: id('vegetables') })
    for (const p of [cheese, tomato]) {
      await db.pool.query(
        'INSERT INTO restaurant_inventory (restaurant_id, product_id, quantity) VALUES ($1, $2, 3)',
        [r.id, p.id]
      )
    }
    const byLeaf = await get(r.userSub, `/api/restaurant-inventory?categoryId=${id('vegetables')}`)
    expect(byLeaf.status, JSON.stringify(byLeaf.body)).toBe(200)
    const items = byLeaf.body.data.inventory
    expect(items.map((i) => i.product_id)).toEqual([tomato.id])
    expect(items[0]).toMatchObject({
      product_category_id: id('vegetables'),
      product_category: expect.any(String),
    })

    const byDept = await get(r.userSub, `/api/restaurant-inventory?categoryId=${deptOf('cheese')}`)
    const deptItems = byDept.body.data.inventory
    expect(deptItems.map((i) => i.product_id)).toEqual([cheese.id])
  })
})
