/**
 * Demo-readiness extras: expiring inventory, coupon deal, near-limit Free supplier.
 * Idempotent — safe to re-run. Local only.
 *
 * Usage:
 *   pnpm run seed:demo-readiness
 *   (included in pnpm run seed:full)
 */
import 'dotenv/config'
import { pool, query } from '../src/lib/db.js'
import { disconnectCache } from '../src/lib/cache.js'
import { isMainModule } from './lib/is-main.mjs'
import {
  DEMO_RESTAURANT_ID,
  DEMO_RESTAURANT_SLUG,
  DEMO_SUPPLIER_ID,
  DEMO_SUPPLIER_SLUG,
} from './seed-demo-tenants.js'

const COUPON_CODE = 'DEMOFORK10'
const FREE_SUPPLIER_SLUG = 'plan-demo-supplier-free'
const FREE_TIER_DEMO_DEAL_NAME = 'Free Tier Quota Demo Deal'

function tomorrowIso() {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + 1)
  d.setUTCHours(12, 0, 0, 0)
  return d.toISOString()
}

async function seedExpiringInventory() {
  const { rows: restaurant } = await query(
    `SELECT id FROM restaurant WHERE slug = $1 OR id = $2::uuid LIMIT 1`,
    [DEMO_RESTAURANT_SLUG, DEMO_RESTAURANT_ID]
  )
  if (!restaurant[0]) {
    console.log('  Golden Fork not found — skipping expiring inventory')
    return
  }
  const restaurantId = restaurant[0].id

  const { rows: branch } = await query(
    `SELECT id FROM branch WHERE restaurant_id = $1 OR tenant_id = $1::uuid LIMIT 1`,
    [restaurantId]
  )
  const branchId = branch[0]?.id ?? null

  const { rows: product } = await query(
    `SELECT id, name FROM product
     WHERE supplier_id = $1::uuid AND sku = 'FF002'
     LIMIT 1`,
    [DEMO_SUPPLIER_ID]
  )
  if (!product[0]) {
    const { rows: fallback } = await query(
      `SELECT id, name FROM product WHERE supplier_id = $1::uuid ORDER BY sku LIMIT 1`,
      [DEMO_SUPPLIER_ID]
    )
    if (!fallback[0]) {
      console.log('  No Fresh Foods products — skipping expiring inventory')
      return
    }
    product[0] = fallback[0]
  }

  const expiryDate = tomorrowIso()
  await query(
    `INSERT INTO restaurant_inventory (
       restaurant_id, product_id, quantity, min_stock_threshold, low_stock_threshold,
       branch_id, expiry_date, storage_location, updated_at
     ) VALUES ($1, $2, 18, 5, 8, $3, $4, 'Walk-in cooler', NOW())
     ON CONFLICT (restaurant_id, product_id) DO UPDATE SET
       quantity = EXCLUDED.quantity,
       expiry_date = EXCLUDED.expiry_date,
       storage_location = EXCLUDED.storage_location,
       updated_at = NOW()`,
    [restaurantId, product[0].id, branchId, expiryDate]
  )
  console.log(
    `  Expiring inventory: ${product[0].name} expires tomorrow (${expiryDate.slice(0, 10)})`
  )
}

