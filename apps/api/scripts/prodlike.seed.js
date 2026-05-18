/**
 * Prod-like full dataset seed for Supplify.
 * Populates: Invoices (dashboard + list), Restaurant/Supplier inventories,
 * Reservations, Warehouses, Orders, Staff, Subscriptions.
 *
 * SAFETY: Requires ALLOW_PRODLIKE_SEED=true and NODE_ENV !== 'production'
 * (or ALLOW_PRODLIKE_SEED_FORCE=true to allow in prod).
 *
 * Run: pnpm run seed:prodlike  (from repo root) or node scripts/prodlike.seed.js (from apps/api)
 */
import 'dotenv/config'
import pg from 'pg'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { createSeededRng, intBetween, floatBetween, pick, shuffle } from './seed/seedRng.js'
import {
  toDateString,
  toTimestamp,
  addDays,
  randomDateBetween,
  todayStart,
} from './seed/timeUtils.js'
import { bulkInsert } from './seed/bulkInsert.js'
import { getScopedInsertShape, insertScopedLocation } from './seed/scopedLocation.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const SEED = parseInt(process.env.SEED || '1337', 10)
const ALLOW = process.env.ALLOW_PRODLIKE_SEED === 'true'
const FORCE = process.env.ALLOW_PRODLIKE_SEED_FORCE === 'true'
const NODE_ENV = process.env.NODE_ENV || 'development'
const isProd = NODE_ENV === 'production'

if (!ALLOW || (isProd && !FORCE)) {
  console.error(
    'Prodlike seed is not allowed. Set ALLOW_PRODLIKE_SEED=true and run in non-production (or ALLOW_PRODLIKE_SEED_FORCE=true for production).'
  )
  process.exit(1)
}

if (isProd) {
  console.warn('WARNING: Running prodlike seed in production (ALLOW_PRODLIKE_SEED_FORCE=true).')
}

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/supplify',
  max: 5,
})

const rng = createSeededRng(SEED)

// Plan IDs from migration 0022
const PLAN_IDS = {
  free: '00000000-0000-0000-0000-000000000001',
  bronze: '00000000-0000-0000-0000-000000000002',
  gold: '00000000-0000-0000-0000-000000000003',
  platinum: '00000000-0000-0000-0000-000000000004',
}

const SUBSCRIPTION_STATUSES = [
  'TRIALING',
  'ACTIVE',
  'ACTIVE',
  'ACTIVE',
  'ACTIVE',
  'PAST_DUE',
  'CANCELLED',
]
const BILLING_CYCLES = ['MONTHLY', 'MONTHLY', 'YEARLY']
const INVOICE_STATUSES = [
  'ISSUED',
  'PARTIALLY_PAID',
  'PAID',
  'PAID',
  'PAID',
  'PAID',
  'PAID',
  'PAID',
  'OVERDUE',
  'VOID',
]
const RESERVATION_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'CONFIRMED',
  'SEATED',
  'COMPLETED',
  'COMPLETED',
  'CANCELLED',
  'WAITLIST',
]
const RESTAURANT_STAFF_ROLES = [
  'manager',
  'cashier',
  'chef',
  'receiver',
  'accountant',
  'waiter',
  'waiter',
  'waiter',
]

/** Map staff app roles → settings team roles (restaurant_team). */
const STAFF_ROLE_TO_TEAM_ROLE = {
  manager: 'manager',
  cashier: 'finance',
  chef: 'kitchen',
  receiver: 'purchasing',
  accountant: 'finance',
  waiter: 'kitchen',
}

const TEAM_CONTACT_ROLES = ['manager', 'purchasing', 'finance', 'kitchen']
const WAGE_TYPES = ['HOURLY', 'SALARY', 'HOURLY', 'HOURLY', 'SALARY']
const PROFILE_COLORS = ['#2563eb', '#16a34a', '#f97316', '#8b5cf6', '#ec4899']

// First names for staff / customers
const FIRST_NAMES = [
  'James',
  'Mary',
  'John',
  'Patricia',
  'Robert',
  'Jennifer',
  'Michael',
  'Linda',
  'William',
  'Elizabeth',
  'David',
  'Barbara',
  'Richard',
  'Susan',
  'Joseph',
  'Jessica',
  'Thomas',
  'Sarah',
  'Charles',
  'Karen',
]
const LAST_NAMES = [
  'Smith',
  'Johnson',
  'Williams',
  'Brown',
  'Jones',
  'Garcia',
  'Miller',
  'Davis',
  'Rodriguez',
  'Martinez',
]

