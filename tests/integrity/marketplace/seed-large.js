/**
 * Large marketplace dataset for the Plan A Task 11 benchmark (set-based SQL, ~1 minute):
 * 300 supplier organisations (600 branches), 2,000 restaurants, 60,000 products,
 * 20,000 follows, 500 blocks, 50,000 orders and 2,000 conversations.
 *
 * Deterministic: restaurant i follows organisations (i*13 + k*29) mod 300 for k = 0..9, and
 * restaurants 0..499 block organisation (i*17 + 5) mod 300 (any follow of it is removed).
 */
export const LARGE = {
  orgs: 300,
  branchesPerOrg: 2,
  restaurants: 2000,
  productsPerBranch: 100,
  followsPerRestaurant: 10,
  blocks: 500,
  orders: 50000,
  conversations: 2000,
}

const WORDS = [
  'tomato',
  'onion',
  'olive oil',
  'flour',
  'rice',
  'chicken breast',
  'milk',
  'cheese',
  'lemon',
  'parsley',
]

/** @param client a dedicated pg client (temp tables are per connection). */
export async function seedLarge(client) {
  const pool = client
  const t0 = Date.now()
  await pool.query(
    `CREATE TEMP TABLE IF NOT EXISTS bench_words (i int, w text);
     TRUNCATE bench_words;`
  )
  await pool.query(
    `INSERT INTO bench_words SELECT ord - 1, w FROM unnest($1::text[]) WITH ORDINALITY AS t(w, ord)`,
    [WORDS]
  )
  await pool.query(
    `INSERT INTO supplier_organizations (name, slug)
     SELECT 'Bench Org ' || g, 'bench-org-' || g FROM generate_series(0, $1 - 1) g`,
    [LARGE.orgs]
  )
  await pool.query(
    `INSERT INTO supplier (name, slug, organization_id, is_main_branch, public_catalog_enabled, contact_email)
     SELECT o.name || ' b' || b, o.slug || '-b' || b, o.id, b = 1,
            (substring(o.slug from 'bench-org-(\\d+)')::int % 2 = 0),
            o.slug || '-b' || b || '@bench.test'
     FROM supplier_organizations o
     CROSS JOIN generate_series(1, $1) b
     WHERE o.slug LIKE 'bench-org-%'`,
    [LARGE.branchesPerOrg]
  )
  await pool.query(
    `INSERT INTO restaurant (name, slug, is_main_branch, contact_email)
     SELECT 'Bench Restaurant ' || g, 'bench-rest-' || g, true, 'bench-rest-' || g || '@bench.test'
     FROM generate_series(0, $1 - 1) g`,
    [LARGE.restaurants]
  )
  await pool.query(
    // Spread products over every active leaf platform category (Plan B budgets browse them).
    `WITH leaf AS (
       SELECT id, (row_number() OVER (ORDER BY slug) - 1)::int AS i, count(*) OVER ()::int AS n
       FROM product_category
       WHERE supplier_id IS NULL AND parent_category_id IS NOT NULL AND is_active
     )
     INSERT INTO product (supplier_id, sku, name, unit, created_at, category_id)
     SELECT s.id, 'BENCH-' || s.slug || '-' || g, initcap(w.w) || ' grade ' || g, 'kg',
            now() - (abs(hashtext(s.slug || g)) % 525600) * interval '1 minute',
            (SELECT l.id FROM leaf l WHERE l.i = abs(hashtext('cat' || s.slug || g)) % l.n)
     FROM supplier s
     CROSS JOIN generate_series(1, $1) g
     JOIN bench_words w ON w.i = g % 10
     WHERE s.slug LIKE 'bench-org-%'`,
    [LARGE.productsPerBranch]
  )
  await pool.query(
    `INSERT INTO price (product_id, currency, amount, min_qty, valid_from)
     SELECT p.id, 'USD', 1 + (abs(hashtext(p.sku)) % 5000) / 100.0, 1, now() - interval '1 day'
     FROM product p WHERE p.sku LIKE 'BENCH-%'`
  )
  await pool.query(
    `UPDATE inventory i SET available_qty = 100
     FROM product p WHERE p.id = i.product_id AND p.sku LIKE 'BENCH-%'`
  )
  // Indexed lookups for the deterministic relationship pattern.
  await pool.query(
    `CREATE TEMP TABLE bench_org AS
       SELECT o.id AS org_id, substring(o.slug from 'bench-org-(\\d+)')::int AS idx,
              (SELECT s.id FROM supplier s WHERE s.organization_id = o.id AND s.is_main_branch) AS main_id
       FROM supplier_organizations o WHERE o.slug LIKE 'bench-org-%';
     CREATE TEMP TABLE bench_rest AS
       SELECT r.id AS restaurant_id, substring(r.slug from 'bench-rest-(\\d+)')::int AS idx
       FROM restaurant r WHERE r.slug LIKE 'bench-rest-%';`
  )
  await pool.query(
    `INSERT INTO supplier_follow (restaurant_id, supplier_id, supplier_org_id)
     SELECT r.restaurant_id, o.main_id, o.org_id
     FROM bench_rest r
     CROSS JOIN generate_series(0, $1 - 1) k
     JOIN bench_org o ON o.idx = (r.idx * 13 + k * 29) % $2
     ON CONFLICT DO NOTHING`,
    [LARGE.followsPerRestaurant, LARGE.orgs]
  )
  await pool.query(
    `WITH b AS (
       SELECT r.restaurant_id, o.org_id, o.main_id
       FROM bench_rest r JOIN bench_org o ON o.idx = (r.idx * 17 + 5) % $2
       WHERE r.idx < $1
     ), del AS (
       DELETE FROM supplier_follow f USING b
       WHERE f.restaurant_id = b.restaurant_id AND f.supplier_org_id = b.org_id
     )
     INSERT INTO supplier_blocklist (restaurant_id, supplier_id, supplier_org_id)
     SELECT restaurant_id, main_id, org_id FROM b ON CONFLICT DO NOTHING`,
    [LARGE.blocks, LARGE.orgs]
  )
  // Orders: restaurant g % 2000 buys from organisation g % 300 (main branch), first product.
  await pool.query(
    `CREATE TEMP TABLE bench_first_product AS
       SELECT DISTINCT ON (p.supplier_id) p.supplier_id, p.id AS product_id
       FROM product p WHERE p.sku LIKE 'BENCH-%' ORDER BY p.supplier_id, p.sku`
  )
  await pool.query(
    `WITH src AS (
       SELECT g, r.restaurant_id, o.org_id, o.main_id
       FROM generate_series(0, $1 - 1) g
       JOIN bench_rest r ON r.idx = g % $2
       JOIN bench_org o ON o.idx = g % $3
     ), ins AS (
       INSERT INTO customer_order (restaurant_id, status, total_amount, subtotal_amount, currency,
                                   supplier_organization_id, created_at)
       SELECT restaurant_id, 'COMPLETED'::order_status, 20, 20, 'USD', org_id,
              now() - (g % 365) * interval '1 day'
       FROM src
       RETURNING id, restaurant_id, supplier_organization_id
     )
     INSERT INTO order_item (order_id, product_id, supplier_id, quantity, unit_price, line_total)
     SELECT ins.id, fp.product_id, o.main_id, 2, 10, 20
     FROM ins
     JOIN bench_org o ON o.org_id = ins.supplier_organization_id
     JOIN bench_first_product fp ON fp.supplier_id = o.main_id`,
    [LARGE.orders, LARGE.restaurants, LARGE.orgs]
  )
  await pool.query(
    `WITH pairs AS (
       SELECT DISTINCT ON (f.restaurant_id) f.restaurant_id, f.supplier_id
       FROM supplier_follow f JOIN bench_rest r ON r.restaurant_id = f.restaurant_id
       ORDER BY f.restaurant_id, f.supplier_id
       LIMIT $1
     ), conv AS (
       INSERT INTO conversation (supplier_id, restaurant_id)
       SELECT supplier_id, restaurant_id FROM pairs
       RETURNING id, supplier_id, restaurant_id
     )
     INSERT INTO conversation_participant (conversation_id, participant_type, participant_id)
     SELECT id, 'SUPPLIER', supplier_id FROM conv
     UNION ALL SELECT id, 'RESTAURANT', restaurant_id FROM conv`,
    [LARGE.conversations]
  )
  await pool.query(
    `INSERT INTO promotions (supplier_id, name, type, discount_value, applies_to, starts_at, status)
     SELECT s.id, 'Bench deal ' || s.slug, 'percentage_discount', 5 + abs(hashtext(s.slug)) % 20, 'all',
            now() - interval '1 day', 'active'
     FROM supplier s WHERE s.slug LIKE 'bench-org-%'`
  )
  await pool.query('ANALYZE')
  const { rows } = await pool.query(
    `SELECT
       (SELECT count(*) FROM supplier_organizations WHERE slug LIKE 'bench-org-%')::int AS orgs,
       (SELECT count(*) FROM supplier WHERE slug LIKE 'bench-org-%')::int AS branches,
       (SELECT count(*) FROM restaurant WHERE slug LIKE 'bench-rest-%')::int AS restaurants,
       (SELECT count(*) FROM product WHERE sku LIKE 'BENCH-%')::int AS products,
       (SELECT count(*) FROM supplier_follow)::int AS follows,
       (SELECT count(*) FROM supplier_blocklist)::int AS blocks,
       (SELECT count(*) FROM customer_order)::int AS orders,
       (SELECT count(*) FROM conversation)::int AS conversations,
       (SELECT count(*) FROM promotions)::int AS deals`
  )
  return { ...rows[0], seconds: Math.round((Date.now() - t0) / 1000) }
}

