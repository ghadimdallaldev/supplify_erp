/**
 * Wipe all restaurant/supplier tenants and commercial data (no re-seed).
 *
 * Run from repo root:  pnpm --filter @supplify/api db:wipe-commercial
 * Or from apps/api:    node scripts/wipe-commercial-only.js
 */
import 'dotenv/config'
import pg from 'pg'
import { isMainModule } from './lib/is-main.mjs'
import { runCommercialWipe } from './seed/wipe-commercial-data.js'

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/supplify',
  max: 2,
})

async function main() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await runCommercialWipe(client)
    await client.query('COMMIT')
    console.log('✅ Commercial data wiped. Plans and admin users are unchanged.')
    console.log(
      '   Create tenants manually or run a seed when you are ready (e.g. seed:plan-tiers).'
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

if (isMainModule(import.meta.url)) {
  main()
}