function slug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
    .replace(/x/g, () => ((rng() * 16) | 0).toString(16))
    .replace(/y/g, () => ((rng() * 4) | 8).toString(16)) // variant 10xx per RFC 4122
}

async function runReset(client) {
  console.log('\n🗑️  Resetting all restaurant and supplier data...')
  const tables = [
    ['payment'],
    ['invoice_line_item', 'dunning'],
    ['credit_note_line_item'],
    ['credit_note'],
    ['account_statement'],
    ['invoice_sequence'],
    ['invoice'],
    ['receiving_line_item'],
    ['receiving_report'],
    ['order_item'],
    ['customer_order'],
    ['reservation_waitlist'],
    ['reservation'],
    ['reservation_table'],
    ['staff_shift_swap', 'staff_time_entry', 'staff_shift'],
    [
      'staff_pto_request',
      'staff_availability',
      'staff_announcement_ack',
      'staff_document',
      'staff_incident',
      'staff_performance_note',
      'staff_payroll_export',
    ],
    ['staff_member'],
    ['restaurant_team'],
    ['inventory_movement_log'],
    ['inventory_adjustment'],
    ['restaurant_inventory'],
    ['subscription'],
    ['usage_meter', 'feature_flag_override'],
    ['tenant_usage', 'tenant_plan_snapshot'],
    ['branch'],
    ['inventory_alert'],
    ['inventory'],
    ['product_inventory_settings'],
    ['price'],
    ['product'],
    ['catalog'],
    ['delivery_zone'],
    ['warehouse'],
    ['restaurant'],
    ['supplier'],
  ]
  for (const group of tables) {
    for (const table of group) {
      try {
        await client.query('SAVEPOINT reset_sp')
        const res = await client.query(`DELETE FROM ${table}`)
        if (res.rowCount > 0) console.log(`   Deleted ${res.rowCount} from ${table}`)
        await client.query('RELEASE SAVEPOINT reset_sp')
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT reset_sp').catch(() => {})
        if (e.code === '42P01') continue // table does not exist
        console.error(`   Failed to delete from ${table}:`, e.message)
        throw e
      }
    }
  }
  console.log('   Reset complete.\n')
}

