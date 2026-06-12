/**
 * Nuclear reset: drop public schema (all tables, users, sessions, migrations)
 * then re-apply SQL migrations for an empty database.
 *
 * DEV ONLY — never run against Railway preprod/prod.
 *
 * Usage: node scripts/wipe-all-data.js
 * Requires DATABASE_URL in apps/api/.env
 */
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { pool, query } from '../src/lib/db.js'
import { spawn } from 'node:child_process'
import { isMainModule } from './lib/is-main.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const apiRoot = join(__dirname, '..')

dotenv.config({ path: join(apiRoot, '.env') })

async function wipeAll() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DB_WIPE !== 'true') {
    console.error('Refusing to wipe production database. Set ALLOW_DB_WIPE=true to override.')
    process.exit(1)
  }

  const { rows } = await query('SELECT current_database() AS db, current_user AS usr')
  console.log(`\n⚠️  Wiping ALL data in database "${rows[0].db}" (user: ${rows[0].usr})...\n`)

  await query('DROP SCHEMA public CASCADE')
  await query('CREATE SCHEMA public')
  await query('GRANT ALL ON SCHEMA public TO public')
  await query('GRANT ALL ON SCHEMA public TO postgres').catch(() => {})

  console.log('✓ Dropped and recreated public schema (empty)\n')
  await pool.end()

  console.log('▶ Re-running migrations...\n')
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(__dirname, 'migrate.js')], {
      cwd: apiRoot,
      env: process.env,
      stdio: 'inherit',
    })
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`migrate exited ${code}`))
    )
  })

  console.log('\n✅ Database wiped and migrations re-applied. No users or tenant data remain.')
  console.log(
    '   Keycloak accounts are separate — delete users in Keycloak if you need a clean login slate.\n'
  )
}

if (isMainModule(import.meta.url)) {
  wipeAll().catch((err) => {
    console.error('Wipe failed:', err.message)
    process.exit(1)
  })
}

export { wipeAll }
