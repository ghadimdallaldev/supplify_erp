/**
 * Wipe commercial data and seed restaurants + suppliers per plan tier
 * (Free / Silver / Gold / Platinum) with prod-like volume, Keycloak logins,
 * and tenant roles for Team assignment.
 *
 * Run: pnpm run seed:tier-catalog
 *      pnpm run seed:tier-matrix   (10× resto + 10× supplier per tier)
 *
 * Env: TENANTS_PER_TIER (default 1) — use 10 for the full tier matrix
 */
import 'dotenv/config'
import { pool } from '../src/lib/db.js'
import { disconnectCache } from '../src/lib/cache.js'
import { assignDefaultRoleForTenant } from '../src/lib/rbac.js'
import {
  ensureTenantSystemRoles,
  assignTenantUserRole,
  getRoleIdByName,
} from '../src/lib/tenant-roles.js'
import { isMainModule } from './lib/is-main.mjs'
import { runCommercialWipe } from './seed/wipe-commercial-data.js'
import { createSeededRng, intBetween, pick, shuffle } from './seed/seedRng.js'
import { randomDateBetween, addDays, todayStart } from './seed/timeUtils.js'
import { getScopedInsertShape, insertScopedLocation } from './seed/scopedLocation.js'
import {
  TIERS,
  RESTAURANT_TEAM_MEMBERS,
  SUPPLIER_TEAM_MEMBERS,
  SEED_PASSWORD,
  restaurantDef,
  supplierDef,
  applyPlanFeaturePatches,
} from './seed/tierDefinitions.js'
import { backfillAllCommercialAuditLogs } from './seed/audit-demo-backfill.js'

const rng = createSeededRng(parseInt(process.env.SEED || '1337', 10))
const TENANTS_PER_TIER = Math.max(
  1,
  Math.min(50, parseInt(process.env.TENANTS_PER_TIER || '1', 10))
)
const MULTI_TENANT = TENANTS_PER_TIER > 1
const addressJson = JSON.stringify({ city: 'Dubai', country: 'UAE' })

/** Scale per-tenant volume down when seeding many tenants per tier. */
function volumeScale() {
  if (TENANTS_PER_TIER >= 10) return { products: [10, 14], orders: 12, reservations: 12, tables: 6 }
  if (TENANTS_PER_TIER >= 5) return { products: [12, 18], orders: 20, reservations: 18, tables: 6 }
  return { products: [18, 28], orders: 45, reservations: 35, tables: 8 }
}

function uuid() {
  return crypto.randomUUID()
}

function emailFor(tenantEmail, suffix) {
  const [local, domain] = tenantEmail.split('@')
  return `${local}-${suffix}@${domain}`
}

async function getPlan(client, code, tenantType) {
  const { rows } = await client.query(
    `SELECT id, name FROM subscription_plan
     WHERE code = $1 AND tenant_type = $2 AND is_active = true LIMIT 1`,
    [code, tenantType]
  )
  if (!rows[0]) throw new Error(`Plan not found: ${code} / ${tenantType}`)
  return rows[0]
}

async function insertSubscription(client, tenantId, tenantType, planCode) {
  const plan = await getPlan(client, planCode, tenantType)
  await client.query(
    `INSERT INTO subscription (
       id, tenant_id, tenant_type, plan_id, plan_name, status, billing_cycle,
       current_period_start, current_period_end, next_billing_date, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, 'ACTIVE', 'MONTHLY', now(), now() + interval '1 month', now() + interval '1 month', now(), now())`,
    [uuid(), tenantId, tenantType, plan.id, plan.name]
  )
}

async function upsertAppUser(client, { email, displayName, appRole, keycloakSub }) {
  const { rows } = await client.query(
    `INSERT INTO app_user (keycloak_sub, email, display_name, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       role = EXCLUDED.role,
       keycloak_sub = CASE
         WHEN app_user.keycloak_sub LIKE 'seed-%' THEN EXCLUDED.keycloak_sub
         ELSE app_user.keycloak_sub
       END,
       updated_at = now()
     RETURNING id`,
    [keycloakSub, email, displayName, appRole]
  )
  return rows[0].id
}

async function assignNamedRole(client, userId, tenantId, tenantType, roleName, assignedBy = null) {
  await ensureTenantSystemRoles(tenantId, tenantType, client)
  const roleId = await getRoleIdByName(tenantId, tenantType, roleName)
  if (!roleId) throw new Error(`Role ${roleName} missing for ${tenantType} ${tenantId}`)
  await assignTenantUserRole({ userId, roleId, tenantId, tenantType, assignedBy })
}