async function seedCouponDeal() {
  const { rows: supplier } = await query(
    `SELECT id FROM supplier WHERE slug = $1 OR id = $2::uuid LIMIT 1`,
    [DEMO_SUPPLIER_SLUG, DEMO_SUPPLIER_ID]
  )
  const { rows: restaurant } = await query(
    `SELECT id FROM restaurant WHERE slug = $1 OR id = $2::uuid LIMIT 1`,
    [DEMO_RESTAURANT_SLUG, DEMO_RESTAURANT_ID]
  )
  if (!supplier[0] || !restaurant[0]) {
    console.log('  Demo supplier/restaurant pair not found — skipping coupon deal')
    return
  }

  const { rows: existing } = await query(
    `SELECT id FROM promotions
     WHERE supplier_id = $1 AND lower(coupon_code) = lower($2)
     LIMIT 1`,
    [supplier[0].id, COUPON_CODE]
  )

  const now = new Date()
  const starts = new Date(now.getTime() - 7 * 86400000).toISOString()
  const ends = new Date(now.getTime() + 90 * 86400000).toISOString()
  const boostStart = new Date(now.getTime() - 86400000).toISOString()
  const boostEnd = new Date(now.getTime() + 60 * 86400000).toISOString()

  let promoId = existing[0]?.id
  if (!promoId) {
    const { rows } = await query(
      `INSERT INTO promotions (
         supplier_id, name, description, type, discount_value, min_order_amount, max_discount_cap,
         applies_to, status, starts_at, ends_at, is_featured, coupon_code, cta_type, payment_status,
         boost_start_at, boost_end_at
       ) VALUES ($1, $2, $3, 'percentage_discount', 15, 40, 50, 'all', 'active', $4, $5, true, $6, 'use_coupon', 'not_required', $7, $8)
       RETURNING id`,
      [
        supplier[0].id,
        'Demo coupon — 15% off',
        `Use coupon ${COUPON_CODE} at checkout for Golden Fork demo orders.`,
        starts,
        ends,
        COUPON_CODE,
        boostStart,
        boostEnd,
      ]
    )
    promoId = rows[0].id
    console.log(`  Created coupon deal (${COUPON_CODE})`)
  } else {
    await query(
      `UPDATE promotions SET
         status = 'active',
         cta_type = 'use_coupon',
         payment_status = 'not_required',
         starts_at = $2,
         ends_at = $3,
         boost_start_at = $4,
         boost_end_at = $5,
         updated_at = NOW()
       WHERE id = $1`,
      [promoId, starts, ends, boostStart, boostEnd]
    )
    console.log(`  Coupon deal already present (${COUPON_CODE}) — refreshed dates`)
  }

  await query(
    `INSERT INTO promotion_restaurant_targets (promotion_id, restaurant_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [promoId, restaurant[0].id]
  )
}

async function seedFreeTierNearLimitDeal() {
  const { rows: supplier } = await query(`SELECT id FROM supplier WHERE slug = $1 LIMIT 1`, [
    FREE_SUPPLIER_SLUG,
  ])
  if (!supplier[0]) {
    console.log('  plan-demo-supplier-free not found — skipping near-limit deal')
    return
  }

  const supplierId = supplier[0].id
  const { rows: activeDeals } = await query(
    `SELECT id, name FROM promotions
     WHERE supplier_id = $1
       AND status = 'active'
       AND COALESCE(payment_status, 'not_required') IN ('not_required', 'paid')
       AND starts_at <= NOW()
       AND (ends_at IS NULL OR ends_at > NOW())`,
    [supplierId]
  )

  if (activeDeals.length >= 1) {
    console.log(
      `  Free-tier supplier already has ${activeDeals.length} active deal(s) — at/near quota`
    )
    return
  }

  const now = new Date()
  const starts = new Date(now.getTime() - 3 * 86400000).toISOString()
  const ends = new Date(now.getTime() + 60 * 86400000).toISOString()
  const boostStart = new Date(now.getTime() - 86400000).toISOString()
  const boostEnd = new Date(now.getTime() + 60 * 86400000).toISOString()

  await query(
    `INSERT INTO promotions (
       supplier_id, name, description, type, discount_value, min_order_amount,
       applies_to, status, starts_at, ends_at, is_featured, payment_status,
       boost_start_at, boost_end_at
     ) VALUES ($1, $2, $3, 'percentage_discount', 5, 25, 'all', 'active', $4, $5, false, 'not_required', $6, $7)`,
    [
      supplierId,
      FREE_TIER_DEMO_DEAL_NAME,
      'Single active deal for Admin → Usage near-limit demo (Free plan promotions cap = 1).',
      starts,
      ends,
      boostStart,
      boostEnd,
    ]
  )
  console.log('  Created 1 active deal on plan-demo-supplier-free (at Free promotions limit)')
}

export async function seedDemoReadinessExtras() {
  console.log('Seeding demo-readiness extras…\n')
  await seedExpiringInventory()
  await seedCouponDeal()
  await seedFreeTierNearLimitDeal()
  console.log(`
✅ Demo-readiness extras complete.

Try:
  • restaurant@supplify.com → Inventory → Expiry (item expiring tomorrow)
  • restaurant@supplify.com → Deals / cart → coupon ${COUPON_CODE} (Fresh Foods)
  • admin@supplify.com → Usage → plan-demo-supplier-free (1/1 active deals)
`)
}

async function main() {
  try {
    await seedDemoReadinessExtras()
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
