#!/usr/bin/env node
/**
 * Full demo dataset for local feature testing.
 *
 * Runs migrations, prod-like data (restaurants, suppliers, orders, reservations,
 * staff, invoices, warehouses, inventory), then quick lists, chats, and Keycloak logins.
 *
 * WARNING: Prod-like seed deletes ALL existing restaurants and suppliers.
 *
 * Usage (repo root):
 *   pnpm run seed:full
 *
 * Env:
 *   ALLOW_PRODLIKE_SEED=true (set automatically)
 *   SEED=1337 (optional, deterministic data)
 *   SKIP_KEYCLOAK=true — skip account creation if Keycloak is down
 *   KEYCLOAK_BASE_URL (default http://localhost:8180)
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const apiRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(apiRoot, '../..')

dotenv.config({ path: path.join(apiRoot, '.env') })
dotenv.config({ path: path.join(repoRoot, 'docker', '.env') })

const env = {
  ...process.env,
  ALLOW_PRODLIKE_SEED: 'true',
  NODE_ENV: process.env.NODE_ENV || 'development',
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

console.log('╔══════════════════════════════════════════════════════════╗')
console.log('║  Supplify — full feature seed (prod-like + chats + auth) ║')
console.log('╚══════════════════════════════════════════════════════════╝')
console.log('\n⚠  This removes all existing restaurants and suppliers, then recreates demo data.\n')

runStep('Database migrations', 'migrate.js')

runStep('Prod-like dataset (10 restaurants, 50 suppliers, orders, reservations, staff, invoices…)', 'prodlike.seed.js')

runStep('Demo tenants (restaurant@supplify.com / supplier@supplify.com)', 'seed-demo-tenants.js')

runStep('Plan-tier demos (Free / Silver / Gold restaurants & suppliers)', 'seed-plan-tier-demos.js')

runStep('Subscription billing (payment methods, grace & lock demos)', 'seed-billing.js')

runStep('Quick lists (per restaurant)', 'seed-quick-lists.js')

runStep('Chats (restaurant ↔ supplier with orders)', 'seed-chats.js')

runStep('Reports, disputes & promotions/deals', 'seed-feature-demos.js')

runStep('Demo-readiness extras (expiry, coupon, near-limit quota)', 'seed-demo-readiness-extras.js')

if (process.env.SKIP_KEYCLOAK === 'true') {
  console.log('\n⏭  Skipping Keycloak (SKIP_KEYCLOAK=true)')
} else {
  console.log('\n▶ Keycloak accounts (prod-like tenants + demo users)')
  const kcScripts = [
    ['seed-accounts-for-prodlike.js', 'Prod-like tenant logins'],
    ['seed-demo-users.js', 'Demo users (admin / supplier / restaurant)'],
  ]
  for (const [script, label] of kcScripts) {
    console.log(`  • ${label}`)
    const result = spawnSync(process.execPath, [path.join(__dirname, script)], {
      cwd: apiRoot,
      env,
      stdio: 'inherit',
    })
    if (result.status !== 0) {
      console.warn(`  ⚠ ${label} failed — is Keycloak running at ${env.KEYCLOAK_BASE_URL}?`)
      console.warn('    Retry later: pnpm run seed:accounts && pnpm run seed:demo-users')
      break
    }
  }
}

console.log(`
✅ Full seed finished.

Log in (Keycloak):
  • Demo: restaurant@supplify.com / SupplifyRestaurant1!
  • Demo: supplier@supplify.com / SupplifySupplier1!
  • Demo: admin@supplify.com / SupplifyAdmin1!
  • Plan tiers (password Supplify1!): restaurant-free|silver|gold@supplify.com, supplier-free|silver|gold@supplify.com
  • Prod-like restaurants: restaurant-1@test.com … restaurant-10@test.com / Supplify1!
  • Prod-like suppliers: contact-0@supplier0.test … / Supplify1!

What to try:
  • Dashboard, orders, cart, fulfillment, receiving
  • Reservations & staff
  • Chat (pick a restaurant, open Messages)
  • Invoices & quick lists
  • Supplier products & warehouses
`)