async function seedTenantUsers(client, tenant, tenantType, ownerEmail) {
  const appRole = tenantType === 'SUPPLIER' ? 'SUPPLIER' : 'RESTAURANT'
  const teamMembers = tenantType === 'SUPPLIER' ? SUPPLIER_TEAM_MEMBERS : RESTAURANT_TEAM_MEMBERS
  const ownerId = await upsertAppUser(client, {
    email: ownerEmail,
    displayName: `${tenant.name} Owner`,
    appRole,
    keycloakSub: `seed-${tenant.slug}-owner`,
  })
  await assignDefaultRoleForTenant(ownerId, tenant.id, tenantType)
  await assignNamedRole(client, ownerId, tenant.id, tenantType, 'Owner')

  for (const member of teamMembers) {
    const email = emailFor(ownerEmail, member.suffix)
    const userId = await upsertAppUser(client, {
      email,
      displayName: `${tenant.name} ${member.lastName}`,
      appRole,
      keycloakSub: `seed-${tenant.slug}-${member.suffix}`,
    })
    await assignNamedRole(client, userId, tenant.id, tenantType, member.roleName, ownerId)
  }

  return {
    ownerId,
    emails: [ownerEmail, ...teamMembers.map((m) => emailFor(ownerEmail, m.suffix))],
  }
}

