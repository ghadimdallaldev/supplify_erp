import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../apps/api/src/lib/auth.js', async (importOriginal) => {
  const { withTestAuth } = await import('./auth-mock.js')
  return withTestAuth(await importOriginal())
})
// Plan gates and limits are outside this suite's subject.
vi.mock('../../../apps/api/src/lib/subscription.js', async (importOriginal) => ({
  ...(await importOriginal()),
  requireFeature: () => (_req, _res, next) => next(),
  requireWithinLimit: () => (_req, _res, next) => next(),
  isFeatureEnabled: vi.fn(async () => true),
  checkLimit: vi.fn(async () => ({ allowed: true, isOverLimit: false, isUnlimited: true })),
  incrementUsage: vi.fn(async () => true),
}))

import { resetMarketplaceDb, startApiForTest, startMarketplaceDb } from './harness.js'
import { createProduct, createRestaurant, createSupplierOrg, follow } from './fixtures.js'

let db
let api
let cats
let importService
let dealService

beforeAll(async () => {
  db = await startMarketplaceDb()
  api = await startApiForTest()
  importService = await import('../../../apps/api/src/services/product-import.service.js')
  dealService = await import('../../../apps/api/src/services/deal-promotions.service.js')
}, 180_000)
afterAll(async () => {
  if (db) await resetMarketplaceDb(db.pool)
  await api?.close()
})
beforeEach(async () => {
  await resetMarketplaceDb(db.pool)
  const { rows } = await db.pool.query(
    'SELECT id, slug, parent_category_id, name, name_ar FROM product_category WHERE supplier_id IS NULL'
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

async function onShelf(productId, shelfId, supplierId) {
  await db.pool.query(
    'INSERT INTO product_shelf (product_id, shelf_id, supplier_id) VALUES ($1, $2, $3)',
    [productId, shelfId, supplierId]
  )
}

async function productRow(supplierId, sku) {
  const { rows } = await db.pool.query(
    `SELECT id, category, category_id, category_needs_review FROM product
     WHERE supplier_id = $1 AND sku = $2`,
    [supplierId, sku]
  )
  return rows[0]
}

async function activeDeal(supplierId, { appliesTo, targets, value = 10 }) {
  const {
    rows: [deal],
  } = await db.pool.query(
    `INSERT INTO promotions (supplier_id, name, type, discount_value, status, starts_at, applies_to,
                             boost_start_at, boost_end_at)
     VALUES ($1, 'Deal', 'percentage_discount', $2, 'active', now() - interval '1 hour', $3,
             now() - interval '1 hour', now() + interval '1 day')
     RETURNING id`,
    [supplierId, value, appliesTo]
  )
  for (const t of targets) {
    await db.pool.query(
      `INSERT INTO promotion_targets (promotion_id, product_id, category_id, shelf_id)
       VALUES ($1, $2, $3, $4)`,
      [deal.id, t.productId ?? null, t.categoryId ?? null, t.shelfId ?? null]
    )
  }
  return deal.id
}

describe('product import on platform categories and shelves (real PG)', () => {
  it('import matches category text', async () => {
    const org = await createSupplierOrg(db.pool)
    const branch = org.branchIds[0]
    const csv = 'name,sku,category\nBurrata pugliese,IMP-1,Cheese\nفطر,IMP-2,خضار\n'
    const preview = await importService.previewProductImport(csv)
    expect(preview.preview[0]).toMatchObject({
      matchedCategoryId: leaf('cheese'),
      matchedCategoryName: cats.cheese.name,
      needsReview: false,
      score: expect.any(Number),
    })
    const result = await importService.executeProductImport(branch, csv, {
      userId: org.users[0].userId,
    })
    expect(result.summary.created).toBe(2)
    expect(await productRow(branch, 'IMP-1')).toMatchObject({
      category: null,
      category_id: leaf('cheese'),
      category_needs_review: false,
    })
    expect((await productRow(branch, 'IMP-2')).category_id).toBe(leaf('vegetables'))
  })

  it('unknown category imports as other with review flag; a per-row categoryId wins', async () => {
    const org = await createSupplierOrg(db.pool)
    const branch = org.branchIds[0]
    const csv = 'name,sku,category\nZqxv item,IMP-3,Wibble\nZqxv two,IMP-4,Wibble\n'
    const preview = await importService.previewProductImport(csv)
    expect(preview.preview[0]).toMatchObject({
      matchedCategoryId: leaf('other'),
      needsReview: true,
    })
    // Overrides are keyed by the preview's rowNumber (the header is row 1).
    const result = await importService.executeProductImport(branch, csv, {
      userId: org.users[0].userId,
      categoryOverrides: { [preview.preview[0].rowNumber]: leaf('dairy') },
    })
    expect(result.summary).toMatchObject({ created: 2, failed: 0 })
    expect(await productRow(branch, 'IMP-3')).toMatchObject({
      category_id: leaf('dairy'),
      category_needs_review: false,
    })
    expect(await productRow(branch, 'IMP-4')).toMatchObject({
      category_id: leaf('other'),
      category_needs_review: true,
    })
  })

  it('a re-import with unknown text keeps an existing category', async () => {
    const org = await createSupplierOrg(db.pool)
    const branch = org.branchIds[0]
    await createProduct(db.pool, branch, { sku: 'IMP-5', categoryId: leaf('cheese') })
    await importService.executeProductImport(branch, 'name,sku,category\nRenamed,IMP-5,Wibble\n', {
      userId: org.users[0].userId,
    })
    expect(await productRow(branch, 'IMP-5')).toMatchObject({
      category_id: leaf('cheese'),
      category_needs_review: false,
    })
  })

  it('shelf column creates and links shelf', async () => {
    const org = await createSupplierOrg(db.pool)
    const branch = org.branchIds[0]
    const existing = await shelf(branch, 'Fridge')
    const csv =
      'name,sku,category,shelf\nBurrata,IMP-6,Cheese, fridge \nLabneh,IMP-7,Dairy,Weekly picks\nFeta,IMP-8,Cheese,Weekly Picks\n'
    const result = await importService.executeProductImport(branch, csv, {
      userId: org.users[0].userId,
    })
    expect(result.summary.created).toBe(3)
    const { rows: shelves } = await db.pool.query(
      `SELECT s.id, s.name, array_agg(p.sku ORDER BY p.sku) AS skus
       FROM supplier_shelf s JOIN product_shelf ps ON ps.shelf_id = s.id
       JOIN product p ON p.id = ps.product_id
       WHERE s.supplier_id = $1 GROUP BY s.id, s.name ORDER BY s.name`,
      [branch]
    )
    expect(shelves).toEqual([
      { id: existing, name: 'Fridge', skus: ['IMP-6'] },
      { id: expect.any(String), name: 'Weekly picks', skus: ['IMP-7', 'IMP-8'] },
    ])
    // the `section` alias works too
    await importService.executeProductImport(branch, 'name,sku,section\nTomme,IMP-9,Fridge\n', {
      userId: org.users[0].userId,
    })
    const { rows } = await db.pool.query(
      `SELECT ps.shelf_id FROM product_shelf ps JOIN product p ON p.id = ps.product_id
       WHERE p.sku = 'IMP-9' AND p.supplier_id = $1`,
      [branch]
    )
    expect(rows).toEqual([{ shelf_id: existing }])
  })
})

describe('deals on platform categories and shelves (real PG)', () => {
  it('deal by shelf discounts shelf products once even if also matched by category', async () => {
    const org = await createSupplierOrg(db.pool)
    const branch = org.branchIds[0]
    const r = await createRestaurant(db.pool)
    const promoShelf = await shelf(branch, 'Promo')
    const cheese = await createProduct(db.pool, branch, { categoryId: leaf('cheese') })
    const milk = await createProduct(db.pool, branch, { categoryId: leaf('dairy') })
    await onShelf(cheese.id, promoShelf, branch)
    const dealId = await activeDeal(branch, {
      appliesTo: 'specific_shelves',
      targets: [{ shelfId: promoShelf }, { categoryId: leaf('cheese') }, { productId: cheese.id }],
    })
    const preview = await dealService.previewDealForCart({
      promotionId: dealId,
      supplierId: branch,
      restaurantId: r.id,
      subtotal: 300,
      // a client-claimed category is ignored: the server reads the product's own
      lineItems: [
        { productId: cheese.id, quantity: 10, unitPrice: 10, lineTotal: 100 },
        {
          productId: milk.id,
          categoryId: leaf('cheese'),
          quantity: 20,
          unitPrice: 10,
          lineTotal: 200,
        },
      ],
    })
    expect(preview, JSON.stringify(preview)).toMatchObject({ eligible: true, discountAmount: 10 })
  })

  it('deal category target only own products', async () => {
    const org = await createSupplierOrg(db.pool)
    const other = await createSupplierOrg(db.pool)
    const r = await createRestaurant(db.pool)
    const theirs = await createProduct(db.pool, other.branchIds[0], { categoryId: leaf('cheese') })
    const mine = await createProduct(db.pool, org.branchIds[0], { categoryId: leaf('cheese') })
    const dealId = await activeDeal(org.branchIds[0], {
      appliesTo: 'specific_categories',
      targets: [{ categoryId: leaf('cheese') }],
    })
    const preview = await dealService.previewDealForCart({
      promotionId: dealId,
      supplierId: org.branchIds[0],
      restaurantId: r.id,
      subtotal: 100,
      lineItems: [{ productId: theirs.id, quantity: 10, unitPrice: 10, lineTotal: 100 }],
    })
    expect(preview.eligible).toBe(false)
    const eligible = await dealService.getEligibleProductsForDeal(dealId, org.branchIds[0])
    expect(eligible.map((p) => p.id)).toEqual([mine.id])
  })

  it('foreign shelf/category/product ids rejected in deals and routing', async () => {
    const org = await createSupplierOrg(db.pool)
    const other = await createSupplierOrg(db.pool)
    const sub = org.users[0].userSub
    const theirShelf = await shelf(other.branchIds[0], 'Theirs')
    const theirProduct = await createProduct(db.pool, other.branchIds[0], {
      categoryId: leaf('cheese'),
    })
    const base = {
      name: 'Ten off',
      description: 'Ten percent off selected items',
      type: 'percentage_discount',
      discountValue: 10,
      startsAt: new Date().toISOString(),
    }
    const cases = [
      [{ appliesTo: 'specific_shelves', shelfIds: [theirShelf] }, 'foreignShelf'],
      [{ appliesTo: 'specific_products', productIds: [theirProduct.id] }, 'foreignProducts'],
      [{ appliesTo: 'specific_categories', categoryIds: [dept('cheese')] }, 'categoryNotLeaf'],
    ]
    for (const [targets, code] of cases) {
      const res = await call(sub, 'POST', '/api/promotions', { ...base, ...targets })
      expect(res.status, JSON.stringify(res.body)).toBe(400)
      expect(res.body.error.code).toBe(code)
    }
    const { rows } = await db.pool.query(
      'SELECT count(*)::int AS n FROM promotions WHERE supplier_id = $1',
      [org.branchIds[0]]
    )
    expect(rows[0].n).toBe(0)

    const created = await call(sub, 'POST', '/api/promotions', {
      ...base,
      appliesTo: 'specific_categories',
      categoryIds: [leaf('cheese')],
    })
    expect(created.status, JSON.stringify(created.body)).toBe(201)
    expect(created.body.data.promotion).toMatchObject({ target_category_ids: [leaf('cheese')] })

    const {
      rows: [wh],
    } = await db.pool.query(
      `INSERT INTO warehouse (supplier_id, tenant_id, name) VALUES ($1, $1, 'Depot') RETURNING id`,
      [org.branchIds[0]]
    )
    const ruleCases = [
      [{ rule_type: 'shelf', shelf_id: theirShelf }, 'foreignShelf'],
      [{ rule_type: 'product', product_id: theirProduct.id }, 'foreignProducts'],
      [{ rule_type: 'category', category_id: dept('cheese') }, 'categoryNotLeaf'],
    ]
    for (const [target, code] of ruleCases) {
      const res = await call(sub, 'POST', '/api/warehouses/routing/rules', {
        warehouse_id: wh.id,
        ...target,
      })
      expect(res.status, JSON.stringify(res.body)).toBe(400)
      expect(res.body.error.code).toBe(code)
    }
  })
})

describe('warehouse routing and cadence (real PG)', () => {
  it('routing rule by shelf routes', async () => {
    const org = await createSupplierOrg(db.pool)
    const branch = org.branchIds[0]
    const sub = org.users[0].userSub
    const frozen = await shelf(branch, 'Frozen')
    const ice = await createProduct(db.pool, branch, { categoryId: leaf('cheese') })
    const bread = await createProduct(db.pool, branch, { categoryId: leaf('bakery-bread') })
    await onShelf(ice.id, frozen, branch)
    const warehouses = []
    for (const [name, isDefault] of [
      ['Main', true],
      ['Cold store', false],
    ]) {
      const {
        rows: [w],
      } = await db.pool.query(
        `INSERT INTO warehouse (supplier_id, tenant_id, name, is_default) VALUES ($1, $1, $2, $3)
         RETURNING id`,
        [branch, name, isDefault]
      )
      warehouses.push(w.id)
      for (const productId of [ice.id, bread.id]) {
        await db.pool.query(
          `INSERT INTO warehouse_inventory (warehouse_id, product_id, quantity_available,
                                            quantity_reserved, quantity_on_hand)
           VALUES ($1, $2, 100, 0, 100)`,
          [w.id, productId]
        )
      }
    }
    const created = await call(sub, 'POST', '/api/warehouses/routing/rules', {
      warehouse_id: warehouses[1],
      rule_type: 'shelf',
      shelf_id: frozen,
    })
    expect(created.status, JSON.stringify(created.body)).toBe(201)
    expect(created.body.data.rule).toMatchObject({ rule_type: 'shelf', shelf_id: frozen })

    const simulate = (items) => call(sub, 'POST', '/api/warehouses/routing/simulate', { items })
    const shelfRoute = await simulate([{ product_id: ice.id, quantity: 1 }])
    expect(shelfRoute.status, JSON.stringify(shelfRoute.body)).toBe(200)
    expect(shelfRoute.body.data.preview[0]).toMatchObject({
      warehouseId: warehouses[1],
      reason: 'shelf',
    })
    const plain = await simulate([{ product_id: bread.id, quantity: 1 }])
    expect(plain.body.data.preview[0].warehouseId).toBe(warehouses[0])
  })

  it('cadence label localised from platform category', async () => {
    const { recomputeCadencePatterns, listRestaurantReminders } = await import(
      '../../../apps/api/src/services/reorder-cadence.service.js'
    )
    const org = await createSupplierOrg(db.pool, { name: 'Fromagerie' })
    const branch = org.branchIds[0]
    const r = await createRestaurant(db.pool)
    // Four different cheeses, one per week on the same weekday: a category pattern, no
    // product pattern.
    for (let week = 1; week <= 4; week++) {
      const p = await createProduct(db.pool, branch, { categoryId: leaf('cheese') })
      const {
        rows: [o],
      } = await db.pool.query(
        `INSERT INTO customer_order (restaurant_id, status, total_amount, subtotal_amount, currency,
                                     supplier_organization_id, placed_at)
         VALUES ($1, 'DELIVERED', 10, 10, 'USD', $2, now() - make_interval(days => $3::int * 7))
         RETURNING id`,
        [r.id, org.orgId, week]
      )
      await db.pool.query(
        `INSERT INTO order_item (order_id, product_id, supplier_id, quantity, unit_price, line_total)
         VALUES ($1, $2, $3, 1, 10, 10)`,
        [o.id, p.id, branch]
      )
    }
    await recomputeCadencePatterns({ restaurantId: r.id })
    const en = await listRestaurantReminders(r.id, { locale: 'en' })
    expect(en).toEqual([
      expect.objectContaining({
        cadenceLevel: 'category',
        label: `${cats.cheese.name} from Fromagerie`,
      }),
    ])
    const ar = await listRestaurantReminders(r.id, { locale: 'ar' })
    expect(ar[0].label).toContain(cats.cheese.name_ar)
    expect(ar[0].label).toContain('Fromagerie')
  })
})

describe('supplier page shelves and categories for restaurants (real PG)', () => {
  it('lists active non-empty shelves in order and the leaf categories with visible counts', async () => {
    const org = await createSupplierOrg(db.pool, { name: 'Shelf Foods' })
    const sid = org.branchIds[0]
    const rest = await createRestaurant(db.pool)
    const bread = await createProduct(db.pool, sid, { categoryId: leaf('bakery-bread') })
    const cheese = await createProduct(db.pool, sid, { categoryId: leaf('cheese') })
    await createProduct(db.pool, sid, { categoryId: leaf('cheese') })
    const morning = await shelf(sid, 'Morning')
    const deli = await shelf(sid, 'Deli')
    const empty = await shelf(sid, 'Empty')
    const gone = await shelf(sid, 'Gone')
    await db.pool.query('UPDATE supplier_shelf SET display_order = 2 WHERE id = $1', [morning])
    await db.pool.query('UPDATE supplier_shelf SET display_order = 1 WHERE id = $1', [deli])
    await db.pool.query('UPDATE supplier_shelf SET archived_at = now() WHERE id = $1', [gone])
    await onShelf(bread.id, morning, sid)
    await onShelf(cheese.id, morning, sid)
    await onShelf(cheese.id, deli, sid)
    await onShelf(bread.id, gone, sid)

    const res = await call(rest.userSub, 'GET', `/api/suppliers/${org.orgId}`)
    expect(res.status).toBe(200)
    const { shelves, categories } = res.body.data.supplier
    expect(shelves.map((s) => [s.name, s.product_count])).toEqual([
      ['Deli', 1],
      ['Morning', 2],
    ])
    expect(shelves.find((s) => s.id === empty)).toBeUndefined()
    expect(Object.fromEntries(categories.map((c) => [c.slug, c.product_count]))).toEqual({
      'bakery-bread': 1,
      cheese: 2,
    })
    const cheeseRow = categories.find((c) => c.slug === 'cheese')
    expect(cheeseRow).toMatchObject({
      id: leaf('cheese'),
      name_ar: cats.cheese.name_ar,
      department_id: dept('cheese'),
    })

    const shelfPage = await call(
      rest.userSub,
      'GET',
      `/api/products?supplier=${org.orgId}&shelfId=${deli}`
    )
    expect(shelfPage.body.data.products.map((p) => p.id)).toEqual([cheese.id])
  })

  it("a supplier's own product list carries each product's active shelf ids", async () => {
    const org = await createSupplierOrg(db.pool)
    const sid = org.branchIds[0]
    const p = await createProduct(db.pool, sid, { categoryId: leaf('cheese') })
    const bare = await createProduct(db.pool, sid, { categoryId: leaf('cheese') })
    const deli = await shelf(sid, 'Deli')
    const gone = await shelf(sid, 'Gone')
    await onShelf(p.id, deli, sid)
    await onShelf(p.id, gone, sid)
    await db.pool.query('UPDATE supplier_shelf SET archived_at = now() WHERE id = $1', [gone])

    const res = await call(org.users[0].userSub, 'GET', '/api/products?limit=10')
    expect(res.status).toBe(200)
    const byId = Object.fromEntries(res.body.data.products.map((row) => [row.id, row]))
    expect(byId[p.id].shelf_ids).toEqual([deli])
    expect(byId[bare.id].shelf_ids).toEqual([])
  })

  it('a followers-only catalog shows no shelves or categories until the restaurant follows', async () => {
    const org = await createSupplierOrg(db.pool, { publicCatalog: false })
    const sid = org.branchIds[0]
    const rest = await createRestaurant(db.pool)
    const p = await createProduct(db.pool, sid, { categoryId: leaf('cheese') })
    await onShelf(p.id, await shelf(sid, 'Deli'), sid)

    const before = await call(rest.userSub, 'GET', `/api/suppliers/${org.orgId}`)
    expect(before.body.data.supplier.shelves).toEqual([])
    expect(before.body.data.supplier.categories).toEqual([])

    await follow(db.pool, rest.id, org.orgId)
    const after = await call(rest.userSub, 'GET', `/api/suppliers/${org.orgId}`)
    expect(after.body.data.supplier.shelves.map((s) => s.name)).toEqual(['Deli'])
    expect(after.body.data.supplier.categories.map((c) => c.slug)).toEqual(['cheese'])
  })
})
