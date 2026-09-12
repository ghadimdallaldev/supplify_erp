#!/usr/bin/env node
/**
 * Print effective subscription plan limits and features per tier (from DB catalog).
 *
 *   pnpm run log:tier-limits
 *   node apps/api/scripts/log-tier-limits.mjs
 *
 * Limit display: explicit -1 = unlimited; missing canonical key = n/a (not unlimited).
 * Restaurant catalog excludes supplier-only `promotions` (use deal_redemptions_per_day).
 */
import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { pool } from '../src/lib/db.js'
import {
  RESTAURANT_LIMIT_KEYS,
  SUPPLIER_LIMIT_KEYS,
  HIDDEN_ENTITLEMENT_LIMIT_KEYS,
  formatPlanLimitDisplay,
} from '../src/lib/limit-resolution.js'
import {
  RESTAURANT_FEATURE_KEYS,
  SUPPLIER_FEATURE_KEYS,
  featureDisplayName,
} from '../src/lib/feature-keys.js'
import { isMainModule } from './lib/is-main.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const apiRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(apiRoot, '../..')

dotenv.config({ path: path.join(apiRoot, '.env') })
dotenv.config({ path: path.join(repoRoot, 'docker', '.env') })

function formatFeature(value) {
  if (value === true) return 'on'
  if (value === false) return 'off'
  if (value == null) return '(unset)'
  return String(value)
}

function sortKeys(obj, canonical) {
  const keys = new Set([...canonical, ...Object.keys(obj || {})])
  return [...keys].sort()
}

async function loadPlans() {
  const { rows } = await pool.query(
    `SELECT code, name, tenant_type, is_active, display_order, limits, features, price_per_month
     FROM subscription_plan
     ORDER BY tenant_type, display_order NULLS LAST, code`
  )
  return rows
}

async function loadGlobalFlags() {
  try {
    const { rows } = await pool.query(
      `SELECT feature_key, global_override FROM feature_flag ORDER BY feature_key`
    )
    return rows
  } catch (err) {
    if (err.code === '42P01') return []
    throw err
  }
}

function printSection(title) {
  console.log(`\n${'='.repeat(72)}\n${title}\n${'='.repeat(72)}`)
}

async function main() {
  printSection('Canonical keys (code)')
  console.log('Restaurant limits:', RESTAURANT_LIMIT_KEYS.join(', '))
  console.log('Supplier limits:', SUPPLIER_LIMIT_KEYS.join(', '))
  console.log(
    'Hidden from entitlements UI:',
    [...HIDDEN_ENTITLEMENT_LIMIT_KEYS].join(', ') || '(none)'
  )
  console.log('Restaurant features:', RESTAURANT_FEATURE_KEYS.length, 'keys')
  console.log('Supplier features:', SUPPLIER_FEATURE_KEYS.length, 'keys')

  const plans = await loadPlans()
  if (plans.length === 0) {
    console.warn('\nNo subscription_plan rows found. Run migrations / seed.')
    process.exit(1)
  }

  const tiers = [...new Set(plans.map((p) => p.code))].sort()
  printSection(`Tiers found (${tiers.join(', ')})`)

  for (const tenantType of ['RESTAURANT', 'SUPPLIER']) {
    const subset = plans.filter((p) => p.tenant_type === tenantType)
    if (subset.length === 0) continue

    printSection(`${tenantType} plans`)
    const limitCanon =
      tenantType === 'RESTAURANT' ? RESTAURANT_LIMIT_KEYS : SUPPLIER_LIMIT_KEYS
    const featureCanon =
      tenantType === 'RESTAURANT' ? RESTAURANT_FEATURE_KEYS : SUPPLIER_FEATURE_KEYS

    for (const plan of subset) {
      const limits = plan.limits || {}
      const features = plan.features || {}
      console.log(
        `\n--- ${plan.name} (${plan.code}) active=${plan.is_active} $${plan.price_per_month}/mo ---`
      )
      console.log('Limits:')
      for (const key of sortKeys(limits, limitCanon)) {
        if (HIDDEN_ENTITLEMENT_LIMIT_KEYS.has(key)) continue
        const defined = Object.prototype.hasOwnProperty.call(limits, key)
        const v = limits[key]
        const marker = limitCanon.includes(key) ? '' : ' [extra]'
        console.log(`  ${key}${marker}: ${formatPlanLimitDisplay(v, { defined })}`)
      }
      console.log('Features:')
      for (const key of sortKeys(features, featureCanon)) {
        const v = features[key]
        const marker = featureCanon.includes(key) ? '' : ' [legacy/extra]'
        console.log(
          `  ${key}${marker} (${featureDisplayName(key)}): ${formatFeature(v)}`
        )
      }
    }
  }

  const globals = await loadGlobalFlags()
  if (globals.length > 0) {
    printSection('Global feature_flag overrides')
    for (const row of globals) {
      const g =
        row.global_override === null ? 'inherit plan' : row.global_override ? 'force ON' : 'force OFF'
      console.log(`  ${row.feature_key}: ${g}`)
    }
  }

  printSection('Admin-configurable (via /api/admin-dashboard)')
  console.log(
    [
      '- GET/PATCH /plans — plan limits & features JSON',
      '- POST /plans/:planId/override-limit — plan-level limit boosts',
      '- Tenant limit overrides & feature_flag_override per tenant',
      '- Global feature_flag.global_override',
      '- POST change tenant subscription plan',
    ].join('\n')
  )
}

if (isMainModule(import.meta.url)) {
  main()
    .catch((err) => {
      console.error('log-tier-limits failed:', err.message)
      process.exit(1)
    })
    .finally(() => pool.end())
}
