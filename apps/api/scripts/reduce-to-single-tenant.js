/**
 * Reduce the database to a single admin, single restaurant, and single supplier
 * for manual testing. Deletes all tenant data (restaurants, suppliers, and all
 * dependent rows), then runs the minimal seed (db/seed/seed.sql) which inserts
 * exactly 1 restaurant, 1 supplier, and required app_user rows.
 *
 * Does NOT touch: app_user (so existing admin/restaurant/supplier logins remain;
 * seed.sql uses ON CONFLICT DO NOTHING for app_user).
 *
 * Run from repo root: pnpm exec node apps/api/scripts/reduce-to-single-tenant.js
 * Or from apps/api: node scripts/reduce-to-single-tenant.js
 *
 * Requires: DATABASE_URL (or default postgresql://postgres:postgres@localhost:5432/supplify)
 *
 * After running:
 * - Run seed:demo-users so Keycloak has exactly 1 admin, 1 restaurant, 1 supplier.
 * - Login: Admin = admin@supplify.com, Restaurant = restaurant@supplify.com,
 *   Supplier = supplier@supplify.com (passwords from seed:demo-users).
 */
import 'dotenv/config'
import pg from 'pg'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/supplify',
  max: 2,
})

/** Same order as prodlike runReset; includes chat tables. */
async function deleteAllTenantData(client) {
  console.log('\n🗑️  Deleting all restaurant and supplier data...')
  const tables = [
    ['payment'],
    ['invoice_line_item', 'dunning'],
    ['credit_note_line_item'],
    ['credit_note'],
    ['account_statement'],
    ['invoice_sequence'],
    ['invoice'],
    ['receiving_line_item'],
    ['receiving_report'],
    ['order_item'],
    ['customer_order'],
    ['quick_list_item'],
    ['quick_list'],
    ['reservation_waitlist'],
    ['reservation'],
    ['reservation_table'],
    ['staff_shift_swap', 'staff_time_entry', 'staff_shift'],
    [
      'staff_pto_request',
      'staff_availability',
      'staff_announcement_ack',
      'staff_document',
      'staff_incident',
      'staff_performance_note',
      'staff_payroll_export',
    ],
    ['staff_member'],
    ['inventory_movement_log'],
    ['inventory_adjustment'],
    ['restaurant_inventory'],
    ['subscription'],
    ['usage_meter', 'feature_flag_override'],
    ['tenant_usage', 'tenant_plan_snapshot'],
    ['branch'],
    ['inventory_alert'],
    ['inventory'],
    ['product_inventory_settings'],
    ['waste_analytics'],
    ['restaurant_pricing'],
    ['price'],
    ['product'],
    ['catalog'],
    ['delivery_zone'],
    ['warehouse'],
    ['message_attachment'],
    ['message'],
    ['conversation_participant'],
    ['conversation'],
    ['restaurant'],
    ['supplier'],
  ]
  for (const group of tables) {
    for (const table of group) {
      try {
        await client.query('SAVEPOINT reset_sp')
        const res = await client.query(`DELETE FROM ${table}`)
        if (res.rowCount > 0) console.log(`   Deleted ${res.rowCount} from ${table}`)
        await client.query('RELEASE SAVEPOINT reset_sp')
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT reset_sp').catch(() => {})
        if (e.code === '42P01') continue
        console.error(`   Failed to delete from ${table}:`, e.message)
        throw e
      }
    }
  }
  console.log('   Reset complete.\n')
}

async function runSeed(client) {
  const seedPath = join(__dirname, '..', 'db', 'seed', 'seed.sql')
  const sql = readFileSync(seedPath, 'utf8')
  console.log('🌱 Running minimal seed (1 restaurant, 1 supplier)...')
  await client.query(sql)
  console.log('   Seed complete.\n')
}

async function main() {
  console.log('📦 Reduce to single tenant (1 admin, 1 restaurant, 1 supplier)\n')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await deleteAllTenantData(client)
    await runSeed(client)
    await client.query('COMMIT')
    console.log('✅ Done. You now have 1 admin, 1 restaurant, 1 supplier:')
    console.log('   • Admin:      admin@supplify.com')
    console.log('   • Restaurant: Golden Fork – restaurant@supplify.com')
    console.log('   • Supplier:   Fresh Foods Co. – supplier@supplify.com')
    console.log('   • Each tenant has an ACTIVE Free subscription.')
    console.log(
      '\n   Run seed:demo-users so Keycloak has exactly these 3 users, then use docs/MANUAL_TEST_CHECKLIST.md to test.'
    )
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('Error:', e.message)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

main()
