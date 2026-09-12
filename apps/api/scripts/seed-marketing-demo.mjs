#!/usr/bin/env node
/**
 * Marketing demo seed — polished restaurant + supplier pair for screenshots & demos.
 *
 * Creates:
 *   Marina Trattoria (restaurant) ↔ Al Barsha Foods Trading (supplier)
 *   + fulfillment drivers, routes, dispatch-ready orders
 *   + FOH reservations with floor layout
 *   + B2C consumer menu & public URLs
 *   + removes smoke_test_* artifacts
 *
 * Run locally:
 *   node apps/api/scripts/seed-marketing-demo.mjs
 *
 * Run on Railway dev:
 *   cd apps/api && $env:DATABASE_SSL='false'; railway run node scripts/seed-marketing-demo.mjs
 */
import 'dotenv/config'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool } from '../src/lib/db.js'
import { disconnectCache } from '../src/lib/cache.js'
import { seedBusinessEngineerDemo } from './seed-business-engineer-demo.js'
import {
  seedFulfillmentMarketingData,
  cleanupSmokeTestArtifacts,
  enhanceMarketingReservations,
} from './seed/fulfillment-marketing-data.js'
import { SEED_PASSWORD } from './seed/businessDemoData.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const apiRoot = path.resolve(__dirname, '..')

const MARKETING = {
  restaurantSlug: 'be-demo-marina-trattoria',
  restaurantEmail: 'restaurant-marina@supplify.com',
  supplierSlug: 'be-demo-al-barsha-foods',
  supplierEmail: 'supplier-al-barsha@supplify.com',
  restaurantName: 'Marina Trattoria',
  supplierName: 'Al Barsha Foods Trading',
}

const WEB_ORIGIN =
  process.env.MARKETING_WEB_ORIGIN || process.env.WEB_ORIGIN || 'https://app-dev.supplifyerp.com'
process.env.WEB_ORIGIN = WEB_ORIGIN

async function loadMarketingPair(client) {
  const { rows: restaurants } = await client.query(
    `SELECT id, name, slug FROM restaurant WHERE slug = $1`,
    [MARKETING.restaurantSlug]
  )
  const { rows: suppliers } = await client.query(
    `SELECT id, name, slug FROM supplier WHERE slug = $1`,
    [MARKETING.supplierSlug]
  )
  if (!restaurants[0] || !suppliers[0]) {
    throw new Error(
      'Marketing tenants missing — seedBusinessEngineerDemo may have failed. Expected slugs: ' +
        `${MARKETING.restaurantSlug}, ${MARKETING.supplierSlug}`
    )
  }

  const restaurantId = restaurants[0].id
  const supplierId = suppliers[0].id

  const { rows: branches } = await client.query(
    `SELECT id FROM branch WHERE restaurant_id = $1 OR tenant_id = $1 ORDER BY created_at LIMIT 1`,
    [restaurantId]
  )
  const { rows: warehouses } = await client.query(
    `SELECT id FROM warehouse WHERE supplier_id = $1 OR tenant_id = $1 ORDER BY created_at LIMIT 1`,
    [supplierId]
  )
  const { rows: products } = await client.query(
    `SELECT p.id, COALESCE(pr.amount, 10)::float AS price
     FROM product p
     LEFT JOIN LATERAL (
       SELECT amount FROM price WHERE product_id = p.id ORDER BY valid_from DESC LIMIT 1
     ) pr ON true
     WHERE p.supplier_id = $1
     ORDER BY p.sku
     LIMIT 24`,
    [supplierId]
  )

  return {
    restaurantId,
    supplierId,
    branchId: branches[0]?.id,
    warehouseId: warehouses[0]?.id,
    products,
  }
}

async function enablePublicSurfaces(client, supplierId, restaurantId) {
  await client.query(
    `UPDATE supplier SET public_catalog_enabled = true, updated_at = now() WHERE id = $1`,
    [supplierId]
  )
  await client.query(
    `UPDATE restaurant SET updated_at = now() WHERE id = $1`,
    [restaurantId]
  )
}

