import 'dotenv/config'
import { query, pool } from '../src/lib/db.js'

const marina = await query(
  `SELECT id, slug, created_at FROM restaurant WHERE slug = 'be-demo-marina-trattoria'`
)
console.log('DB marina:', marina.rows[0])

const smoke = await query(
  `SELECT id, sku, name FROM product
   WHERE name ILIKE '%smoke_test%' OR sku ILIKE '%smoke_test%'
   LIMIT 10`
)
console.log('smoke products:', smoke.rows.length, smoke.rows)

const ql = await query(
  `SELECT COUNT(*)::int AS n FROM quick_list ql
   JOIN restaurant r ON r.id = ql.restaurant_id
   WHERE r.slug = 'be-demo-marina-trattoria'`
)
console.log('marina quick lists:', ql.rows[0].n)

const menu = await query(
  `SELECT COUNT(*)::int AS n FROM menu_category mc
   JOIN restaurant r ON r.id = mc.restaurant_id
   WHERE r.slug = 'be-demo-marina-trattoria'`
)
console.log('marina menu categories:', menu.rows[0].n)

await pool.end()
