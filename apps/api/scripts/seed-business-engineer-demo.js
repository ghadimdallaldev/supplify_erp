/**
 * Business engineer demo seed — 2 supplier + 2 restaurant tenants with realistic
 * catalogs, images, deals, orders, follows, and all system-role logins.
 * Non-destructive for other dev tenants (slug-scoped reset only).
 *
 * Run on Railway dev:
 *   cd apps/api
 *   $env:DATABASE_SSL='false'; railway run node scripts/seed-business-engineer-demo.js
 *
 * Also enriches legacy demo tenants (Fresh Foods / Golden Fork) with images + deals.
 */
import 'dotenv/config'
import { pool } from '../src/lib/db.js'
import { disconnectCache } from '../src/lib/cache.js'
import { isMainModule } from './lib/is-main.mjs'
import { applyPlanFeaturePatches } from './seed/tierDefinitions.js'
import { getScopedInsertShape, insertScopedLocation } from './seed/scopedLocation.js'
import { createSeededRng, intBetween, pick, shuffle } from './seed/seedRng.js'
import { randomDateBetween, addDays, todayStart } from './seed/timeUtils.js'
import { backfillAllCommercialAuditLogs } from './seed/audit-demo-backfill.js'
import {
  BUSINESS_DEMO_PAIRS,
  SEED_PASSWORD,
  productsForSupplier,
  productImageUrl,
  DEAL_TEMPLATES,
} from './seed/businessDemoData.js'
import { RESTAURANT_SYSTEM_ROLES, SUPPLIER_SYSTEM_ROLES } from '../src/lib/tenant-roles.js'
import { seedRoleUsersForTenant, ensureKeycloakAccounts } from './seed-dev-role-matrix-users.js'

const rng = createSeededRng(20260610)
const LEGACY_SUPPLIER_SLUG = 'fresh-foods-co'
const LEGACY_RESTAURANT_SLUG = 'golden-fork-restaurant'

function uuid() {
  return crypto.randomUUID()
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

async function insertSubscription(client, tenantId, tenantType, planCode = 'gold') {
  const plan = await getPlan(client, planCode, tenantType)
  await client.query(`DELETE FROM subscription WHERE tenant_id = $1 AND tenant_type = $2`, [
    tenantId,
    tenantType,
  ])
  await client.query(
    `INSERT INTO subscription (
       id, tenant_id, tenant_type, plan_id, plan_name, status, billing_cycle,
       current_period_start, current_period_end, next_billing_date, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, 'ACTIVE', 'MONTHLY', now(), now() + interval '1 year', now() + interval '1 month', now(), now())`,
    [uuid(), tenantId, tenantType, plan.id, plan.name]
  )
}

async function deleteTenantScoped(client, table, tenantId, tenantType) {
  if (table === 'supplier_follow') {
    const col = tenantType === 'SUPPLIER' ? 'supplier_id' : 'restaurant_id'
    await client.query(`DELETE FROM supplier_follow WHERE ${col} = $1`, [tenantId])
    return
  }
  if (table === 'promotions') {
    await client.query(`DELETE FROM promotions WHERE supplier_id = $1`, [tenantId])
    return
  }
  const col = tenantType === 'SUPPLIER' ? 'supplier_id' : 'restaurant_id'
  if (table === 'supplier' || table === 'restaurant') {
    await client.query(`DELETE FROM ${table} WHERE id = $1`, [tenantId])
    return
  }
  try {
    await client.query(`DELETE FROM ${table} WHERE ${col} = $1`, [tenantId])
  } catch {
    try {
      await client.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [tenantId])
    } catch {
      /* skip */
    }
  }
}

async function purgeDemoUsers(client, def) {
  const emailLike = `${def.slug}%`
  const legacyEmailLike = `be-${def.slug}%`
  const seedSubLike = `seed-${def.slug}%`
  const { rows: users } = await client.query(
    `SELECT id FROM app_user
     WHERE email LIKE $1 OR email LIKE $2 OR email = $3 OR keycloak_sub LIKE $4`,
    [emailLike, legacyEmailLike, def.ownerEmail, seedSubLike]
  )
  if (!users.length) return
  const ids = users.map((u) => u.id)
  await client.query(`DELETE FROM tenant_user_roles WHERE user_id = ANY($1::uuid[])`, [ids])
  await client.query(`DELETE FROM user_workspace_membership WHERE user_id = ANY($1::uuid[])`, [ids])
  await client.query(`DELETE FROM app_user WHERE id = ANY($1::uuid[])`, [ids])
}

