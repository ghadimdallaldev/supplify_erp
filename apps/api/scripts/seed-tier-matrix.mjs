#!/usr/bin/env node
/**
 * Full tier matrix: 10 restaurants + 10 suppliers per plan tier (Free/Silver/Gold/Platinum),
 * then chats, quick lists, billing, disputes/deals, and Keycloak logins.
 *
 *   pnpm run seed:tier-matrix
 *
 * WARNING: Wipes all restaurants, suppliers, and non-admin app users.
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { existsSync } from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const apiRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(apiRoot, '../..')

dotenv.config({ path: path.join(apiRoot, '.env') })
const dockerSync = path.join(apiRoot, '.env.docker-sync')
if (existsSync(dockerSync)) {
  dotenv.config({ path: dockerSync, override: true })
}
dotenv.config({ path: path.join(repoRoot, 'docker', '.env') })

const env = {
  ...process.env,
  ALLOW_PRODLIKE_SEED: 'true',
  NODE_ENV: process.env.NODE_ENV || 'development',
  TENANTS_PER_TIER: process.env.TENANTS_PER_TIER || '10',
  KEYCLOAK_BASE_URL: process.env.KEYCLOAK_BASE_URL || 'http://localhost:8180',
  KEYCLOAK_ADMIN_PASSWORD: process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin',
}

function runStep(label, scriptName, extraEnv = {}) {
  console.log(`\n▶ ${label}`)
  const scriptPath = path.join(__dirname, scriptName)
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: apiRoot,
    env: { ...env, ...extraEnv },
    stdio: 'inherit',
    shell: false,
  })
  if (result.status !== 0) {
    console.error(`\n✗ ${label} failed (exit ${result.status ?? 'unknown'})`)
    process.exit(result.status ?? 1)
  }
}

const perTier = env.TENANTS_PER_TIER

console.log('╔══════════════════════════════════════════════════════════════╗')
console.log(`║  Tier matrix — ${perTier}× restaurant + ${perTier}× supplier per tier   ║`)
console.log('╚══════════════════════════════════════════════════════════════╝')
console.log('\n⚠  Wipes all tenants and non-admin users.\n')

runStep('Database migrations', 'migrate.js')
runStep(
  `Tier tenants (${perTier} per tier × 4 tiers)`,
  'seed-tier-catalog.js',
  { TENANTS_PER_TIER: perTier }
)
runStep('Demo tenants (restaurant@ / supplier@supplify.com)', 'seed-demo-tenants.js')
runStep('Subscription billing samples', 'seed-billing.js')
runStep('Quick lists (all restaurants)', 'seed-quick-lists.js')
runStep('Chats (restaurant ↔ supplier pairs from orders)', 'seed-chats.js')
runStep('Disputes, deals & reports', 'seed-feature-demos.js')

if (process.env.SKIP_KEYCLOAK !== 'true') {
  runStep('Platform admin (admin@supplify.com)', 'seed-demo-users.js')
}

console.log(`
✅ Tier matrix seed finished.

Log in (password for all tier owners & team: Supplify1!)
  • Owners: restaurant-{free|silver|gold|platinum}-01…${String(perTier).padStart(2, '0')}@supplify.com
  • Owners: supplier-{free|silver|gold|platinum}-01…${String(perTier).padStart(2, '0')}@supplify.com
  • Team suffixes: -manager, -purchaser (restaurant) / -sales (supplier)
  • Admin: admin@supplify.com / SupplifyAdmin1!
  • Demo: restaurant@supplify.com / SupplifyRestaurant1!  supplier@supplify.com / SupplifySupplier1!

Old prod-like logins (restaurant-1@test.com, etc.) were removed by this wipe — use tier emails above or run pnpm run seed:prodlike.

Start the app: pnpm dev -- --no-migrate
`)
