import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { resetMarketplaceDb, startMarketplaceDb } from './harness.js'
import { createProduct, createRestaurant, createSupplierOrg } from './fixtures.js'

/** Plan B Task 3: locked, resumable, verified category backfill (real PostgreSQL). */

let db
let backfill
let leafSql

async function newSupplier() {
  return (await createSupplierOrg(db.pool)).branchIds[0]
}

async function platformId(slug) {
  const { rows } = await db.pool.query(
    'SELECT id FROM product_category WHERE slug = $1 AND supplier_id IS NULL',
    [slug]
  )
  return rows[0].id
}

async function supplierCategory(supplierId, name, order = 0) {
  const { rows } = await db.pool.query(
    `INSERT INTO product_category (name, slug, supplier_id, display_order)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [
      name,
      `${supplierId}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${order}`,
      supplierId,
      order,
    ]
  )
  return rows[0].id
}

async function promotion(supplierId, appliesTo) {
  const { rows } = await db.pool.query(
    `INSERT INTO promotions (supplier_id, name, type, discount_value, applies_to, status, starts_at)
     VALUES ($1, 'Deal', 'percentage_discount', 10, $2, 'active', now()) RETURNING id`,
    [supplierId, appliesTo]
  )
  return rows[0].id
}

async function warehouse(supplierId) {
  const { rows } = await db.pool.query(
    `INSERT INTO warehouse (supplier_id, tenant_id, name) VALUES ($1, $1, 'Main') RETURNING id`,
    [supplierId]
  )
  return rows[0].id
}

async function cadence(
  restaurantId,
  supplierId,
  { level, categoryId = null, productId = null, dow = 1, active = true }
) {
  const { rows } = await db.pool.query(
    `INSERT INTO restaurant_order_cadence
       (restaurant_id, supplier_id, product_id, category_id, cadence_level, day_of_week, label,
        confidence_score, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, 'Weekly', 80, $7) RETURNING id`,
    [restaurantId, supplierId, productId, categoryId, level, dow, active]
  )
  return rows[0].id
}

async function productRow(id) {
  const { rows } = await db.pool.query(
    `SELECT p.category_id, c.slug, p.category_needs_review, p.updated_at
     FROM product p LEFT JOIN product_category c ON c.id = p.category_id WHERE p.id = $1`,
    [id]
  )
  return rows[0]
}

async function runRow() {
  const { rows } = await db.pool.query(
    `SELECT * FROM data_migration_run WHERE name = 'category-backfill'`
  )
  return rows[0]
}

beforeAll(async () => {
  db = await startMarketplaceDb()
  backfill = await import('../../../apps/api/src/lib/category-backfill.js')
  leafSql = await import('../../../apps/api/src/lib/category-sql.js')
})

beforeEach(async () => {
  await resetMarketplaceDb(db.pool)
  await db.pool.query(`DELETE FROM data_migration_run WHERE name = 'category-backfill'`)
})

afterAll(async () => {
  await resetMarketplaceDb(db.pool)
  await db.pool.query(`DELETE FROM data_migration_run WHERE name = 'category-backfill'`)
  await backfill.runCategoryBackfill()
})

describe('before the backfill', () => {
  it('cadence job keeps inserting with supplier-owned ids before the backfill (trigger allowance)', async () => {
    const supplierId = await newSupplier()
    const restaurant = await createRestaurant(db.pool)
    const own = await supplierCategory(supplierId, 'Veg')
    await cadence(restaurant.id, supplierId, { level: 'category', categoryId: own })
    await db.pool.query(
      `UPDATE restaurant_order_cadence SET category_id = $1 WHERE supplier_id = $2`,
      [own, supplierId]
    )
  })

  it('promotion target with both ids is split into two rows', async () => {
    const supplierId = await newSupplier()
    const product = await createProduct(db.pool, supplierId)
    const promotionId = await promotion(supplierId, 'specific_products')
    const dairy = await platformId('dairy')
    // The test DB persists between runs: drop the check only if present, always restore it.
    await db.pool.query(
      'ALTER TABLE promotion_targets DROP CONSTRAINT IF EXISTS promotion_targets_exactly_one_target'
    )
    try {
      await db.pool.query(
        `INSERT INTO promotion_targets (promotion_id, product_id, category_id) VALUES ($1, $2, $3)`,
        [promotionId, product.id, dairy]
      )
      const { splitMigrationStatements } = await import('../../../apps/api/src/lib/sql-migrator.js')
      const sql = readFileSync(
        new URL(
          '../../../apps/api/db/migrations/0240_platform_category_tree_and_shelves.sql',
          import.meta.url
        ),
        'utf8'
      )
      for (const statement of splitMigrationStatements(sql)) await db.pool.query(statement)
    } finally {
      await db.pool.query(
        'DELETE FROM promotion_targets WHERE num_nonnulls(product_id, category_id, shelf_id) <> 1'
      )
      await db.pool.query(`DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'promotion_targets_exactly_one_target') THEN
          ALTER TABLE promotion_targets ADD CONSTRAINT promotion_targets_exactly_one_target
            CHECK (num_nonnulls(product_id, category_id, shelf_id) = 1);
        END IF;
      END $$`)
    }
    const { rows } = await db.pool.query(
      `SELECT product_id, category_id FROM promotion_targets WHERE promotion_id = $1
       ORDER BY product_id NULLS LAST`,
      [promotionId]
    )
    expect(rows).toEqual([
      { product_id: product.id, category_id: null },
      { product_id: null, category_id: dairy },
    ])
  })
})

describe('runCategoryBackfill', () => {
  it('merges colliding supplier categories into one shelf', async () => {
    const supplierId = await newSupplier()
    const a = await supplierCategory(supplierId, 'Bread', 0)
    const b = await supplierCategory(supplierId, 'Breads', 1)
    const c = await supplierCategory(supplierId, 'bread ', 2)
    const p1 = await createProduct(db.pool, supplierId, { name: 'Sourdough loaf', categoryId: a })
    const p2 = await createProduct(db.pool, supplierId, { name: 'Burger buns', categoryId: b })
    const p3 = await createProduct(db.pool, supplierId, { name: 'Toast bread', categoryId: c })

    const stats = await backfill.runCategoryBackfill()

    const { rows: shelves } = await db.pool.query(
      'SELECT id, name FROM supplier_shelf WHERE supplier_id = $1',
      [supplierId]
    )
    expect(shelves).toHaveLength(1)
    expect(shelves[0].name).toBe('Bread')
    const { rows: links } = await db.pool.query(
      'SELECT product_id FROM product_shelf WHERE shelf_id = $1 ORDER BY product_id',
      [shelves[0].id]
    )
    expect(links.map((l) => l.product_id).sort()).toEqual([p1.id, p2.id, p3.id].sort())
    expect(stats.shelvesCreated).toBe(1)
    expect(stats.shelvesMerged).toBe(2)
    const { rows: left } = await db.pool.query(
      'SELECT count(*)::int AS n FROM product_category WHERE supplier_id = $1',
      [supplierId]
    )
    expect(left[0].n).toBe(0)
    expect((await runRow()).status).toBe('verified')
  })

  it('rewrites deal and routing targets before deleting the category; deal still discounts the same products', async () => {
    const supplierId = await newSupplier()
    const veg = await supplierCategory(supplierId, 'Our veg')
    const p1 = await createProduct(db.pool, supplierId, { name: 'Tomatoes', categoryId: veg })
    const p2 = await createProduct(db.pool, supplierId, { name: 'Cucumbers', categoryId: veg })
    await createProduct(db.pool, supplierId, { name: 'Lamb chops' })
    const promotionId = await promotion(supplierId, 'specific_categories')
    await db.pool.query(
      `INSERT INTO promotion_targets (promotion_id, category_id) VALUES ($1, $2)`,
      [promotionId, veg]
    )
    const warehouseId = await warehouse(supplierId)
    await db.pool.query(
      `INSERT INTO warehouse_routing_rule (supplier_id, warehouse_id, rule_type, category_id)
       VALUES ($1, $2, 'category', $3)`,
      [supplierId, warehouseId, veg]
    )

    const stats = await backfill.runCategoryBackfill()

    const { rows: targets } = await db.pool.query(
      'SELECT category_id, shelf_id FROM promotion_targets WHERE promotion_id = $1',
      [promotionId]
    )
    expect(targets).toHaveLength(1)
    expect(targets[0].category_id).toBeNull()
    const { rows: covered } = await db.pool.query(
      `SELECT DISTINCT ps.product_id FROM promotion_targets t
       JOIN product_shelf ps ON ps.shelf_id = t.shelf_id WHERE t.promotion_id = $1`,
      [promotionId]
    )
    expect(covered.map((r) => r.product_id).sort()).toEqual([p1.id, p2.id].sort())
    const { rows: deal } = await db.pool.query('SELECT applies_to FROM promotions WHERE id = $1', [
      promotionId,
    ])
    expect(deal[0].applies_to).toBe('specific_shelves')
    const { rows: rules } = await db.pool.query(
      'SELECT rule_type, category_id, shelf_id FROM warehouse_routing_rule WHERE supplier_id = $1',
      [supplierId]
    )
    expect(rules).toEqual([
      { rule_type: 'shelf', category_id: null, shelf_id: targets[0].shelf_id },
    ])
    expect(stats.targetsRewritten).toBe(1)
    expect(stats.rulesRewritten).toBe(1)
  })

  it('cadence remapped or converted, row count unchanged', async () => {
    const supplierId = await newSupplier()
    const restaurant = await createRestaurant(db.pool)
    const veg = await supplierCategory(supplierId, 'Greens')
    const misc = await supplierCategory(supplierId, 'Misc stuff')
    await createProduct(db.pool, supplierId, { name: 'Flat parsley bunch', categoryId: veg })
    await createProduct(db.pool, supplierId, { name: 'Fresh mint bunch', categoryId: veg })
    await createProduct(db.pool, supplierId, { name: 'Assorted box', categoryId: misc })
    const remapped = await cadence(restaurant.id, supplierId, {
      level: 'category',
      categoryId: veg,
      dow: 1,
    })
    const converted = await cadence(restaurant.id, supplierId, {
      level: 'category',
      categoryId: misc,
      dow: 2,
    })

    const stats = await backfill.runCategoryBackfill()

    const { rows } = await db.pool.query(
      `SELECT rc.id, rc.cadence_level, c.slug, rc.is_active, rc.label, rc.confidence_score
       FROM restaurant_order_cadence rc LEFT JOIN product_category c ON c.id = rc.category_id
       WHERE rc.supplier_id = $1 ORDER BY rc.day_of_week`,
      [supplierId]
    )
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      id: remapped,
      cadence_level: 'category',
      slug: 'leafy-greens-herbs',
      is_active: true,
      label: 'Weekly',
    })
    expect(rows[1]).toMatchObject({
      id: converted,
      cadence_level: 'supplier',
      slug: null,
      is_active: true,
    })
    expect(stats.cadencesRemapped).toBe(1)
    expect(stats.cadencesConverted).toBe(1)
  })

  it("product-level cadence rows follow their product's new category; unique conflicts deactivate, never delete", async () => {
    const supplierId = await newSupplier()
    const restaurant = await createRestaurant(db.pool)
    const own = await supplierCategory(supplierId, 'Dairy corner')
    const other = await supplierCategory(supplierId, 'Unsorted')
    const milk = await createProduct(db.pool, supplierId, {
      name: 'Full cream milk 1L',
      categoryId: own,
    })
    await createProduct(db.pool, supplierId, { name: 'Mystery item', categoryId: other })
    const productCadence = await cadence(restaurant.id, supplierId, {
      level: 'product',
      productId: milk.id,
      categoryId: own,
    })
    // An active supplier-level cadence already exists on Tuesday; converting the unmatched
    // category cadence on Tuesday would collide with it.
    await cadence(restaurant.id, supplierId, { level: 'supplier', dow: 2 })
    const colliding = await cadence(restaurant.id, supplierId, {
      level: 'category',
      categoryId: other,
      dow: 2,
    })

    const stats = await backfill.runCategoryBackfill()

    const { rows } = await db.pool.query(
      `SELECT rc.id, rc.cadence_level, c.slug, rc.is_active
       FROM restaurant_order_cadence rc LEFT JOIN product_category c ON c.id = rc.category_id
       WHERE rc.supplier_id = $1`,
      [supplierId]
    )
    expect(rows).toHaveLength(3)
    expect(rows.find((r) => r.id === productCadence)).toMatchObject({
      slug: 'dairy',
      is_active: true,
    })
    expect(rows.find((r) => r.id === colliding)).toMatchObject({
      cadence_level: 'supplier',
      is_active: false,
    })
    expect(stats.cadencesDeactivated).toBe(1)
  })

  it('products on the 16 broad categories move to a narrower leaf only on an auto match', async () => {
    const supplierId = await newSupplier()
    const vegetables = await platformId('vegetables')
    const parsley = await createProduct(db.pool, supplierId, {
      name: 'Flat parsley bunch',
      categoryId: vegetables,
    })
    const tomato = await createProduct(db.pool, supplierId, {
      name: 'Tomatoes 5kg',
      categoryId: vegetables,
    })
    const vague = await createProduct(db.pool, supplierId, {
      name: 'Weekly produce box',
      categoryId: vegetables,
    })
    const paste = await createProduct(db.pool, supplierId, {
      name: 'Tomato paste 400g',
      categoryId: vegetables,
    })
    const promotionId = await promotion(supplierId, 'specific_categories')
    await db.pool.query(
      `INSERT INTO promotion_targets (promotion_id, category_id) VALUES ($1, $2)`,
      [promotionId, vegetables]
    )

    const stats = await backfill.runCategoryBackfill()

    expect((await productRow(parsley.id)).slug).toBe('leafy-greens-herbs')
    expect((await productRow(tomato.id)).slug).toBe('vegetables')
    expect(await productRow(vague.id)).toMatchObject({
      slug: 'vegetables',
      category_needs_review: false,
    })
    // A match in another department is not a narrower leaf: the supplier's choice stays.
    expect((await productRow(paste.id)).slug).toBe('vegetables')
    expect(stats.productsReclassifiedFromBroad).toBe(1)
    // The broad deal keeps covering the moved product.
    const { rows: targets } = await db.pool.query(
      `SELECT c.slug FROM promotion_targets t JOIN product_category c ON c.id = t.category_id
       WHERE t.promotion_id = $1 ORDER BY c.slug`,
      [promotionId]
    )
    expect(targets.map((t) => t.slug)).toEqual(['leafy-greens-herbs', 'vegetables'])
  })

  it('inactive and legacy-text products classified', async () => {
    const supplierId = await newSupplier()
    const byText = await createProduct(db.pool, supplierId, {
      name: 'SKU 99812',
      category: 'Labneh',
    })
    const byName = await createProduct(db.pool, supplierId, {
      name: 'Basmati rice 5kg',
      category: 'Grains',
    })
    const lossy = await createProduct(db.pool, supplierId, { name: 'Item 7', category: 'Stuff' })
    const bare = await createProduct(db.pool, supplierId, { name: 'Thing' })
    // An unlisted product (no price, no stock) is classified like any other.
    await db.pool.query('DELETE FROM price WHERE product_id = $1', [bare.id])

    const stats = await backfill.runCategoryBackfill()

    expect(await productRow(byText.id)).toMatchObject({
      slug: 'yogurt-labneh',
      category_needs_review: false,
    })
    expect(await productRow(byName.id)).toMatchObject({
      slug: 'grains-legumes',
      category_needs_review: false,
    })
    expect(await productRow(lossy.id)).toMatchObject({ slug: 'other', category_needs_review: true })
    expect(await productRow(bare.id)).toMatchObject({ slug: 'other', category_needs_review: true })
    expect(stats.productsAuto).toBe(2)
    expect(stats.productsFlagged).toBe(2)
  })

  it('concurrent startup runs once', async () => {
    const supplierId = await newSupplier()
    const cat = await supplierCategory(supplierId, 'Cheese room')
    for (let i = 0; i < 5; i++) {
      await createProduct(db.pool, supplierId, { name: `Halloumi cheese ${i}`, categoryId: cat })
    }
    const [a, b] = await Promise.all([
      backfill.runCategoryBackfill(),
      backfill.runCategoryBackfill(),
    ])
    const { rows } = await db.pool.query(
      'SELECT count(*)::int AS n FROM supplier_shelf WHERE supplier_id = $1',
      [supplierId]
    )
    expect(rows[0].n).toBe(1)
    expect([a.shelvesCreated, b.shelvesCreated].sort()).toEqual([0, 1])
    expect([a.skipped, b.skipped].filter(Boolean)).toHaveLength(1)
    expect((await runRow()).status).toBe('verified')
  })

  it('resume after crash', async () => {
    const suppliers = []
    for (let i = 0; i < 4; i++) {
      const supplierId = await newSupplier()
      const cat = await supplierCategory(supplierId, `Section ${i}`)
      await createProduct(db.pool, supplierId, { name: 'Sunflower oil 18L', categoryId: cat })
      await createProduct(db.pool, supplierId, { name: 'Mystery', categoryId: cat })
      suppliers.push(supplierId)
    }
    let done = 0
    await expect(
      backfill.runCategoryBackfill(undefined, {
        onSupplierDone: () => {
          done += 1
          if (done === 2) throw new Error('injected crash')
        },
      })
    ).rejects.toThrow('injected crash')
    const failed = await runRow()
    expect(failed.status).toBe('failed')
    expect(failed.error).toMatch(/injected crash/)
    expect(failed.cursor?.lastSupplierId).toBeTruthy()

    const snapshot = async () =>
      (
        await db.pool.query(
          `SELECT p.name, s.name AS shelf, c.slug, p.category_needs_review
           FROM product p
           JOIN product_category c ON c.id = p.category_id
           LEFT JOIN product_shelf ps ON ps.product_id = p.id
           LEFT JOIN supplier_shelf s ON s.id = ps.shelf_id
           WHERE p.supplier_id = ANY($1::uuid[]) ORDER BY s.name, p.name`,
          [suppliers]
        )
      ).rows

    const resumed = await backfill.runCategoryBackfill()
    expect((await runRow()).status).toBe('verified')
    const { rows: shelfCounts } = await db.pool.query(
      `SELECT supplier_id, count(*)::int AS n FROM supplier_shelf
       WHERE supplier_id = ANY($1::uuid[]) GROUP BY supplier_id`,
      [suppliers]
    )
    expect(shelfCounts.map((r) => r.n)).toEqual([1, 1, 1, 1])
    expect(resumed.shelvesCreated).toBe(4)
    const final = await snapshot()
    expect(final).toHaveLength(8)
    expect(final.filter((r) => r.slug === 'oils-fats')).toHaveLength(4)
    expect(final.filter((r) => r.slug === 'other' && r.category_needs_review)).toHaveLength(4)
  })

  it('a failed verification repairs rows written behind the cursor, sparing broad-leaf choices', async () => {
    const suppliers = []
    for (let i = 0; i < 2; i++) {
      const supplierId = await newSupplier()
      const cat = await supplierCategory(supplierId, `Aisle ${i}`)
      await createProduct(db.pool, supplierId, { name: 'Sunflower oil 18L', categoryId: cat })
      suppliers.push(supplierId)
    }
    let first = null
    let late = null
    let broad = null
    let calls = 0
    const result = await backfill.runCategoryBackfill(undefined, {
      // An old API instance keeps writing during a rolling deploy, behind the cursor.
      onSupplierDone: async (supplierId) => {
        calls += 1
        first ??= supplierId
        if (calls !== suppliers.length) return
        const own = await supplierCategory(first, 'Late section')
        late = await createProduct(db.pool, first, { name: 'Cheddar block 5kg', categoryId: own })
        broad = await createProduct(db.pool, first, {
          name: 'Cheddar slices 1kg',
          categoryId: await platformId('dairy'),
        })
      },
    })
    expect(result.verified, JSON.stringify(result.violations)).toBe(true)
    expect((await runRow()).status).toBe('verified')
    expect((await productRow(late.id)).slug).toBe('cheese')
    // A product the supplier put on a broad leaf after its pass is not reclassified.
    expect((await productRow(broad.id)).slug).toBe('dairy')
    const { rows: shelves } = await db.pool.query(
      'SELECT name FROM supplier_shelf WHERE supplier_id = $1 ORDER BY name',
      [first]
    )
    expect(shelves.map((r) => r.name)).toContain('Late section')
  })

  it('second run is a no-op', async () => {
    const supplierId = await newSupplier()
    const cat = await supplierCategory(supplierId, 'Pantry')
    const product = await createProduct(db.pool, supplierId, {
      name: 'Red lentils 1kg',
      categoryId: cat,
    })
    await backfill.runCategoryBackfill()
    const before = await productRow(product.id)
    const second = await backfill.runCategoryBackfill()
    expect(second.skipped).toBe(true)
    expect(await productRow(product.id)).toEqual(before)
  })

  it('verify fails and records violations when a bad row is injected', async () => {
    await backfill.runCategoryBackfill()
    expect(await backfill.verifyCategoryBackfill()).toMatchObject({ ok: true })
    const supplierId = await newSupplier()
    await createProduct(db.pool, supplierId, { name: 'No category' })
    const result = await backfill.verifyCategoryBackfill()
    expect(result.ok).toBe(false)
    expect(result.violations.productsNullCategory).toBe(1)

    // A failed run stays failed; readers map non-leaf ids to "Other".
    await db.pool.query(`DELETE FROM data_migration_run WHERE name = 'category-backfill'`)
    const own = await supplierCategory(supplierId, 'Legacy')
    const legacy = await createProduct(db.pool, supplierId, {
      name: 'Legacy thing',
      categoryId: own,
    })
    const { rows } = await db.pool.query(
      `SELECT ${leafSql.leafCategoryIdSql('p')} AS id FROM product p WHERE p.id = $1`,
      [legacy.id]
    )
    expect(rows[0].id).toBe(await platformId('other'))
  })
})