async function clearDemoPair(client, pair) {
  for (const side of ['supplier', 'restaurant']) {
    const def = pair[side]
    const tenantType = side === 'supplier' ? 'SUPPLIER' : 'RESTAURANT'
    await purgeDemoUsers(client, def)

    const { rows } = await client.query(`SELECT id FROM ${side} WHERE slug = $1`, [def.slug])
    if (!rows[0]) continue
    const tenantId = rows[0].id

    const tables = [
      'deal_interactions',
      'deal_promotions',
      'promotion_usages',
      'promotion_restaurant_targets',
      'promotion_targets',
      'promotions',
      'dispute_items',
      'disputes',
      'invoice',
      'order_item',
      'customer_order',
      'restaurant_inventory',
      'supplier_follow',
      'inventory',
      'price',
      'product',
      'catalog',
      'warehouse',
      'reservation',
      'reservation_table',
      'branch',
      'subscription',
    ]
    for (const t of tables) {
      await deleteTenantScoped(client, t, tenantId, tenantType)
    }
    await client.query(`DELETE FROM ${side} WHERE id = $1`, [tenantId])
  }
}

async function seedSupplier(client, def, warehouseShape) {
  const id = uuid()
  const addressJson = JSON.stringify(def.address)
  await client.query(
    `INSERT INTO supplier (id, name, slug, vat_no, contact_email, phone, address_json, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())`,
    [id, def.name, def.slug, def.vat, def.ownerEmail, def.phone, addressJson]
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
    def.catalogName,
  ])

  const products = []
  for (const p of productsForSupplier(def)) {
    const productId = uuid()
    await client.query(
      `INSERT INTO product (id, supplier_id, sku, name, description, category, unit, image_url, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())`,
      [productId, id, p.sku, p.name, p.description, p.category, p.unit, productImageUrl(p.sku)]
    )
    await client.query(
      `INSERT INTO price (product_id, currency, amount, valid_from) VALUES ($1, 'USD', $2, now())`,
      [productId, p.price]
    )
    await client.query(
      `INSERT INTO inventory (product_id, warehouse_id, available_qty, reserved_qty, updated_at)
       VALUES ($1, $2, $3, 0, now())
       ON CONFLICT (product_id) DO UPDATE SET warehouse_id = $2, available_qty = $3`,
      [productId, whId, intBetween(rng, 80, 240)]
    )
    products.push({ id: productId, supplierId: id, price: p.price, sku: p.sku, name: p.name })
  }

  await insertSubscription(client, id, 'SUPPLIER', 'gold')
  const roleResult = await seedRoleUsersForTenant(
    client,
    { id, name: def.name, slug: def.slug, tenantType: 'SUPPLIER' },
    def.ownerEmail,
    SUPPLIER_SYSTEM_ROLES,
    def.slug
  )
  return { id, slug: def.slug, name: def.name, products, users: roleResult }
}

const RESTAURANT_TEAM_ROLE_BY_NAMED_ROLE = {
  Owner: 'owner',
  'Restaurant Manager': 'manager',
  Purchaser: 'purchasing',
  'Receiving Staff': 'purchasing',
  Accountant: 'finance',
  'FOH Staff': 'kitchen',
  Viewer: 'manager',
}

async function seedRestaurantTeamContacts(client, restaurantId, branchId, ownerEmail, roleLines) {
  await client.query(`DELETE FROM restaurant_team WHERE restaurant_id = $1`, [restaurantId])
  await client.query(
    `INSERT INTO restaurant_team (restaurant_id, branch_id, name, email, role, is_primary, is_active)
     VALUES ($1, $2, $3, $4, 'owner', true, true)`,
    [restaurantId, branchId, 'Owner', ownerEmail]
  )
  for (const line of roleLines) {
    const match = line.match(/^\s+([^:]+):\s+(\S+@\S+)$/)
    if (!match) continue
    const [, roleName, email] = match
    if (roleName === 'Owner') continue
    const teamRole = RESTAURANT_TEAM_ROLE_BY_NAMED_ROLE[roleName] || 'manager'
    await client.query(
      `INSERT INTO restaurant_team (restaurant_id, branch_id, name, email, role, is_primary, is_active)
       VALUES ($1, $2, $3, $4, $5, false, true)`,
      [restaurantId, branchId, roleName, email, teamRole]
    )
  }
}