async function main() {
  const start = Date.now()
  console.log('🌱 Prodlike seed starting (SEED=' + SEED + ')')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await runReset(client)

    // --- Suppliers (50) ---
    const numSuppliers = 50
    const supplierNames = []
    for (let i = 1; i <= numSuppliers; i++) {
      supplierNames.push(`Supplier ${i}`)
    }
    const supplierRows = supplierNames.map((name, i) => [
      uuid(),
      name,
      slug(name) + '-' + (i + 1),
      'VAT' + (1000 + i),
      `contact-${i}@supplier${i}.test`,
      '+1555' + String(i).padStart(6, '0'),
      JSON.stringify({ street: `${100 + i} Industrial Way`, city: 'City', country: 'US' }),
      new Date().toISOString(),
      new Date().toISOString(),
    ])
    await bulkInsert(client, {
      table: 'supplier',
      columns: [
        'id',
        'name',
        'slug',
        'vat_no',
        'contact_email',
        'phone',
        'address_json',
        'created_at',
        'updated_at',
      ],
      rows: supplierRows,
    })
    const { rows: suppliers } = await client.query('SELECT id, name FROM supplier ORDER BY name')
    console.log('   Suppliers: ' + suppliers.length)

    // --- Warehouses (1-3 per supplier) ---
    const warehouseShape = await getScopedInsertShape(client, 'warehouse', [
      'supplier_id',
      'tenant_id',
    ])
    let warehouseCount = 0
    const warehouseBySupplier = new Map()
    for (const s of suppliers) {
      const n = intBetween(rng, 1, 3)
      const whs = []
      for (let i = 0; i < n; i++) {
        const id = uuid()
        whs.push({
          id,
          name: (n === 1 ? 'Main' : `WH-${i + 1}`) + ' Warehouse',
          code: 'WH' + (i + 1),
        })
      }
      warehouseBySupplier.set(s.id, whs)
      for (const wh of whs) {
        await insertScopedLocation(client, 'warehouse', warehouseShape, {
          id: wh.id,
          tenantId: s.id,
          name: wh.name,
          code: wh.code,
          addressJson: JSON.stringify({ city: 'City', country: 'US' }),
          isMain: wh.code === 'WH1',
        })
        warehouseCount++
      }
    }
    console.log('   Warehouses: ' + warehouseCount)

    // --- Products + prices + inventory (30-80 per supplier, inventory per warehouse) ---
    const categories = [
      'Produce',
      'Dairy',
      'Meat',
      'Beverages',
      'Dry Goods',
      'Frozen',
      'Cleaning',
      'Paper',
    ]
    const units = ['kg', 'lb', 'case', 'unit', 'pack', 'box', 'liter']
    let productCount = 0
    const productsBySupplier = new Map()
    for (const s of suppliers) {
      const n = intBetween(rng, 30, 80)
      const prods = []
      const whs = warehouseBySupplier.get(s.id)
      for (let i = 0; i < n; i++) {
        const id = uuid()
        const name = `${pick(rng, categories)} Item ${i + 1}`
        const sku = `SKU-${s.id.slice(0, 8)}-${i + 1}`
        const unit = pick(rng, units)
        const priceAmount = floatBetween(rng, 1.5, 120)
        await client.query(
          `INSERT INTO product (id, supplier_id, sku, name, unit, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
          [id, s.id, sku, name, unit]
        )
        await client.query(
          `INSERT INTO price (id, product_id, currency, amount, min_qty, valid_from) VALUES ($1, $2, 'USD', $3, 1, NOW())`,
          [uuid(), id, priceAmount.toFixed(3)]
        )
        const invWh = whs[intBetween(rng, 0, whs.length - 1)]
        const qty = intBetween(rng, 50, 800)
        const reserved = intBetween(rng, 0, Math.min(50, qty))
        await client.query(
          `INSERT INTO inventory (product_id, warehouse_id, available_qty, reserved_qty, updated_at)
           VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT (product_id) DO UPDATE SET warehouse_id = $2, available_qty = $3, reserved_qty = $4`,
          [id, invWh.id, qty, reserved]
        )
        prods.push({ id, name, sku, unit, price: priceAmount, supplier_id: s.id })
        productCount++
      }
      productsBySupplier.set(s.id, prods)
    }
    console.log('   Products (with prices & inventory): ' + productCount)

    // --- Restaurants (10) ---
    const numRestaurants = 10
    const restaurantNames = []
    for (let i = 1; i <= numRestaurants; i++) {
      restaurantNames.push(`Restaurant ${i}`)
    }
    const restaurantRows = restaurantNames.map((name, i) => [
      uuid(),
      name,
      slug(name) + '-' + (i + 1),
      'LIC' + (1000 + i),
      `restaurant-${i + 1}@test.com`,
      '+1555' + String(100 + i).padStart(6, '0'),
      JSON.stringify({ street: `${200 + i} Main St`, city: 'City', country: 'US' }),
      new Date().toISOString(),
      new Date().toISOString(),
    ])
    await bulkInsert(client, {
      table: 'restaurant',
      columns: [
        'id',
        'name',
        'slug',
        'trade_license_no',
        'contact_email',
        'phone',
        'address_json',
        'created_at',
        'updated_at',
      ],
      rows: restaurantRows,
    })
    const { rows: restaurants } = await client.query(
      'SELECT id, name, contact_email, phone FROM restaurant ORDER BY name'
    )
    console.log('   Restaurants: ' + restaurants.length)

    // --- Branches (2-4 per restaurant) ---
    const branchShape = await getScopedInsertShape(client, 'branch', ['restaurant_id', 'tenant_id'])
    const branchIdsByRestaurant = new Map()
    let branchCount = 0
    for (const r of restaurants) {
      const n = intBetween(rng, 2, 4)
      const branchIds = []
      for (let i = 0; i < n; i++) {
        const id = uuid()
        branchIds.push(id)
        const branchNum = i + 1
        await insertScopedLocation(client, 'branch', branchShape, {
          id,
          tenantId: r.id,
          name: n === 1 ? 'Main' : `Branch ${branchNum}`,
          code: branchShape.hasCode ? `BR${branchNum}` : null,
          addressJson: branchShape.addressCol
            ? JSON.stringify({ city: 'City', country: 'US' })
            : null,
          isMain: branchNum === 1,
        })
        branchCount++
      }
      branchIdsByRestaurant.set(r.id, branchIds)
    }
    console.log('   Branches: ' + branchCount)

    // --- Staff (6-14 per restaurant) + settings team (restaurant_team) ---
    const staffByRestaurant = new Map()
    let staffCount = 0
    let teamCount = 0
    for (const r of restaurants) {
      const branchIds = branchIdsByRestaurant.get(r.id) || []
      const mainBranchId = branchIds[0] || null
      const ownerName = r.name.includes(' ') ? r.name : `${r.name} Owner`

      await client.query(
        `INSERT INTO restaurant_team (id, restaurant_id, branch_id, name, email, phone, role, is_primary, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'owner', true, true, NOW(), NOW())`,
        [uuid(), r.id, mainBranchId, ownerName, r.contact_email, r.phone || null]
      )
      teamCount++

      const n = intBetween(rng, 6, 14)
      const staffIds = []
      const staffRowsForTeam = []
      for (let i = 0; i < n; i++) {
        const id = uuid()
        staffIds.push(id)
        const first = pick(rng, FIRST_NAMES)
        const last = pick(rng, LAST_NAMES)
        const role = pick(rng, RESTAURANT_STAFF_ROLES)
        const email = `staff-${r.id.slice(0, 8)}-${i}@test.com`
        const phone = `+1555${String(200000 + i).slice(-7)}`
        const wageType = pick(rng, WAGE_TYPES)
        const wageRate =
          wageType === 'SALARY' ? intBetween(rng, 2800, 4500) : intBetween(rng, 14, 28)
        const hireDate = toDateString(addDays(new Date(), -intBetween(rng, 90, 900)))
        await client.query(
          `INSERT INTO staff_member (
             id, restaurant_id, status, first_name, last_name, display_name, email, phone, role,
             wage_type, wage_rate, hire_date, profile_color, created_at, updated_at
           ) VALUES ($1, $2, 'ACTIVE', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())`,
          [
            id,
            r.id,
            first,
            last,
            `${first} ${last}`,
            email,
            phone,
            role,
            wageType,
            wageRate,
            hireDate,
            pick(rng, PROFILE_COLORS),
          ]
        )
        staffCount++
        staffRowsForTeam.push({ first, last, email, phone, role })
      }
      staffByRestaurant.set(r.id, staffIds)

      const teamFromStaff = shuffle(rng, [...staffRowsForTeam]).slice(0, intBetween(rng, 3, 5))
      for (const s of teamFromStaff) {
        const teamRole = STAFF_ROLE_TO_TEAM_ROLE[s.role] || 'manager'
        const branchId = branchIds.length ? pick(rng, branchIds) : null
        await client.query(
          `INSERT INTO restaurant_team (id, restaurant_id, branch_id, name, email, phone, role, is_primary, is_active, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, false, true, NOW(), NOW())`,
          [uuid(), r.id, branchId, `${s.first} ${s.last}`, s.email, s.phone, teamRole]
        )
        teamCount++
      }

      for (let t = 0; t < 2; t++) {
        const role = TEAM_CONTACT_ROLES[t % TEAM_CONTACT_ROLES.length]
        const first = pick(rng, FIRST_NAMES)
        const last = pick(rng, LAST_NAMES)
        await client.query(
          `INSERT INTO restaurant_team (id, restaurant_id, branch_id, name, email, phone, role, is_primary, is_active, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, false, true, NOW(), NOW())`,
          [
            uuid(),
            r.id,
            branchIds.length ? pick(rng, branchIds) : null,
            `${first} ${last}`,
            `team-${role}-${r.id.slice(0, 8)}@test.com`,
            `+1555${String(300000 + t).slice(-7)}`,
            role,
          ]
        )
        teamCount++
      }
    }
    console.log('   Staff (restaurant): ' + staffCount)
    console.log('   Team (settings): ' + teamCount)

    // --- Subscriptions (restaurants + suppliers) ---
    const planCodes = ['free', 'bronze', 'gold', 'platinum']
    const now = new Date()
    for (const r of restaurants) {
      const code = pick(rng, planCodes)
      const planId = PLAN_IDS[code]
      let status = pick(rng, SUBSCRIPTION_STATUSES)
      const cycle = pick(rng, BILLING_CYCLES)
      const periodStart = new Date(now)
      addDays(periodStart, -intBetween(rng, 30, 180))
      const periodEnd = new Date(periodStart)
      addDays(periodEnd, cycle === 'YEARLY' ? 365 : 30)
      const nextBilling = new Date(periodEnd)
      const trialEndsAt = status === 'TRIALING' ? new Date(periodEnd) : null
      await client.query(
        `INSERT INTO subscription (id, tenant_id, tenant_type, plan_id, plan_name, status, trial_ends_at, billing_cycle, current_period_start, current_period_end, next_billing_date, created_at, updated_at)
         VALUES ($1, $2, 'RESTAURANT', $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
        [
          uuid(),
          r.id,
          planId,
          code.charAt(0).toUpperCase() + code.slice(1),
          status,
          trialEndsAt ? trialEndsAt.toISOString() : null,
          cycle,
          periodStart.toISOString(),
          periodEnd.toISOString(),
          nextBilling.toISOString(),
        ]
      )
    }
    for (const s of suppliers) {
      const code = pick(rng, planCodes)
      const planId = PLAN_IDS[code]
      let status = pick(rng, SUBSCRIPTION_STATUSES)
      const cycle = pick(rng, BILLING_CYCLES)
      const periodStart = new Date(now)
      addDays(periodStart, -intBetween(rng, 30, 180))
      const periodEnd = new Date(periodStart)
      addDays(periodEnd, cycle === 'YEARLY' ? 365 : 30)
      const nextBilling = new Date(periodEnd)
      const trialEndsAt = status === 'TRIALING' ? new Date(periodEnd) : null
      await client.query(
        `INSERT INTO subscription (id, tenant_id, tenant_type, plan_id, plan_name, status, trial_ends_at, billing_cycle, current_period_start, current_period_end, next_billing_date, created_at, updated_at)
         VALUES ($1, $2, 'SUPPLIER', $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
        [
          uuid(),
          s.id,
          planId,
          code.charAt(0).toUpperCase() + code.slice(1),
          status,
          trialEndsAt ? trialEndsAt.toISOString() : null,
          cycle,
          periodStart.toISOString(),
          periodEnd.toISOString(),
          nextBilling.toISOString(),
        ]
      )
    }
    console.log('   Subscriptions: restaurants + suppliers')

    // --- Reservation tables (a few per branch for floor plan) ---
    let tableCount = 0
    for (const r of restaurants) {
      const branchIds = branchIdsByRestaurant.get(r.id)
      for (const branchId of branchIds) {
        const n = intBetween(rng, 4, 12)
        for (let i = 0; i < n; i++) {
          await client.query(
            `INSERT INTO reservation_table (id, restaurant_id, branch_id, name, capacity, is_active, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())`,
            [uuid(), r.id, branchId, `Table ${i + 1}`, intBetween(rng, 2, 8)]
          )
          tableCount++
        }
      }
    }
    console.log('   Reservation tables: ' + tableCount)

    // --- Restaurant inventory (80-200 SKUs per restaurant; branch_id set where supported) ---
    const allProducts = []
    for (const [, prods] of productsBySupplier) allProducts.push(...prods)
    let restInvCount = 0
    for (const r of restaurants) {
      const branchIds = branchIdsByRestaurant.get(r.id)
      const numSkus = intBetween(rng, 80, Math.min(200, allProducts.length))
      shuffle(rng, allProducts)
      const selected = allProducts.slice(0, numSkus)
      for (const p of selected) {
        const branchId = pick(rng, branchIds)
        const onHand = intBetween(rng, 0, 200)
        const reorder = intBetween(rng, 5, 30)
        const lowStock = reorder
        await client.query(
          `INSERT INTO restaurant_inventory (id, restaurant_id, product_id, quantity, min_stock_threshold, low_stock_threshold, branch_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
           ON CONFLICT (restaurant_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity, low_stock_threshold = EXCLUDED.low_stock_threshold, branch_id = EXCLUDED.branch_id, updated_at = NOW()`,
          [uuid(), r.id, p.id, onHand, reorder, lowStock, branchId]
        )
        restInvCount++
      }
    }
    console.log('   Restaurant inventory rows: ' + restInvCount)

    // --- Reservations (40-150 per branch, last 30d + next 14d) ---
    const today = todayStart()
    const windowStart = addDays(new Date(today), -30)
    const windowEnd = addDays(new Date(today), 14)
    let resCount = 0
    for (const r of restaurants) {
      const branchIds = branchIdsByRestaurant.get(r.id)
      const n = intBetween(rng, 40, 150)
      for (let i = 0; i < n; i++) {
        const scheduledAt = randomDateBetween(rng, windowStart, windowEnd)
        const status = pick(rng, RESERVATION_STATUSES)
        const partySize = intBetween(rng, 2, 8)
        const first = pick(rng, FIRST_NAMES)
        const last = pick(rng, LAST_NAMES)
        const branchId = pick(rng, branchIds)
        await client.query(
          `INSERT INTO reservation (id, restaurant_id, branch_id, status, customer_name, customer_phone, party_size, scheduled_at, duration_minutes, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 90, NOW(), NOW())`,
          [
            uuid(),
            r.id,
            branchId,
            status,
            `${first} ${last}`,
            '+1555' + intBetween(rng, 100000, 999999),
            partySize,
            scheduledAt.toISOString(),
          ]
        )
        resCount++
      }
    }
    console.log('   Reservations: ' + resCount)

    // --- Orders (60-180 per restaurant over 90 days, 6-25 lines, 2-7 suppliers) ---
    const orderStatuses = [
      'COMPLETED',
      'COMPLETED',
      'COMPLETED',
      'COMPLETED',
      'SHIPPED',
      'PROCESSING',
      'ACKNOWLEDGED',
      'PLACED',
      'CANCELLED',
    ]
    const ninetyDaysAgo = addDays(new Date(today), -90)
    const ordersByRestaurant = new Map()
    for (const r of restaurants) ordersByRestaurant.set(r.id, [])
    let orderCount = 0
    const supplierCoverage = new Map()
    for (const r of restaurants) supplierCoverage.set(r.id, new Set())

    for (const r of restaurants) {
      const numOrders = intBetween(rng, 60, 180)
      for (let o = 0; o < numOrders; o++) {
        const orderId = uuid()
        const placedAt = randomDateBetween(rng, ninetyDaysAgo, today)
        const status = pick(rng, orderStatuses)
        await client.query(
          `INSERT INTO customer_order (id, restaurant_id, status, total_amount, currency, placed_at, created_at, updated_at)
           VALUES ($1, $2, $3, 0, 'USD', $4, $5, $5)`,
          [
            orderId,
            r.id,
            status,
            status !== 'DRAFT' && status !== 'CANCELLED' ? placedAt.toISOString() : null,
            placedAt.toISOString(),
          ]
        )
        const numLines = intBetween(rng, 6, 25)
        const numSuppliersForOrder = intBetween(rng, 2, Math.min(7, suppliers.length))
        const chosenSuppliers = shuffle(rng, [...suppliers]).slice(0, numSuppliersForOrder)
        let orderTotal = 0
        for (const sup of chosenSuppliers) {
          supplierCoverage.get(r.id).add(sup.id)
          const prods = productsBySupplier.get(sup.id) || []
          const linesForSup = intBetween(
            rng,
            1,
            Math.max(1, Math.floor(numLines / numSuppliersForOrder) + 1)
          )
          shuffle(rng, prods)
          for (let l = 0; l < linesForSup && l < prods.length; l++) {
            const p = prods[l]
            const qty = intBetween(rng, 1, 20)
            const lineTotal = Math.round(p.price * qty * 1000) / 1000
            orderTotal += lineTotal
            await client.query(
              `INSERT INTO order_item (id, order_id, product_id, supplier_id, quantity, unit_price, line_total) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [uuid(), orderId, p.id, sup.id, qty, p.price, lineTotal]
            )
          }
        }
        await client.query(`UPDATE customer_order SET total_amount = $1 WHERE id = $2`, [
          orderTotal.toFixed(3),
          orderId,
        ])
        ordersByRestaurant.get(r.id).push({
          id: orderId,
          restaurant_id: r.id,
          total: orderTotal,
          placed_at: placedAt,
          status,
        })
        orderCount++
      }
    }
    // Ensure each restaurant has ordered from all 50 suppliers (add a few orders if needed)
    for (const r of restaurants) {
      const covered = supplierCoverage.get(r.id)
      const missing = suppliers.filter((s) => !covered.has(s.id))
      for (const s of missing.slice(0, 5)) {
        const orderId = uuid()
        const placedAt = randomDateBetween(rng, ninetyDaysAgo, today)
        await client.query(
          `INSERT INTO customer_order (id, restaurant_id, status, total_amount, currency, placed_at, created_at, updated_at)
           VALUES ($1, $2, 'COMPLETED', 0, 'USD', $3, $3, $3)`,
          [orderId, r.id, placedAt.toISOString()]
        )
        const prods = productsBySupplier.get(s.id) || []
        const p = pick(rng, prods)
        const qty = intBetween(rng, 1, 10)
        const lineTotal = Math.round(p.price * qty * 1000) / 1000
        await client.query(
          `INSERT INTO order_item (id, order_id, product_id, supplier_id, quantity, unit_price, line_total) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [uuid(), orderId, p.id, s.id, qty, p.price, lineTotal]
        )
        await client.query(`UPDATE customer_order SET total_amount = $1 WHERE id = $2`, [
          lineTotal.toFixed(3),
          orderId,
        ])
        ordersByRestaurant.get(r.id).push({
          id: orderId,
          restaurant_id: r.id,
          total: lineTotal,
          placed_at: placedAt,
          status: 'COMPLETED',
        })
        orderCount++
        covered.add(s.id)
      }
    }
    console.log('   Orders: ' + orderCount)

    // --- Invoices (20-60 per restaurant, last 120 days) ---
    const oneTwentyDaysAgo = addDays(new Date(today), -120)
    let invoiceCount = 0
    let globalInvSeq = 0
    let globalPaySeq = 0

    for (const r of restaurants) {
      const numInv = intBetween(rng, 20, 60)
      const restaurantOrders = ordersByRestaurant.get(r.id) || []
      const completedOrders = restaurantOrders.filter(
        (o) => o.status === 'COMPLETED' || o.status === 'SHIPPED'
      )
      for (let i = 0; i < numInv; i++) {
        const status = pick(rng, INVOICE_STATUSES)
        const invDate = randomDateBetween(rng, oneTwentyDaysAgo, today)
        const dueDays = intBetween(rng, 14, 45)
        const dueDate = addDays(new Date(invDate), dueDays)
        const supplier = pick(rng, suppliers)
        globalInvSeq += 1
        const invNum = `INV-${invDate.getFullYear()}-${String(invDate.getMonth() + 1).padStart(2, '0')}-${String(globalInvSeq).padStart(6, '0')}`
        const subtotal = floatBetween(rng, 200, 8000)
        const taxRate = 0.05
        const taxAmount = Math.round(subtotal * taxRate * 100) / 100
        const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100
        let paidAmount = 0
        if (status === 'PAID') paidAmount = totalAmount
        else if (status === 'PARTIALLY_PAID')
          paidAmount = Math.round(totalAmount * floatBetween(rng, 0.2, 0.8) * 100) / 100
        const balanceDue = Math.round((totalAmount - paidAmount) * 100) / 100
        const orderRow = completedOrders.length ? pick(rng, completedOrders) : null
        const orderId = orderRow ? orderRow.id : null
        const invoiceId = uuid()
        await client.query(
          `INSERT INTO invoice (id, invoice_number, supplier_id, restaurant_id, order_id, invoice_date, due_date, subtotal, tax_amount, total_amount, paid_amount, balance_due, status, currency, tax_rate, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'USD', $14, NOW(), NOW())`,
          [
            invoiceId,
            invNum,
            supplier.id,
            r.id,
            orderId,
            toDateString(invDate),
            toDateString(dueDate),
            subtotal.toFixed(2),
            taxAmount.toFixed(2),
            totalAmount.toFixed(2),
            paidAmount.toFixed(2),
            balanceDue.toFixed(2),
            status === 'VOID' ? 'VOID' : status,
            taxRate * 100,
          ]
        )
        const numLines = intBetween(rng, 2, 8)
        const prods = productsBySupplier.get(supplier.id) || []
        shuffle(rng, prods)
        for (let l = 0; l < numLines && l < prods.length; l++) {
          const p = prods[l]
          const qty = intBetween(rng, 1, 15)
          const lineTotal = Math.round(p.price * qty * 100) / 100
          await client.query(
            `INSERT INTO invoice_line_item (id, invoice_id, product_id, description, sku, quantity, unit_price, line_total, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
            [uuid(), invoiceId, p.id, p.name, p.sku, qty, p.price.toFixed(2), lineTotal.toFixed(2)]
          )
        }
        if (paidAmount > 0) {
          globalPaySeq += 1
          const payId = uuid()
          const payNum = `PAY-${invDate.getFullYear()}-${String(globalPaySeq).padStart(6, '0')}`
          const payDate =
            status === 'PAID'
              ? balanceDue <= 0
                ? invDate
                : addDays(new Date(invDate), intBetween(rng, 1, 30))
              : new Date(invDate)
          await client.query(
            `INSERT INTO payment (id, invoice_id, payment_number, payment_date, payment_amount, payment_method, status, currency, recorded_at, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, 'BANK_TRANSFER', 'COMPLETED', 'USD', $6, NOW(), NOW())`,
            [
              payId,
              invoiceId,
              payNum,
              toDateString(payDate),
              paidAmount.toFixed(2),
              toTimestamp(payDate),
            ]
          )
        }
        invoiceCount++
      }
    }
    console.log('   Invoices (with line items & payments): ' + invoiceCount)

    // Set invoice payment_date from payments for paid invoices (trigger sets CURRENT_DATE)
    await client.query(`
      UPDATE invoice i SET payment_date = (SELECT MAX(payment_date) FROM payment p WHERE p.invoice_id = i.id AND p.status = 'COMPLETED')
      WHERE i.status = 'PAID' AND EXISTS (SELECT 1 FROM payment p WHERE p.invoice_id = i.id)
    `)

    // Mark overdue: due_date in past and balance_due > 0
    await client.query(`
      UPDATE invoice SET status = 'OVERDUE' WHERE status = 'ISSUED' AND due_date < CURRENT_DATE AND balance_due > 0
    `)

    // --- Staff shifts (last 14 days, 2+ per day per restaurant) ---
    const fourteenDaysAgo = addDays(new Date(today), -14)
    let shiftCount = 0
    for (const r of restaurants) {
      const staffIds = staffByRestaurant.get(r.id) || []
      for (let d = 0; d < 15; d++) {
        const shiftDate = addDays(new Date(fourteenDaysAgo), d)
        const morningStart = new Date(shiftDate)
        morningStart.setUTCHours(6, 0, 0, 0)
        const morningEnd = new Date(shiftDate)
        morningEnd.setUTCHours(14, 0, 0, 0)
        const eveningStart = new Date(shiftDate)
        eveningStart.setUTCHours(14, 0, 0, 0)
        const eveningEnd = addDays(new Date(shiftDate), 1)
        eveningEnd.setUTCHours(22, 0, 0, 0)
        const shiftSlots = [
          [morningStart, morningEnd],
          [eveningStart, eveningEnd],
        ]
        for (const [startsAt, endsAt] of shiftSlots) {
          const staffId = staffIds.length ? pick(rng, staffIds) : null
          const role = staffId ? pick(rng, RESTAURANT_STAFF_ROLES) : 'waiter'
          await client.query(
            `INSERT INTO staff_shift (id, restaurant_id, staff_id, role, shift_date, starts_at, ends_at, status, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'PUBLISHED', NOW(), NOW())`,
            [
              uuid(),
              r.id,
              staffId,
              role,
              toDateString(shiftDate),
              toTimestamp(startsAt),
              toTimestamp(endsAt),
            ]
          )
          shiftCount++
        }
      }
    }
    console.log('   Staff shifts: ' + shiftCount)

    await client.query('COMMIT')
    const elapsed = ((Date.now() - start) / 1000).toFixed(1)
    console.log('\n✅ Prodlike seed completed in ' + elapsed + 's')
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('Seed failed:', e)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

main()
