#!/usr/bin/env node
/**
 * Full reset: tier catalog only (3× restaurant + 3× supplier) with prod-like data.
 *
 *   pnpm run seed:tier-catalog
 *
 * WARNING: Deletes all restaurants, suppliers, and non-admin app users.
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
}

function runStep(label, scriptName) {
  console.log(`\n▶ ${label}`)
  const scriptPath = path.join(__dirname, scriptName)
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: apiRoot,
    env,
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    console.error(`\n✗ ${label} failed`)
    process.exit(result.status ?? 1)
  }
}

console.log('╔══════════════════════════════════════════════════════════╗')
console.log('║  Tier catalog seed — 1 resto + 1 supplier per plan tier   ║')
console.log('╚══════════════════════════════════════════════════════════╝')
console.log('\n⚠  Wipes all tenants and non-admin users.\n')

runStep('Migrations', 'migrate.js')
runStep('Tier catalog (Free / Silver / Gold / Platinum)', 'seed-tier-catalog.js')
runStep('Disputes, deals & reports samples', 'seed-feature-demos.js')

if (process.env.SKIP_KEYCLOAK !== 'true') {
  console.log('\n▶ Keycloak accounts for tier users (password: Supplify1!)')
  console.log('  (Admin only: pnpm run seed:demo-users → admin@supplify.com / SupplifyAdmin1!)')
}

console.log('\n✅ Tier catalog ready. Start the app: pnpm dev -- --no-migrate')