async function seedRestaurant(client, def, branchShape, supplierProducts, supplierId) {
  const id = uuid()
  const addressJson = JSON.stringify(def.address)
  await client.query(
    `INSERT INTO restaurant (id, name, slug, trade_license_no, contact_email, phone, address_json, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())`,
    [id, def.name, def.slug, def.tradeLicense, def.ownerEmail, def.phone, addressJson]
  )
  const branchId = uuid()
  await insertScopedLocation(client, 'branch', branchShape, {
    id: branchId,
    tenantId: id,
    name: def.branchName,
    code: def.branchCode,
    addressJson,
    isMain: true,
  })

  for (let t = 1; t <= 8; t++) {
    await client.query(
      `INSERT INTO reservation_table (restaurant_id, branch_id, name, capacity, is_active)
       VALUES ($1, $2, $3, $4, true)`,
      [id, branchId, `Table ${t}`, 2 + (t % 5)]
    )
  }

  const today = todayStart()
  const guests = [
    'Amelia Winters',
    'Omar Khalid',
    'Chen Liu',
    'Fatima Al Mansoori',
    'James Porter',
    'Layla Hassan',
  ]
  for (let i = 0; i < 12; i++) {
    const scheduledAt = randomDateBetween(
      rng,
      addDays(new Date(today), -14),
      addDays(new Date(today), 10)
    )
    await client.query(
      `INSERT INTO reservation (
         restaurant_id, branch_id, status, customer_name, party_size, scheduled_at, duration_minutes
       ) VALUES ($1, $2, $3, $4, $5, $6, 90)`,
      [
        id,
        branchId,
        pick(rng, ['CONFIRMED', 'COMPLETED', 'PENDING', 'SEATED']),
        pick(rng, guests),
        intBetween(rng, 2, 8),
        scheduledAt.toISOString(),
      ]
    )
  }

  await client.query(
    `INSERT INTO supplier_follow (restaurant_id, supplier_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [id, supplierId]
  )

  for (const p of supplierProducts.slice(0, 18)) {
    await client.query(
      `INSERT INTO restaurant_inventory (restaurant_id, product_id, quantity, min_stock_threshold, low_stock_threshold, branch_id)
       VALUES ($1, $2, $3, 10, 5, $4)
       ON CONFLICT (restaurant_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
      [id, p.id, intBetween(rng, 25, 140), branchId]
    )
  }

  const orderStatuses = ['COMPLETED', 'COMPLETED', 'SHIPPED', 'PROCESSING', 'PLACED', 'DELIVERED']
  const ninetyDaysAgo = addDays(new Date(today), -90)
  for (let o = 0; o < 28; o++) {
    const orderId = uuid()
    const placedAt = randomDateBetween(rng, ninetyDaysAgo, today)
    const status = pick(rng, orderStatuses)
    await client.query(
      `INSERT INTO customer_order (id, restaurant_id, branch_id, status, total_amount, currency, placed_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 0, 'USD', $5, $5, $5)`,
      [orderId, id, branchId, status, placedAt.toISOString()]
    )
    let total = 0
    shuffle(rng, supplierProducts)
    for (let l = 0; l < intBetween(rng, 3, 7); l++) {
      const p = supplierProducts[l]
      const qty = intBetween(rng, 2, 20)
      const line = qty * p.price
      total += line
      await client.query(
        `INSERT INTO order_item (order_id, product_id, supplier_id, quantity, unit_price, line_total)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [orderId, p.id, supplierId, qty, p.price, line]
      )
    }
    await client.query(`UPDATE customer_order SET total_amount = $1 WHERE id = $2`, [
      total,
      orderId,
    ])
    if (['COMPLETED', 'DELIVERED'].includes(status)) {
      const invNum = `INV-${def.slug.toUpperCase().slice(0, 12)}-${String(o).padStart(3, '0')}`
      await client.query(
        `INSERT INTO invoice (
           invoice_number, supplier_id, restaurant_id, order_id, invoice_date, due_date,
           subtotal, tax_amount, total_amount, paid_amount, balance_due, status, currency, payment_terms_days
         ) VALUES ($1, $2, $3, $4, $5::date, ($5::date + 30), $6, 0, $6, $6, 0, 'PAID', 'USD', 30)
         ON CONFLICT DO NOTHING`,
        [invNum, supplierId, id, orderId, placedAt.toISOString().slice(0, 10), total]
      )
    }
  }

  await insertSubscription(client, id, 'RESTAURANT', 'gold')
  const roleResult = await seedRoleUsersForTenant(
    client,
    { id, name: def.name, slug: def.slug, tenantType: 'RESTAURANT' },
    def.ownerEmail,
    RESTAURANT_SYSTEM_ROLES,
    def.slug
  )
  await seedRestaurantTeamContacts(client, id, branchId, def.ownerEmail, roleResult.lines)
  return { id, slug: def.slug, name: def.name, users: roleResult }
}

async function seedDealsForPair(client, supplierId, restaurantId, products) {
  const { rows: existing } = await client.query(
    `SELECT COUNT(*)::int AS c FROM promotions WHERE supplier_id = $1`,
    [supplierId]
  )
  if (existing[0]?.c >= 2) {
    await client.query(
      `UPDATE promotions SET
         payment_status = 'not_required',
         boost_start_at = COALESCE(boost_start_at, starts_at),
         boost_end_at = COALESCE(boost_end_at, ends_at),
         image_url = COALESCE(image_url, $2)
       WHERE supplier_id = $1 AND boost_start_at IS NULL`,
      [supplierId, productImageUrl(`deal-${supplierId.slice(0, 8)}`)]
    )
    return
  }

  const { rows: boostPkg } = await client.query(
    `SELECT id, pricing_key, amount, duration_days FROM promotion_pricing_config
     WHERE pricing_key = 'boost_7_day' AND is_active = true LIMIT 1`
  )
  const pkg = boostPkg[0]
  const now = new Date()
  const starts = new Date(now.getTime() - 2 * 86400000).toISOString()
  const ends = new Date(now.getTime() + 30 * 86400000).toISOString()
  const boostEnd = pkg?.duration_days
    ? new Date(now.getTime() + pkg.duration_days * 86400000).toISOString()
    : ends

  for (const deal of DEAL_TEMPLATES) {
    const { rows } = await client.query(
      `INSERT INTO promotions (
         supplier_id, name, description, type, discount_value, min_order_amount, max_discount_cap,
         buy_quantity, get_quantity, applies_to, status, starts_at, ends_at, is_featured,
         payment_status, boost_pricing_key, boost_price_snapshot, boost_duration_days,
         boost_package_id, boost_start_at, boost_end_at, image_url
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active',$11,$12,$13,
         'not_required',$14,$15,$16,$17,$18,$19,$20
       ) RETURNING id`,
      [
        supplierId,
        deal.name,
        deal.description,
        deal.type,
        deal.discount_value ?? null,
        deal.min_order_amount ?? null,
        deal.max_discount_cap ?? null,
        deal.buy_quantity ?? null,
        deal.get_quantity ?? null,
        products.length ? 'specific_products' : 'all',
        starts,
        ends,
        deal.is_featured,
        pkg?.pricing_key ?? 'boost_7_day',
        pkg?.amount ?? 39,
        pkg?.duration_days ?? 7,
        pkg?.id ?? null,
        starts,
        boostEnd,
        `https://picsum.photos/seed/${deal.imageLabel}/640/360`,
      ]
    )
    const promoId = rows[0].id
    if (products.length && deal.type !== 'free_shipping') {
      for (const prod of products.slice(0, 4)) {
        await client.query(
          `INSERT INTO promotion_targets (promotion_id, product_id) VALUES ($1, $2)`,
          [promoId, prod.id]
        )
      }
    }
    await client.query(
      `INSERT INTO promotion_restaurant_targets (promotion_id, restaurant_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [promoId, restaurantId]
    )
  }
}

async function enrichLegacyDemo(client, keycloakAccounts) {
  const { rows: suppliers } = await client.query(`SELECT id FROM supplier WHERE slug = $1`, [
    LEGACY_SUPPLIER_SLUG,
  ])
  const { rows: restaurants } = await client.query(`SELECT id FROM restaurant WHERE slug = $1`, [
    LEGACY_RESTAURANT_SLUG,
  ])
  if (!suppliers[0] || !restaurants[0]) return

  const supplierId = suppliers[0].id
  const restaurantId = restaurants[0].id

  await client.query(
    `UPDATE product
     SET image_url = CONCAT('https://picsum.photos/seed/', sku, '/480/360')
     WHERE supplier_id = $1 AND (image_url IS NULL OR image_url = '' OR image_url LIKE '%placeholder%')`,
    [supplierId]
  )

  await client.query(
    `INSERT INTO supplier_follow (restaurant_id, supplier_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [restaurantId, supplierId]
  )

  const { rows: products } = await client.query(
    `SELECT id, sku, name FROM product WHERE supplier_id = $1 ORDER BY sku LIMIT 20`,
    [supplierId]
  )
  await seedDealsForPair(client, supplierId, restaurantId, products)

  const supplierRoles = await seedRoleUsersForTenant(
    client,
    { id: supplierId, name: 'Fresh Foods Co.', slug: LEGACY_SUPPLIER_SLUG, tenantType: 'SUPPLIER' },
    'supplier@supplify.com',
    SUPPLIER_SYSTEM_ROLES,
    'dev-supplier'
  )
  const restaurantRoles = await seedRoleUsersForTenant(
    client,
    {
      id: restaurantId,
      name: 'Golden Fork Restaurant',
      slug: LEGACY_RESTAURANT_SLUG,
      tenantType: 'RESTAURANT',
    },
    'restaurant@supplify.com',
    RESTAURANT_SYSTEM_ROLES,
    'dev-restaurant'
  )
  const { rows: legacyBranches } = await client.query(
    `SELECT id FROM branch WHERE restaurant_id = $1 OR tenant_id = $1 ORDER BY created_at LIMIT 1`,
    [restaurantId]
  )
  if (legacyBranches[0]) {
    await seedRestaurantTeamContacts(
      client,
      restaurantId,
      legacyBranches[0].id,
      'restaurant@supplify.com',
      restaurantRoles.lines
    )
  }
  keycloakAccounts.push(...supplierRoles.accounts, ...restaurantRoles.accounts)

  console.log('  Enriched legacy Fresh Foods + Golden Fork (images, deals, role users)')
}

export async function seedBusinessEngineerDemo() {
  const client = await pool.connect()
  const keycloakAccounts = []
  const report = []

  try {
    await applyPlanFeaturePatches(client)
    const branchShape = await getScopedInsertShape(client, 'branch', ['restaurant_id', 'tenant_id'])
    const warehouseShape = await getScopedInsertShape(client, 'warehouse', [
      'supplier_id',
      'tenant_id',
    ])

    console.log('Clearing prior business-demo pair data (slug-scoped)…')
    for (const pair of BUSINESS_DEMO_PAIRS) {
      await clearDemoPair(client, pair)
    }

    console.log('\nSeeding demo pairs…\n')
    for (const pair of BUSINESS_DEMO_PAIRS) {
      console.log(`▶ ${pair.supplier.name} ↔ ${pair.restaurant.name}`)
      const supplier = await seedSupplier(client, pair.supplier, warehouseShape)
      const restaurant = await seedRestaurant(
        client,
        pair.restaurant,
        branchShape,
        supplier.products,
        supplier.id
      )
      await seedDealsForPair(client, supplier.id, restaurant.id, supplier.products)

      for (const acc of [...supplier.users.accounts, ...restaurant.users.accounts]) {
        keycloakAccounts.push(acc)
      }

      report.push(
        '',
        `${pair.supplier.name} (supplier) — owner: ${pair.supplier.ownerEmail}`,
        ...supplier.users.lines,
        '',
        `${pair.restaurant.name} (restaurant) — owner: ${pair.restaurant.ownerEmail}`,
        ...restaurant.users.lines
      )
    }

    console.log('\nEnriching legacy demo tenants…')
    await enrichLegacyDemo(client, keycloakAccounts)

    const auditCount = await backfillAllCommercialAuditLogs(client)
    console.log(`\nAudit backfill: ${auditCount} rows`)
  } finally {
    client.release()
  }

  await ensureKeycloakAccounts(keycloakAccounts)

  console.log(`\n✅ Business engineer demo ready. Password: ${SEED_PASSWORD}`)
  console.log('   App: https://app-dev.supplifyerp.com')
  console.log(report.join('\n'))
}

async function main() {
  console.log('🎯 Business engineer demo seed (2 suppliers + 2 restaurants)\n')
  try {
    await seedBusinessEngineerDemo()
  } finally {
    await disconnectCache()
    await pool.end()
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
