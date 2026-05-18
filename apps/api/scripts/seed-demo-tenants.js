/**
 * Restore Keycloak-aligned demo tenants (Golden Fork + Fresh Foods).
 * Safe after seed:prodlike — wipes only the fixed demo tenant IDs, then runs seed.sql.
 *
 * Run: pnpm run seed:demo-tenants
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import 'dotenv/config'
import { pool, query } from '../src/lib/db.js'
import { isMainModule } from './lib/is-main.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEMO_SEED_FILE = join(__dirname, '..', 'db', 'seed', 'seed.sql')

export const DEMO_SUPPLIER_ID = '550e8400-e29b-41d4-a716-446655440001'
export const DEMO_RESTAURANT_ID = '550e8400-e29b-41d4-a716-446655440002'
export const DEMO_RESTAURANT_SLUG = 'golden-fork-restaurant'
export const DEMO_SUPPLIER_SLUG = 'fresh-foods-co'
export const DEMO_RESTAURANT_EMAIL = 'restaurant@supplify.com'
export const DEMO_SUPPLIER_EMAIL = 'supplier@supplify.com'

/** Remove prior demo rows (idempotent re-seed; does not touch prod-like tenants). */
export async function clearDemoTenants(client) {
  const run = (sql, params) => (client ? client.query(sql, params) : query(sql, params))

  // Orders / finance tied to demo restaurant
  await run(
    `DELETE FROM payment WHERE invoice_id IN (
    SELECT id FROM invoice WHERE restaurant_id = $1 OR supplier_id = $2
  )`,
    [DEMO_RESTAURANT_ID, DEMO_SUPPLIER_ID]
  )
  await run(
    'DELETE FROM invoice_line_item WHERE invoice_id IN (SELECT id FROM invoice WHERE restaurant_id = $1 OR supplier_id = $2)',
    [DEMO_RESTAURANT_ID, DEMO_SUPPLIER_ID]
  )
  await run('DELETE FROM invoice WHERE restaurant_id = $1 OR supplier_id = $2', [
    DEMO_RESTAURANT_ID,
    DEMO_SUPPLIER_ID,
  ])
  await run(
    'DELETE FROM order_item WHERE order_id IN (SELECT id FROM customer_order WHERE restaurant_id = $1)',
    [DEMO_RESTAURANT_ID]
  )
  await run('DELETE FROM customer_order WHERE restaurant_id = $1', [DEMO_RESTAURANT_ID])
  await run(
    'DELETE FROM quick_list_item WHERE quick_list_id IN (SELECT id FROM quick_list WHERE restaurant_id = $1)',
    [DEMO_RESTAURANT_ID]
  )
  await run('DELETE FROM quick_list WHERE restaurant_id = $1', [DEMO_RESTAURANT_ID])
  await run('DELETE FROM reservation WHERE restaurant_id = $1', [DEMO_RESTAURANT_ID])
  await run('DELETE FROM reservation_table WHERE restaurant_id = $1', [DEMO_RESTAURANT_ID])
  await run('DELETE FROM staff_shift WHERE restaurant_id = $1', [DEMO_RESTAURANT_ID])
  await run('DELETE FROM staff_member WHERE restaurant_id = $1', [DEMO_RESTAURANT_ID])
  await run('DELETE FROM restaurant_team WHERE restaurant_id = $1', [DEMO_RESTAURANT_ID])
  await run('DELETE FROM branch WHERE restaurant_id = $1 OR tenant_id = $1', [DEMO_RESTAURANT_ID])
  await run('DELETE FROM restaurant_inventory WHERE restaurant_id = $1', [DEMO_RESTAURANT_ID])
  await run('DELETE FROM subscription WHERE tenant_id = $1 AND tenant_type = $2', [
    DEMO_RESTAURANT_ID,
    'RESTAURANT',
  ])
  await run('DELETE FROM subscription WHERE tenant_id = $1 AND tenant_type = $2', [
    DEMO_SUPPLIER_ID,
    'SUPPLIER',
  ])

  await run(
    'DELETE FROM inventory WHERE product_id IN (SELECT id FROM product WHERE supplier_id = $1)',
    [DEMO_SUPPLIER_ID]
  )
  await run(
    'DELETE FROM price WHERE product_id IN (SELECT id FROM product WHERE supplier_id = $1)',
    [DEMO_SUPPLIER_ID]
  )
  await run('DELETE FROM product WHERE supplier_id = $1', [DEMO_SUPPLIER_ID])
  await run('DELETE FROM catalog WHERE supplier_id = $1', [DEMO_SUPPLIER_ID])
  await run('DELETE FROM warehouse WHERE tenant_id = $1 OR supplier_id = $1', [DEMO_SUPPLIER_ID])

  await run('DELETE FROM restaurant WHERE id = $1 OR slug = $2', [
    DEMO_RESTAURANT_ID,
    DEMO_RESTAURANT_SLUG,
  ])
  await run('DELETE FROM supplier WHERE id = $1 OR slug = $2', [
    DEMO_SUPPLIER_ID,
    DEMO_SUPPLIER_SLUG,
  ])
}

export async function seedDemoTenants() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await clearDemoTenants(client)
    const sql = readFileSync(DEMO_SEED_FILE, 'utf8')
    await client.query(sql)
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

async function main() {
  console.log('🍽️  Restoring demo tenants (restaurant@supplify.com / supplier@supplify.com)...')
  await seedDemoTenants()
  const { rows } = await query(
    `SELECT
       (SELECT contact_email FROM restaurant WHERE slug = $1) AS restaurant_email,
       (SELECT contact_email FROM supplier WHERE slug = $2) AS supplier_email`,
    [DEMO_RESTAURANT_SLUG, DEMO_SUPPLIER_SLUG]
  )
  const r = rows[0]
  if (!r?.restaurant_email || !r?.supplier_email) {
    console.error('Demo tenants missing after seed — check seed.sql')
    process.exit(1)
  }
  console.log(`✅ Demo restaurant: ${r.restaurant_email} (slug: ${DEMO_RESTAURANT_SLUG})`)
  console.log(`✅ Demo supplier:   ${r.supplier_email} (slug: ${DEMO_SUPPLIER_SLUG})`)
  console.log('   Log in with Keycloak: restaurant@supplify.com / SupplifyRestaurant1!')
}

if (isMainModule(import.meta.url)) {
  main()
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
    .finally(() => pool.end())
}
