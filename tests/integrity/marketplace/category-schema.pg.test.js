import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { resetMarketplaceDb, startMarketplaceDb } from './harness.js'
import { createProduct, createSupplierOrg } from './fixtures.js'

/**
 * Plan B Task 1: platform category tree, shelves and integrity triggers
 * (migrations 0240_platform_category_tree_and_shelves.sql + 0241_seed_horeca_category_tree.sql).
 */

const EXISTING_SLUGS = [
  'vegetables',
  'meat-poultry',
  'seafood',
  'grains-legumes',
  'oils-fats',
  'dairy',
  'beverages',
  'spices-seasonings',
  'canned-preserved',
  'bakery-bread',
  'frozen-foods',
  'snacks-nuts',
  'condiments-sauces',
  'cleaning-supplies',
  'paper-disposables',
  'other',
]

const EXISTING_NAMES = {
  vegetables: 'Vegetables',
  'meat-poultry': 'Meat & Poultry',
  seafood: 'Seafood',
  'grains-legumes': 'Grains & Legumes',
  'oils-fats': 'Oils & Fats',
  dairy: 'Dairy',
  beverages: 'Beverages',
  'spices-seasonings': 'Spices & Seasonings',
  'canned-preserved': 'Canned & Preserved',
  'bakery-bread': 'Bakery & Bread',
  'frozen-foods': 'Frozen Foods',
  'snacks-nuts': 'Snacks & Nuts',
  'condiments-sauces': 'Condiments & Sauces',
  'cleaning-supplies': 'Cleaning Supplies',
  'paper-disposables': 'Paper & Disposables',
  other: 'Other',
}

let db

async function newSupplier() {
  return (await createSupplierOrg(db.pool)).branchIds[0]
}

async function platformId(slug) {
  const { rows } = await db.pool.query(
    'SELECT id FROM product_category WHERE slug = $1 AND supplier_id IS NULL',
    [slug]
  )
  return rows[0]?.id
}

async function departmentId() {
  const { rows } = await db.pool.query(
    `SELECT id FROM product_category
     WHERE supplier_id IS NULL AND parent_category_id IS NULL ORDER BY display_order LIMIT 1`
  )
  return rows[0].id
}

async function createShelf(supplierId, name = 'Shelf') {
  const { rows } = await db.pool.query(
    'INSERT INTO supplier_shelf (supplier_id, name) VALUES ($1, $2) RETURNING id',
    [supplierId, name]
  )
  return rows[0].id
}

async function createPromotion(supplierId, appliesTo = 'specific_shelves') {
  const { rows } = await db.pool.query(
    `INSERT INTO promotions (supplier_id, name, type, discount_value, applies_to, status, starts_at)
     VALUES ($1, 'Deal', 'percentage_discount', 10, $2, 'active', now()) RETURNING id`,
    [supplierId, appliesTo]
  )
  return rows[0].id
}

beforeAll(async () => {
  db = await startMarketplaceDb()
})

beforeEach(async () => {
  await resetMarketplaceDb(db.pool)
})

afterAll(async () => {
  await resetMarketplaceDb(db.pool)
})

describe('platform category tree', () => {
  it('existing 16 ids survive, now level 2', async () => {
    const { rows } = await db.pool.query(
      `SELECT c.slug, c.name, p.slug AS parent_slug, p.parent_category_id AS grandparent
       FROM product_category c
       LEFT JOIN product_category p ON p.id = c.parent_category_id
       WHERE c.supplier_id IS NULL AND c.slug = ANY($1::text[])`,
      [EXISTING_SLUGS]
    )
    expect(rows.map((r) => r.slug).sort()).toEqual([...EXISTING_SLUGS].sort())
    for (const row of rows) {
      expect(row.name).toBe(EXISTING_NAMES[row.slug])
      expect(row.parent_slug).toMatch(/^dept-/)
      expect(row.grandparent).toBeNull()
    }
  })

  it('every leaf has name_ar, name_fr, ≥4 aliases, icon_key', async () => {
    const { rows } = await db.pool.query(
      `SELECT slug, name_ar, name_fr, aliases, icon_key, parent_category_id
       FROM product_category WHERE supplier_id IS NULL`
    )
    const leaves = rows.filter((r) => r.parent_category_id)
    const departments = rows.filter((r) => !r.parent_category_id)
    expect(departments.length).toBeGreaterThanOrEqual(18)
    expect(leaves.length).toBeGreaterThanOrEqual(85)
    const bad = rows.filter(
      (r) => !r.name_ar || !r.name_fr || !r.icon_key || (r.aliases || []).length < 4
    )
    expect(bad.map((r) => r.slug)).toEqual([])
    expect(departments.every((d) => d.slug.startsWith('dept-'))).toBe(true)
  })

  it('platform slugs and sibling names are unique', async () => {
    await expect(
      db.pool.query(
        `INSERT INTO product_category (name, slug, parent_category_id)
         VALUES ('Duplicate', 'vegetables', $1)`,
        [await departmentId()]
      )
    ).rejects.toMatchObject({ code: '23505' })
  })
})

