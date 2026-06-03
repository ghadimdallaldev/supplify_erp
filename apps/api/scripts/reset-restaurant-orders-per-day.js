#!/usr/bin/env node
/**
 * Reset today's orders_per_day usage meter for a restaurant (by name).
 * Usage: node scripts/reset-restaurant-orders-per-day.js "Ghadi Dev restaurant"
 */
import pg from 'pg'
import { config } from 'dotenv'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, '..', '.env') })

const namePattern = process.argv[2] || '%Ghadi Dev%'
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

async function main() {
  const { rows: restaurants } = await pool.query(
    `SELECT id, name, slug FROM restaurant WHERE name ILIKE $1 ORDER BY name`,
    [namePattern.includes('%') ? namePattern : `%${namePattern}%`]
  )

  if (!restaurants.length) {
    console.error(`No restaurant matching: ${namePattern}`)
    process.exit(1)
  }

  if (restaurants.length > 1) {
    console.log('Multiple matches — using all:')
    restaurants.forEach((r) => console.log(`  - ${r.name} (${r.id})`))
  }

  for (const restaurant of restaurants) {
    const { rows: before } = await pool.query(
      `SELECT meter_type, current_value, period_start_date, limit_value, is_over_limit
       FROM usage_meter
       WHERE tenant_id = $1 AND tenant_type = 'RESTAURANT' AND meter_type = 'orders_per_day'
       ORDER BY period_start_date DESC`,
      [restaurant.id]
    )

    const { rowCount } = await pool.query(
      `DELETE FROM usage_meter
       WHERE tenant_id = $1
         AND tenant_type = 'RESTAURANT'
         AND meter_type = 'orders_per_day'`,
      [restaurant.id]
    )

    console.log(`\n✓ ${restaurant.name} (${restaurant.id})`)
    console.log(`  Removed ${rowCount} orders_per_day meter row(s)`)
    if (before.length) {
      console.log('  Previous:')
      before.forEach((u) =>
        console.log(
          `    ${u.period_start_date}: ${u.current_value}/${u.limit_value ?? '∞'} over_limit=${u.is_over_limit}`
        )
      )
    } else {
      console.log('  (no meter rows were stored)')
    }
    console.log('  Daily order count for today is now 0 — you can place orders again.')
  }

  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