/** Attach a benchmark viewer of each side to the big dataset (uses the normal fixtures). */
export async function attachBenchViewers(
  client,
  fixturePool,
  { createRestaurant, createSupplierOrg }
) {
  const pool = client
  const restaurant = await createRestaurant(fixturePool, { name: 'Bench Viewer Restaurant' })
  // Follows 10 organisations, like everyone else.
  await pool.query(
    `INSERT INTO supplier_follow (restaurant_id, supplier_id, supplier_org_id)
     SELECT $1, o.main_id, o.org_id FROM bench_org o WHERE o.idx < 10 ON CONFLICT DO NOTHING`,
    [restaurant.id]
  )
  // Supplier with 500 followers, 100 products and 200 conversations.
  const supplier = await createSupplierOrg(fixturePool, { name: 'Bench Viewer Supplier' })
  const branch = supplier.branchIds[0]
  await pool.query(
    `INSERT INTO supplier_follow (restaurant_id, supplier_id, supplier_org_id)
     SELECT r.restaurant_id, $1, $2 FROM bench_rest r WHERE r.idx < 500 ON CONFLICT DO NOTHING`,
    [branch, supplier.orgId]
  )
  await pool.query(
    `INSERT INTO product (supplier_id, sku, name, unit, category_id)
     SELECT $1, 'BENCHV-' || g, 'Viewer tomato ' || g, 'kg',
            (SELECT id FROM product_category WHERE slug = 'vegetables' AND supplier_id IS NULL)
     FROM generate_series(1, 100) g`,
    [branch]
  )
  await pool.query(
    `WITH conv AS (
       INSERT INTO conversation (supplier_id, restaurant_id)
       SELECT $1, r.restaurant_id FROM bench_rest r WHERE r.idx < 200
       RETURNING id, supplier_id, restaurant_id
     )
     INSERT INTO conversation_participant (conversation_id, participant_type, participant_id)
     SELECT id, 'SUPPLIER', supplier_id FROM conv
     UNION ALL SELECT id, 'RESTAURANT', restaurant_id FROM conv`,
    [branch]
  )
  await pool.query(
    `WITH conv AS (
       INSERT INTO conversation (supplier_id, restaurant_id)
       SELECT o.main_id, $1 FROM bench_org o WHERE o.idx < 10
       RETURNING id, supplier_id, restaurant_id
     )
     INSERT INTO conversation_participant (conversation_id, participant_type, participant_id)
     SELECT id, 'SUPPLIER', supplier_id FROM conv
     UNION ALL SELECT id, 'RESTAURANT', restaurant_id FROM conv`,
    [restaurant.id]
  )
  await pool.query('ANALYZE')
  return { restaurant, supplier }
}