function runB2cSeed() {
  console.log('\n▶ Seeding B2C consumer menu…')
  const result = spawnSync(process.execPath, ['scripts/seed-b2c-demo.mjs', '--force'], {
    cwd: apiRoot,
    env: {
      ...process.env,
      B2C_DEMO_SLUG: MARKETING.restaurantSlug,
      WEB_ORIGIN,
      MARKETING_WEB_ORIGIN: WEB_ORIGIN,
    },
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    throw new Error('seed-b2c-demo.mjs failed')
  }
}

function printSummary(ctx, fulfillment) {
  const base = WEB_ORIGIN.replace(/\/$/, '')
  const branchQ = ctx.branchId ? `?branchId=${ctx.branchId}` : ''

  console.log('\n' + '='.repeat(72))
  console.log('✅ Marketing demo ready')
  console.log('='.repeat(72))
  console.log('\nLogins (password: ' + SEED_PASSWORD + '):')
  console.log(`  Restaurant  ${MARKETING.restaurantEmail}  →  ${MARKETING.restaurantName}`)
  console.log(`  Supplier    ${MARKETING.supplierEmail}  →  ${MARKETING.supplierName}`)
  console.log('\nFulfillment:')
  console.log(`  Drivers: ${fulfillment.drivers} · Active orders: ${fulfillment.activeOrders}`)
  console.log(`  Route: ${fulfillment.routeNumber} (${fulfillment.routeStops} stops, IN_PROGRESS)`)
  console.log('\nPublic URLs:')
  console.log(`  B2C menu:       ${base}/order/${MARKETING.restaurantSlug}/menu${branchQ}`)
  console.log(`  B2C storefront: ${base}/order/${MARKETING.restaurantSlug}`)
  console.log(`  Reservations:   ${base}/reserve/${MARKETING.restaurantSlug}`)
  console.log(`  Supplier catalog: ${base}/supplier/${MARKETING.supplierSlug}`)
  console.log('\nApp screens:')
  console.log(`  Restaurant dashboard:  ${base}/app/dashboard`)
  console.log(`  Supplier command ctr:  ${base}/app/command-center`)
  console.log(`  Fulfillment board:     ${base}/app/fulfillment`)
  console.log(`  Reservations (FOH):    ${base}/app/reservations`)
  console.log('='.repeat(72) + '\n')
}

async function main() {
  console.log('🎯 Marketing demo seed\n')
  console.log(`Target: ${MARKETING.restaurantName} ↔ ${MARKETING.supplierName}`)
  console.log(`Web origin: ${WEB_ORIGIN}\n`)

  console.log('▶ Step 1: Business engineer demo (catalogs, orders, deals, Keycloak)…')
  await seedBusinessEngineerDemo()

  const client = await pool.connect()
  try {
    console.log('\n▶ Step 2: Cleanup smoke_test artifacts…')
    await cleanupSmokeTestArtifacts(client)

    console.log('▶ Step 3: Load marketing tenant IDs…')
    const ctx = await loadMarketingPair(client)
    if (!ctx.branchId || !ctx.warehouseId) {
      throw new Error('Branch or warehouse missing for marketing tenants')
    }

    console.log('▶ Step 4: Fulfillment / dispatch demo data…')
    const fulfillment = await seedFulfillmentMarketingData(client, {
      supplierId: ctx.supplierId,
      restaurantId: ctx.restaurantId,
      branchId: ctx.branchId,
      warehouseId: ctx.warehouseId,
      products: ctx.products,
      supplierSlug: MARKETING.supplierSlug,
    })

    console.log('▶ Step 5: Reservations floor plan + guest list…')
    await enhanceMarketingReservations(client, ctx.restaurantId, ctx.branchId)

    console.log('▶ Step 6: Enable public catalog…')
    await enablePublicSurfaces(client, ctx.supplierId, ctx.restaurantId)

    runB2cSeed()
    printSummary(ctx, fulfillment)
  } finally {
    client.release()
    await disconnectCache()
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
