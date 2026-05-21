/**
 * Demo restaurants & suppliers on Free, Bronze (Silver tier), Gold, and Platinum plans.
 * Does not remove prod-like or golden-fork demo tenants.
 *
 * Run: pnpm run seed:plan-tiers
 * Password (Keycloak): Supplify1!
 */
import 'dotenv/config'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { pool } from '../src/lib/db.js'
import { isMainModule } from './lib/is-main.mjs'
import { getScopedInsertShape, insertScopedLocation } from './seed/scopedLocation.js'
import { applyPlanFeaturePatches } from './seed/tierDefinitions.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const SLUG_PREFIX = 'plan-demo-'
const SEED_PASSWORD = process.env.SEED_ACCOUNTS_PASSWORD || 'Supplify1!'

/** Bronze plan = "Silver" tier in product marketing. */
const TIERS = [
  { tier: 'free', planCode: 'free', label: 'Free' },
  { tier: 'silver', planCode: 'bronze', label: 'Silver' },
  { tier: 'gold', planCode: 'gold', label: 'Gold' },
  { tier: 'platinum', planCode: 'platinum', label: 'Platinum' },
]

const RESTAURANTS = TIERS.map(({ tier, label }) => ({
  slug: `${SLUG_PREFIX}restaurant-${tier}`,
  name: `${label} Plate Restaurant`,
  email: `restaurant-${tier}@supplify.com`,
  tier,
}))

const SUPPLIERS = TIERS.map(({ tier, label }) => ({
  slug: `${SLUG_PREFIX}supplier-${tier}`,
  name: `${label} Harvest Supplier`,
  email: `supplier-${tier}@supplify.com`,
  tier,
}))

function uuid() {
  return crypto.randomUUID()
}

const addressJson = JSON.stringify({ city: 'Dubai', country: 'UAE' })

async function getPlan(client, code, tenantType) {
  const { rows } = await client.query(
    `SELECT id, name FROM subscription_plan
     WHERE code = $1 AND tenant_type = $2 AND is_active = true
     LIMIT 1`,
    [code, tenantType]
  )
  if (!rows[0]) throw new Error(`Plan not found: ${code} / ${tenantType}`)
  return rows[0]
}

async function clearPlanTierDemos(client) {
  const slugs = [...RESTAURANTS.map((r) => r.slug), ...SUPPLIERS.map((s) => s.slug)]
  const { rows: restaurants } = await client.query(
    `SELECT id FROM restaurant WHERE slug = ANY($1::text[])`,
    [slugs]
  )
  const { rows: suppliers } = await client.query(
    `SELECT id FROM supplier WHERE slug = ANY($1::text[])`,
    [slugs]
  )
  for (const r of restaurants) {
    await client.query('DELETE FROM subscription WHERE tenant_id = $1 AND tenant_type = $2', [
      r.id,
      'RESTAURANT',
    ])
    await client.query('DELETE FROM branch WHERE restaurant_id = $1 OR tenant_id = $1', [r.id])
    await client.query('DELETE FROM restaurant WHERE id = $1', [r.id])
  }
  for (const s of suppliers) {
    await client.query('DELETE FROM subscription WHERE tenant_id = $1 AND tenant_type = $2', [
      s.id,
      'SUPPLIER',
    ])
    await client.query(
      'DELETE FROM inventory WHERE product_id IN (SELECT id FROM product WHERE supplier_id = $1)',
      [s.id]
    )
    await client.query(
      'DELETE FROM price WHERE product_id IN (SELECT id FROM product WHERE supplier_id = $1)',
      [s.id]
    )
    await client.query('DELETE FROM product WHERE supplier_id = $1', [s.id])
    await client.query('DELETE FROM catalog WHERE supplier_id = $1', [s.id])
    await client.query('DELETE FROM warehouse WHERE tenant_id = $1 OR supplier_id = $1', [s.id])
    await client.query('DELETE FROM supplier WHERE id = $1', [s.id])
  }
}

async function insertSubscription(client, tenantId, tenantType, planCode) {
  const plan = await getPlan(client, planCode, tenantType)
  await client.query(
    `INSERT INTO subscription (
       id, tenant_id, tenant_type, plan_id, plan_name, status, billing_cycle,
       current_period_start, current_period_end, next_billing_date, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, 'ACTIVE', 'MONTHLY',
       now(), now() + interval '1 month', now() + interval '1 month', now(), now()
     )`,
    [uuid(), tenantId, tenantType, plan.id, plan.name]
  )
}

