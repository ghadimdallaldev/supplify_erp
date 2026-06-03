/**
 * Backfill restaurant_team + enrich staff_member for existing prod-like restaurants
 * (no wipe). Run after seed:prodlike if team tab was empty.
 *
 *   pnpm run seed:prodlike-team
 */
import 'dotenv/config'
import pg from 'pg'
import { createSeededRng, intBetween, pick, shuffle } from './seed/seedRng.js'
import { isMainModule } from './lib/is-main.mjs'

const STAFF_ROLE_TO_TEAM_ROLE = {
  manager: 'manager',
  cashier: 'finance',
  chef: 'kitchen',
  receiver: 'purchasing',
  accountant: 'finance',
  waiter: 'kitchen',
}

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/supplify',
})

async function main() {
  const client = await pool.connect()
  const rng = createSeededRng(1337)
  let teamAdded = 0
  try {
    const { rows: restaurants } = await client.query(
      `SELECT id, name, contact_email, phone FROM restaurant
       WHERE slug NOT LIKE 'plan-demo-%' AND slug NOT IN ('golden-fork-restaurant')
       ORDER BY name`
    )
    for (const r of restaurants) {
      const { rows: existing } = await client.query(
        'SELECT 1 FROM restaurant_team WHERE restaurant_id = $1 LIMIT 1',
        [r.id]
      )
      if (existing.length > 0) continue

      const { rows: branches } = await client.query(
        'SELECT id FROM branch WHERE restaurant_id = $1 OR tenant_id = $1 ORDER BY created_at',
        [r.id]
      )
      const mainBranch = branches[0]?.id || null

      await client.query(
        `INSERT INTO restaurant_team (restaurant_id, branch_id, name, email, phone, role, is_primary, is_active)
         VALUES ($1, $2, $3, $4, $5, 'owner', true, true)`,
        [r.id, mainBranch, `${r.name} Owner`, r.contact_email, r.phone]
      )
      teamAdded++

      const { rows: staff } = await client.query(
        `SELECT id, first_name, last_name, email, phone, role FROM staff_member
         WHERE restaurant_id = $1 AND status = 'ACTIVE'`,
        [r.id]
      )
      for (const s of shuffle(rng, staff).slice(0, Math.min(4, staff.length))) {
        await client.query(
          `INSERT INTO restaurant_team (restaurant_id, branch_id, name, email, phone, role, is_primary, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, false, true)`,
          [
            r.id,
            branches.length ? pick(rng, branches).id : null,
            `${s.first_name} ${s.last_name}`.trim(),
            s.email,
            s.phone,
            STAFF_ROLE_TO_TEAM_ROLE[s.role] || 'manager',
          ]
        )
        teamAdded++
      }
    }
    console.log(
      `✅ Backfilled ${teamAdded} restaurant_team rows for ${restaurants.length} restaurants checked`
    )
  } finally {
    client.release()
    await pool.end()
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