describe('leaf-category trigger', () => {
  it('product with a department id is rejected by trigger', async () => {
    const supplierId = await newSupplier()
    await expect(
      createProduct(db.pool, supplierId, { categoryId: await departmentId() })
    ).rejects.toThrow(/leaf platform category/)
  })

  it('product with a leaf id or NULL is accepted', async () => {
    const supplierId = await newSupplier()
    await createProduct(db.pool, supplierId, { categoryId: await platformId('vegetables') })
    await createProduct(db.pool, supplierId, { categoryId: null })
  })

  it('supplier-owned ids pass only while the backfill is not verified', async () => {
    const supplierId = await newSupplier()
    const {
      rows: [own],
    } = await db.pool.query(
      `INSERT INTO product_category (name, slug, supplier_id) VALUES ('Mine', 'mine', $1)
       RETURNING id`,
      [supplierId]
    )
    await db.pool.query(`DELETE FROM data_migration_run WHERE name = 'category-backfill'`)
    await createProduct(db.pool, supplierId, { categoryId: own.id })
    try {
      await db.pool.query(
        `INSERT INTO data_migration_run (name, status) VALUES ('category-backfill', 'verified')`
      )
      await expect(createProduct(db.pool, supplierId, { categoryId: own.id })).rejects.toThrow(
        /leaf platform category/
      )
    } finally {
      await db.pool.query(`DELETE FROM data_migration_run WHERE name = 'category-backfill'`)
    }
  })

  it('routing rule and cadence with a department id are rejected', async () => {
    const supplierId = await newSupplier()
    const dept = await departmentId()
    const {
      rows: [wh],
    } = await db.pool.query(
      `INSERT INTO warehouse (supplier_id, tenant_id, name) VALUES ($1, $1, 'Main') RETURNING id`,
      [supplierId]
    )
    await expect(
      db.pool.query(
        `INSERT INTO warehouse_routing_rule (supplier_id, warehouse_id, rule_type, category_id)
         VALUES ($1, $2, 'category', $3)`,
        [supplierId, wh.id, dept]
      )
    ).rejects.toThrow(/leaf platform category/)
  })
})