async function seedSupplier(client, def, warehouseShape) {
  const tier = TIERS.find((t) => t.tier === def.tier)
  const id = uuid()
  await client.query(
    `INSERT INTO supplier (id, name, slug, vat_no, contact_email, phone, address_json, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())`,
    [
      id,
      def.name,
      def.slug,
      `VAT-${def.tier.toUpperCase()}`,
      def.email,
      '+971500000001',
      addressJson,
    ]
  )
  const whId = uuid()
  await insertScopedLocation(client, 'warehouse', warehouseShape, {
    id: whId,
    tenantId: id,
    name: 'Main Warehouse',
    code: 'MAIN',
    addressJson,
    isMain: true,
  })
  await client.query(`INSERT INTO catalog (supplier_id, name, is_active) VALUES ($1, $2, true)`, [
    id,
    `${def.name} Catalog`,
  ])
  for (let i = 1; i <= 5; i++) {
    const productId = uuid()
    const sku = `DEMO-${def.tier.toUpperCase()}-${i}`
    await client.query(
      `INSERT INTO product (id, supplier_id, sku, name, unit, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'kg', now(), now())`,
      [productId, id, sku, `${tier.label} Product ${i}`]
    )
    await client.query(
      `INSERT INTO price (product_id, currency, amount, valid_from) VALUES ($1, 'USD', $2, now())`,
      [productId, 5 + i]
    )
    await client.query(
      `INSERT INTO inventory (product_id, warehouse_id, available_qty, reserved_qty, updated_at)
       VALUES ($1, $2, $3, 0, now())
       ON CONFLICT (product_id) DO UPDATE SET warehouse_id = $2, available_qty = $3`,
      [productId, whId, 50 + i * 10]
    )
  }
  await insertSubscription(client, id, 'SUPPLIER', tier.planCode)
  return { id, email: def.email, tier: def.tier, plan: tier.planCode }
}

async function seedRestaurant(client, def, branchShape) {
  const tier = TIERS.find((t) => t.tier === def.tier)
  const id = uuid()
  await client.query(
    `INSERT INTO restaurant (id, name, slug, trade_license_no, contact_email, phone, address_json, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())`,
    [
      id,
      def.name,
      def.slug,
      `TL-${def.tier.toUpperCase()}`,
      def.email,
      '+971500000002',
      addressJson,
    ]
  )
  await insertScopedLocation(client, 'branch', branchShape, {
    id: uuid(),
    tenantId: id,
    name: 'Main Branch',
    code: 'MAIN',
    addressJson,
    isMain: true,
  })
  await insertSubscription(client, id, 'RESTAURANT', tier.planCode)
  return { id, email: def.email, tier: def.tier, plan: tier.planCode }
}

export async function seedPlanTierDemos() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await clearPlanTierDemos(client)
    const branchShape = await getScopedInsertShape(client, 'branch', ['restaurant_id', 'tenant_id'])
    const warehouseShape = await getScopedInsertShape(client, 'warehouse', [
      'supplier_id',
      'tenant_id',
    ])

    await applyPlanFeaturePatches(client)

    console.log('   Restaurants (Free / Silver·Bronze / Gold / Platinum):')
    for (const def of RESTAURANTS) {
      const r = await seedRestaurant(client, def, branchShape)
      console.log(`     • ${r.email} → ${r.plan} plan`)
    }
    console.log('   Suppliers (Free / Silver·Bronze / Gold / Platinum):')
    for (const def of SUPPLIERS) {
      const s = await seedSupplier(client, def, warehouseShape)
      console.log(`     • ${s.email} → ${s.plan} plan`)
    }
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

async function ensureKeycloakUsers() {
  const KEYCLOAK_BASE_URL = process.env.KEYCLOAK_BASE_URL || 'http://localhost:8180'
  const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'Supplify'
  const ADMIN_USERNAME = process.env.KEYCLOAK_ADMIN_USERNAME || 'admin'
  const ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin'

  const tokenRes = await fetch(
    `${KEYCLOAK_BASE_URL.replace(/\/$/, '')}/realms/master/protocol/openid-connect/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: 'admin-cli',
        username: ADMIN_USERNAME,
        password: ADMIN_PASSWORD,
      }),
    }
  )
  if (!tokenRes.ok) {
    console.warn('   ⚠ Keycloak unavailable — create logins manually or run with Keycloak up')
    return
  }
  const { access_token: token } = await tokenRes.json()
  const base = `${KEYCLOAK_BASE_URL.replace(/\/$/, '')}/admin/realms/${KEYCLOAK_REALM}`

  for (const realmRole of ['restaurant', 'supplier']) {
    const roleRes = await fetch(`${base}/roles/${realmRole}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!roleRes.ok) continue
    const role = await roleRes.json()
    const accounts = realmRole === 'restaurant' ? RESTAURANTS : SUPPLIERS
    for (const acc of accounts) {
      const findRes = await fetch(
        `${base}/users?email=${encodeURIComponent(acc.email)}&exact=true`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      )
      const existing = (await findRes.json())[0]
      if (existing) continue
      const createRes = await fetch(`${base}/users`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: acc.slug,
          email: acc.email,
          enabled: true,
          emailVerified: true,
          credentials: [{ type: 'password', value: SEED_PASSWORD, temporary: false }],
        }),
      })
      if (createRes.status === 409) continue
      if (!createRes.ok) continue
      const loc = createRes.headers.get('Location')
      const userId = loc?.split('/').pop()
      if (userId) {
        await fetch(`${base}/users/${userId}/role-mappings/realm`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify([{ id: role.id, name: role.name }]),
        })
      }
    }
  }
  console.log('   Keycloak users ensured (password: Supplify1!)')
}

async function main() {
  console.log('📊 Seeding plan-tier demo tenants (Free / Silver·Bronze / Gold / Platinum)...\n')
  await seedPlanTierDemos()
  if (process.env.SKIP_KEYCLOAK !== 'true') {
    await ensureKeycloakUsers()
  }
  console.log('\n✅ Plan-tier demos ready. Log in with any email above and password Supplify1!')
  console.log('   (Silver tier uses the Bronze plan in the database.)')
}

if (isMainModule(import.meta.url)) {
  main()
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
    .finally(() => pool.end())
}