async function seedSupplier(client, def, warehouseShape) {
  const tierMeta = TIERS.find((t) => t.tier === def.tier)
  const id = uuid()
  await client.query(
    `INSERT INTO supplier (id, name, slug, vat_no, contact_email, phone, address_json, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())`,
    [
      id,
      def.name,
      def.slug,
      `VAT-${def.tier.toUpperCase()}`,
      def.ownerEmail,
      '+971500000101',
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

  const vol = volumeScale()
  const products = []
  const productCount = intBetween(rng, vol.products[0], vol.products[1])
  for (let i = 1; i <= productCount; i++) {
    const productId = uuid()
    const sku = `${def.tier.toUpperCase()}-SKU-${String(i).padStart(3, '0')}`
    await client.query(
      `INSERT INTO product (id, supplier_id, sku, name, unit, category, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'kg', $5, now(), now())`,
      [
        productId,
        id,
        sku,
        `${tierMeta.label} ${pick(rng, ['Tomatoes', 'Rice', 'Chicken', 'Oil', 'Herbs'])} ${i}`,
        'Produce',
      ]
    )
    const price = 4 + i * 1.25
    await client.query(
      `INSERT INTO price (product_id, currency, amount, valid_from) VALUES ($1, 'USD', $2, now())`,
      [productId, price]
    )
    await client.query(
      `INSERT INTO inventory (product_id, warehouse_id, available_qty, reserved_qty, updated_at)
       VALUES ($1, $2, $3, 0, now())
       ON CONFLICT (product_id) DO UPDATE SET warehouse_id = $2, available_qty = $3`,
      [productId, whId, 80 + i * 5]
    )
    products.push({ id: productId, price })
  }

  await insertSubscription(client, id, 'SUPPLIER', tierMeta.planCode)
  const tenant = { id, name: def.name, slug: def.slug }
  const users = await seedTenantUsers(client, tenant, 'SUPPLIER', def.ownerEmail)
  return { id, products: products.map((p) => ({ ...p, supplierId: id })), users }
}

async function seedRestaurant(client, def, branchShape, supplierProducts) {
  const tierMeta = TIERS.find((t) => t.tier === def.tier)
  const id = uuid()
  await client.query(
    `INSERT INTO restaurant (id, name, slug, trade_license_no, contact_email, phone, address_json, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())`,
    [
      id,
      def.name,
      def.slug,
      `TL-${def.tier.toUpperCase()}`,
      def.ownerEmail,
      '+971500000202',
      addressJson,
    ]
  )
  const branchId = uuid()
  await insertScopedLocation(client, 'branch', branchShape, {
    id: branchId,
    tenantId: id,
    name: 'Main Branch',
    code: 'MAIN',
    addressJson,
    isMain: true,
  })

  const vol = volumeScale()
  for (let t = 1; t <= vol.tables; t++) {
    await client.query(
      `INSERT INTO reservation_table (restaurant_id, branch_id, name, capacity, is_active)
       VALUES ($1, $2, $3, $4, true)`,
      [id, branchId, `T${t}`, 2 + (t % 6)]
    )
  }

  const today = todayStart()
  for (let i = 0; i < vol.reservations; i++) {
    const scheduledAt = randomDateBetween(
      rng,
      addDays(new Date(today), -21),
      addDays(new Date(today), 14)
    )
    await client.query(
      `INSERT INTO reservation (
         restaurant_id, branch_id, status, customer_name, party_size, scheduled_at, duration_minutes
       ) VALUES ($1, $2, $3, $4, $5, $6, 90)`,
      [
        id,
        branchId,
        pick(rng, ['CONFIRMED', 'COMPLETED', 'PENDING', 'SEATED']),
        `Guest ${i + 1}`,
        intBetween(rng, 2, 8),
        scheduledAt.toISOString(),
      ]
    )
  }

  for (const p of supplierProducts.slice(0, 15)) {
    await client.query(
      `INSERT INTO restaurant_inventory (restaurant_id, product_id, quantity, min_stock_threshold, low_stock_threshold, branch_id)
       VALUES ($1, $2, $3, 10, 5, $4)
       ON CONFLICT (restaurant_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
      [id, p.id, intBetween(rng, 20, 120), branchId]
    )
  }

  const orderStatuses = ['COMPLETED', 'COMPLETED', 'COMPLETED', 'SHIPPED', 'PROCESSING', 'PLACED']
  const ninetyDaysAgo = addDays(new Date(today), -90)
  for (let o = 0; o < vol.orders; o++) {
    const orderId = uuid()
    const placedAt = randomDateBetween(rng, ninetyDaysAgo, today)
    const status = pick(rng, orderStatuses)
    let total = 0
    await client.query(
      `INSERT INTO customer_order (id, restaurant_id, branch_id, status, total_amount, currency, placed_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 0, 'USD', $5, $5, $5)`,
      [orderId, id, branchId, status, placedAt.toISOString()]
    )
    const lineCount = intBetween(rng, 3, 8)
    shuffle(rng, supplierProducts)
    for (let l = 0; l < lineCount; l++) {
      const p = supplierProducts[l]
      const qty = intBetween(rng, 2, 24)
      const line = qty * p.price
      total += line
      await client.query(
        `INSERT INTO order_item (order_id, product_id, supplier_id, quantity, unit_price, line_total)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [orderId, p.id, p.supplierId, qty, p.price, line]
      )
    }
    await client.query(`UPDATE customer_order SET total_amount = $1 WHERE id = $2`, [
      total,
      orderId,
    ])
    if (status === 'COMPLETED' && supplierProducts[0]?.supplierId) {
      const invNum = `INV-${def.slug.toUpperCase().replace(/[^A-Z0-9]/g, '-')}-${String(o).padStart(3, '0')}`
      const { rows: invExists } = await client.query(`SELECT 1 FROM invoice WHERE order_id = $1`, [
        orderId,
      ])
      if (!invExists.length) {
        await client.query(
          `INSERT INTO invoice (
             invoice_number, supplier_id, restaurant_id, order_id, invoice_date, due_date,
             subtotal, tax_amount, total_amount, paid_amount, balance_due, status, currency, payment_terms_days
           ) VALUES ($1, $2, $3, $4, $5::date, ($5::date + 30), $6, 0, $6, $6, 0, 'PAID', 'USD', 30)`,
          [
            invNum,
            supplierProducts[0].supplierId,
            id,
            orderId,
            placedAt.toISOString().slice(0, 10),
            total,
          ]
        )
      }
    }
  }

  await insertSubscription(client, id, 'RESTAURANT', tierMeta.planCode)
  const tenant = { id, name: def.name, slug: def.slug }
  const users = await seedTenantUsers(client, tenant, 'RESTAURANT', def.ownerEmail)
  return { id, users }
}

async function ensureKeycloakAccounts(accounts) {
  const KEYCLOAK_BASE_URL = process.env.KEYCLOAK_BASE_URL || 'http://localhost:8180'
  const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'Supplify'
  const ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin'

  const tokenRes = await fetch(
    `${KEYCLOAK_BASE_URL.replace(/\/$/, '')}/realms/master/protocol/openid-connect/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: 'admin-cli',
        username: process.env.KEYCLOAK_ADMIN_USERNAME || 'admin',
        password: ADMIN_PASSWORD,
      }),
    }
  )
  if (!tokenRes.ok) {
    console.warn(
      '   ⚠ Keycloak unavailable — DB users exist; logins need Keycloak or run seed:demo-users for admin'
    )
    return
  }
  const { access_token: token } = await tokenRes.json()
  const base = `${KEYCLOAK_BASE_URL.replace(/\/$/, '')}/admin/realms/${KEYCLOAK_REALM}`

  for (const acc of accounts) {
    const roleRes = await fetch(`${base}/roles/${acc.realmRole}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!roleRes.ok) continue
    const role = await roleRes.json()
    const findRes = await fetch(`${base}/users?email=${encodeURIComponent(acc.email)}&exact=true`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const existing = (await findRes.json())[0]
    let userId = existing?.id
    const nameFromEmail = acc.email.split('@')[0].replace(/[._-]+/g, ' ')
    const nameParts = nameFromEmail.split(/\s+/).filter(Boolean)
    const firstName = nameParts[0] || acc.username
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'User'

    if (!existing) {
      const createRes = await fetch(`${base}/users`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: acc.username,
          email: acc.email,
          firstName,
          lastName,
          enabled: true,
          emailVerified: true,
          credentials: [{ type: 'password', value: SEED_PASSWORD, temporary: false }],
        }),
      })
      if (createRes.status === 409) continue
      if (!createRes.ok) continue
      userId = createRes.headers.get('Location')?.split('/').pop()
    }
    if (userId) {
      if (existing && (!existing.firstName?.trim() || !existing.lastName?.trim())) {
        await fetch(`${base}/users/${userId}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ firstName, lastName }),
        })
      }
      await fetch(`${base}/users/${userId}/role-mappings/realm`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([{ id: role.id, name: role.name }]),
      })
    }
  }
}

export async function seedTierCatalog() {
  const client = await pool.connect()
  const keycloakAccounts = []
  const loginLines = []

  try {
    await runCommercialWipe(client)

    const branchShape = await getScopedInsertShape(client, 'branch', ['restaurant_id', 'tenant_id'])
    const warehouseShape = await getScopedInsertShape(client, 'warehouse', [
      'supplier_id',
      'tenant_id',
    ])

    console.log('🔧 Patching plan features (missing keys from migrations)...')
    await applyPlanFeaturePatches(client)

    const tenantLabel =
      TENANTS_PER_TIER === 1
        ? '1 restaurant + 1 supplier'
        : `${TENANTS_PER_TIER} restaurants + ${TENANTS_PER_TIER} suppliers`
    console.log(`📦 Seeding ${tenantLabel} per tier (prod-like data)...\n`)

    for (const tierMeta of TIERS) {
      console.log(`▶ ${tierMeta.label} tier (${TENANTS_PER_TIER}× each)`)
      const tierSuppliers = []

      for (let i = 1; i <= TENANTS_PER_TIER; i++) {
        const sDef = supplierDef(tierMeta.tier, tierMeta.label, i, { multi: MULTI_TENANT })
        const supplier = await seedSupplier(client, sDef, warehouseShape)
        tierSuppliers.push(supplier)

        for (const email of supplier.users.emails) {
          keycloakAccounts.push({
            email,
            username: email.split('@')[0].replace(/\./g, '-'),
            realmRole: 'supplier',
          })
        }
        if (TENANTS_PER_TIER === 1) {
          for (const email of supplier.users.emails) {
            loginLines.push(`  supplier ${tierMeta.label}: ${email}`)
          }
        } else if (i === 1) {
          loginLines.push(
            `  supplier ${tierMeta.label}: ${supplier.users.emails[0]} … ${supplierDef(tierMeta.tier, tierMeta.label, TENANTS_PER_TIER, { multi: true }).ownerEmail}`
          )
        }
      }

      for (let i = 1; i <= TENANTS_PER_TIER; i++) {
        const rDef = restaurantDef(tierMeta.tier, tierMeta.label, i, { multi: MULTI_TENANT })
        const supplierProducts = tierSuppliers[(i - 1) % tierSuppliers.length].products
        const restaurant = await seedRestaurant(client, rDef, branchShape, supplierProducts)

        for (const email of restaurant.users.emails) {
          keycloakAccounts.push({
            email,
            username: email.split('@')[0].replace(/\./g, '-'),
            realmRole: 'restaurant',
          })
        }
        if (TENANTS_PER_TIER === 1) {
          for (const email of restaurant.users.emails) {
            loginLines.push(`  restaurant ${tierMeta.label}: ${email}`)
          }
        } else if (i === 1) {
          loginLines.push(
            `  restaurant ${tierMeta.label}: ${restaurant.users.emails[0]} … ${restaurantDef(tierMeta.tier, tierMeta.label, TENANTS_PER_TIER, { multi: true }).ownerEmail}`
          )
        }
      }
    }

    console.log('\n📋 Backfilling activity log entries for seeded orders/products…')
    const auditCount = await backfillAllCommercialAuditLogs(client)
    console.log(`   ${auditCount} audit log rows`)

    console.log('\n✅ Database seed complete.')
  } finally {
    client.release()
  }

  await ensureKeycloakAccounts(keycloakAccounts)

  console.log(`
Log in (password for all tier accounts: ${SEED_PASSWORD})
  Platform admin: admin@supplify.com / SupplifyAdmin1!  (run pnpm run seed:demo-users if missing)

${loginLines.join('\n')}

${TENANTS_PER_TIER > 1 ? 'Each tenant also has team logins (*-manager, *-purchaser / *-sales).\n' : ''}${TENANTS_PER_TIER === 1 ? 'Then run: pnpm run seed:features  (disputes, deals, reports sample data)\n' : ''}
`)
}

async function main() {
  try {
    await seedTierCatalog()
  } finally {
    await disconnectCache()
    await pool.end()
  }
}

if (isMainModule(import.meta.url)) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}