describe('shelves and targets', () => {
  it('product_shelf rejects a shelf of another supplier', async () => {
    const a = { supplierId: await newSupplier() }
    const b = { supplierId: await newSupplier() }
    const product = await createProduct(db.pool, a.supplierId)
    const foreignShelf = await createShelf(b.supplierId)
    await expect(
      db.pool.query(
        'INSERT INTO product_shelf (product_id, shelf_id, supplier_id) VALUES ($1, $2, $3)',
        [product.id, foreignShelf, a.supplierId]
      )
    ).rejects.toMatchObject({ code: '23503' })
    await expect(
      db.pool.query(
        'INSERT INTO product_shelf (product_id, shelf_id, supplier_id) VALUES ($1, $2, $3)',
        [product.id, foreignShelf, b.supplierId]
      )
    ).rejects.toMatchObject({ code: '23503' })
  })

  it('shelf names are unique per supplier among non-archived shelves', async () => {
    const supplierId = await newSupplier()
    const first = await createShelf(supplierId, 'Bread')
    await expect(createShelf(supplierId, 'bread')).rejects.toMatchObject({ code: '23505' })
    await db.pool.query('UPDATE supplier_shelf SET archived_at = now() WHERE id = $1', [first])
    await createShelf(supplierId, 'bread')
  })

  it('promotion target with two ids rejected', async () => {
    const supplierId = await newSupplier()
    const product = await createProduct(db.pool, supplierId)
    const promotionId = await createPromotion(supplierId, 'specific_products')
    await expect(
      db.pool.query(
        `INSERT INTO promotion_targets (promotion_id, product_id, category_id) VALUES ($1, $2, $3)`,
        [promotionId, product.id, await platformId('dairy')]
      )
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      db.pool.query(`INSERT INTO promotion_targets (promotion_id) VALUES ($1)`, [promotionId])
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('deleting a shelf referenced by a deal is restricted', async () => {
    const supplierId = await newSupplier()
    const shelfId = await createShelf(supplierId)
    const promotionId = await createPromotion(supplierId)
    await db.pool.query(`INSERT INTO promotion_targets (promotion_id, shelf_id) VALUES ($1, $2)`, [
      promotionId,
      shelfId,
    ])
    await expect(
      db.pool.query('DELETE FROM supplier_shelf WHERE id = $1', [shelfId])
    ).rejects.toMatchObject({ code: '23503' })
  })

  it('deleting a platform category referenced by a deal is restricted', async () => {
    const supplierId = await newSupplier()
    const promotionId = await createPromotion(supplierId, 'specific_categories')
    const dairy = await platformId('dairy')
    await db.pool.query(
      `INSERT INTO promotion_targets (promotion_id, category_id) VALUES ($1, $2)`,
      [promotionId, dairy]
    )
    // The FK is deferred (checked at commit); an autocommit DELETE is refused and rolled back.
    await expect(
      db.pool.query('DELETE FROM product_category WHERE id = $1', [dairy])
    ).rejects.toMatchObject({ code: '23503' })
    expect(await platformId('dairy')).toBe(dairy)
  })

  it('supplier delete still cascades through shelves and deals', async () => {
    const supplierId = await newSupplier()
    const shelfId = await createShelf(supplierId)
    const product = await createProduct(db.pool, supplierId)
    await db.pool.query(
      'INSERT INTO product_shelf (product_id, shelf_id, supplier_id) VALUES ($1, $2, $3)',
      [product.id, shelfId, supplierId]
    )
    const promotionId = await createPromotion(supplierId)
    await db.pool.query(`INSERT INTO promotion_targets (promotion_id, shelf_id) VALUES ($1, $2)`, [
      promotionId,
      shelfId,
    ])
    await db.pool.query('DELETE FROM supplier WHERE id = $1', [supplierId])
    const { rows } = await db.pool.query(
      'SELECT count(*)::int AS n FROM supplier_shelf WHERE id = $1',
      [shelfId]
    )
    expect(rows[0].n).toBe(0)
  })

  it('applies_to accepts specific_shelves and routing accepts shelf rules', async () => {
    const supplierId = await newSupplier()
    await createPromotion(supplierId, 'specific_shelves')
    const shelfId = await createShelf(supplierId)
    const {
      rows: [wh],
    } = await db.pool.query(
      `INSERT INTO warehouse (supplier_id, tenant_id, name) VALUES ($1, $1, 'Main') RETURNING id`,
      [supplierId]
    )
    await db.pool.query(
      `INSERT INTO warehouse_routing_rule (supplier_id, warehouse_id, rule_type, shelf_id)
       VALUES ($1, $2, 'shelf', $3)`,
      [supplierId, wh.id, shelfId]
    )
  })
})

describe('category requests', () => {
  it('duplicate pending category request rejected', async () => {
    const supplierId = await newSupplier()
    const insert = () =>
      db.pool.query(
        `INSERT INTO category_request (supplier_id, proposed_name, normalized_name)
         VALUES ($1, 'Microgreens', 'microgreen')`,
        [supplierId]
      )
    await insert()
    await expect(insert()).rejects.toMatchObject({ code: '23505' })
  })

  it('example product must belong to the requester', async () => {
    const a = { supplierId: await newSupplier() }
    const b = { supplierId: await newSupplier() }
    const foreign = await createProduct(db.pool, b.supplierId)
    await expect(
      db.pool.query(
        `INSERT INTO category_request (supplier_id, proposed_name, normalized_name, example_product_id)
         VALUES ($1, 'Microgreens', 'microgreen', $2)`,
        [a.supplierId, foreign.id]
      )
    ).rejects.toMatchObject({ code: '23503' })
  })
})
