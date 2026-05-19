/**
 * Seed reports, disputes, and supplier promotions/deals for demo tenants.
 * Idempotent — safe to re-run. Does not wipe prod-like data.
 *
 * Usage: pnpm run seed:features
 */
import 'dotenv/config'
import { pool, query } from '../src/lib/db.js'
import { disconnectCache } from '../src/lib/cache.js'
import { isMainModule } from './lib/is-main.mjs'
const DEMO_ORDER_COMPLETED = '11111111-1111-4111-8111-111111111111'
const FEATURE_SLUGS = {
  restaurantGold: 'tier-restaurant-gold',
  supplierGold: 'tier-supplier-gold',
}

async function ensureGoldPlan(tenantId, tenantType) {
  const { rows: updated } = await query(
    `UPDATE subscription s
     SET plan_id = sp.id,
         plan_name = sp.name,
         status = 'ACTIVE',
         updated_at = NOW()
     FROM subscription_plan sp
     WHERE s.tenant_id = $1 AND s.tenant_type = $2
       AND sp.code = 'gold' AND sp.tenant_type = $2 AND sp.is_active = true
     RETURNING s.id`,
    [tenantId, tenantType]
  )
  if (updated.length > 0) return

  const { rows: plan } = await query(
    `SELECT id, name FROM subscription_plan
     WHERE code = 'gold' AND tenant_type = $1 AND is_active = true LIMIT 1`,
    [tenantType]
  )
  if (!plan[0]) return

  await query(
    `INSERT INTO subscription (
       tenant_id, tenant_type, plan_id, plan_name, status, billing_cycle,
       current_period_start, current_period_end
     ) VALUES ($1, $2, $3, $4, 'ACTIVE', 'MONTHLY', NOW(), NOW() + interval '1 year')
     ON CONFLICT DO NOTHING`,
    [tenantId, tenantType, plan[0].id, plan[0].name]
  ).catch(() =>
    query(
      `INSERT INTO subscription (
         tenant_id, tenant_type, plan_id, plan_name, status, billing_cycle,
         current_period_start, current_period_end
       ) VALUES ($1, $2, $3, $4, 'ACTIVE', 'MONTHLY', NOW(), NOW() + interval '1 year')`,
      [tenantId, tenantType, plan[0].id, plan[0].name]
    )
  )
}

async function resolveTenantPairs() {
  const pairs = []
  const { rows: gold } = await query(
    `SELECT r.id AS restaurant_id, s.id AS supplier_id
     FROM restaurant r
     JOIN supplier s ON s.slug = $2
     WHERE r.slug = $1`,
    [FEATURE_SLUGS.restaurantGold, FEATURE_SLUGS.supplierGold]
  )
  if (gold[0]) {
    pairs.push({
      label: 'Gold tier',
      restaurantId: gold[0].restaurant_id,
      supplierId: gold[0].supplier_id,
    })
  }

  const { rows: demoRest } = await query(
    `SELECT id FROM restaurant WHERE slug = 'plan-demo-restaurant-gold' LIMIT 1`
  )
  const { rows: demoSup } = await query(
    `SELECT id FROM supplier WHERE slug = 'plan-demo-supplier-gold' LIMIT 1`
  )
  if (demoRest[0] && demoSup[0]) {
    pairs.push({
      label: 'Legacy Gold plan demos',
      restaurantId: demoRest[0].id,
      supplierId: demoSup[0].id,
    })
  }

  if (pairs.length === 0) {
    const { rows: fallback } = await query(
      `SELECT r.id AS restaurant_id, s.id AS supplier_id, r.name, s.name
       FROM restaurant r
       CROSS JOIN supplier s
       WHERE EXISTS (SELECT 1 FROM product p WHERE p.supplier_id = s.id)
       ORDER BY r.created_at, s.created_at
       LIMIT 1`
    )
    if (fallback[0]) {
      pairs.push({
        label: `${fallback[0].name} + ${fallback[0].name}`,
        restaurantId: fallback[0].restaurant_id,
        supplierId: fallback[0].supplier_id,
      })
    }
  }

  return pairs
}

async function ensureCompletedOrders(restaurantId, supplierId) {
  await query(
    `UPDATE customer_order
     SET status = 'COMPLETED', updated_at = NOW()
     WHERE id = $1 AND restaurant_id = $2`,
    [DEMO_ORDER_COMPLETED, restaurantId]
  )

  const { rows: existing } = await query(
    `SELECT COUNT(*)::int AS n FROM customer_order co
     JOIN order_item oi ON oi.order_id = co.id
     WHERE co.restaurant_id = $1 AND oi.supplier_id = $2 AND co.status = 'COMPLETED'`,
    [restaurantId, supplierId]
  )
  if (Number(existing[0]?.n) >= 3) return

  const { rows: products } = await query(
    `SELECT id, name FROM product WHERE supplier_id = $1 LIMIT 5`,
    [supplierId]
  )
  if (!products.length) return

  const { rows: branch } = await query(
    `SELECT id FROM branch WHERE tenant_id = $1::uuid OR restaurant_id = $1::uuid LIMIT 1`,
    [restaurantId]
  )
  const branchId = branch[0]?.id || null

  for (let d = 0; d < 12; d++) {
    const placedAt = new Date()
    placedAt.setDate(placedAt.getDate() - d * 7)
    let total = 0
    const { rows: orderRows } = await query(
      `INSERT INTO customer_order (restaurant_id, branch_id, status, total_amount, currency, placed_at, created_at, updated_at)
       VALUES ($1, $2, 'COMPLETED', 0, 'USD', $3, $3, $3)
       RETURNING id`,
      [restaurantId, branchId, placedAt.toISOString()]
    )
    const orderId = orderRows[0].id
    const pick = products.slice(0, 2 + (d % 2))
    for (const p of pick) {
      const qty = 5 + (d % 8)
      const unit = 8 + (d % 5) * 2.5
      const line = qty * unit
      total += line
      await query(
        `INSERT INTO order_item (order_id, product_id, supplier_id, quantity, unit_price, line_total)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [orderId, p.id, supplierId, qty, unit, line]
      )
    }
    await query(`UPDATE customer_order SET total_amount = $1 WHERE id = $2`, [total, orderId])

    const invNum = `INV-SEED-${String(orderId).slice(0, 8)}`
    await query(
      `INSERT INTO invoice (
         invoice_number, supplier_id, restaurant_id, order_id, invoice_date, due_date,
         subtotal, tax_amount, total_amount, paid_amount, balance_due, status, currency, payment_terms_days
       )
       SELECT $1, $2, $3, $4::uuid, $5::date, ($5::date + interval '30 days'), $6, 0, $6, $6, 0, 'PAID', 'USD', 30
       WHERE NOT EXISTS (SELECT 1 FROM invoice WHERE order_id = $4::uuid)`,
      [invNum, supplierId, restaurantId, orderId, placedAt.toISOString().slice(0, 10), total]
    )
  }
}

async function seedPromotions(supplierId, restaurantId) {
  const { rows: existing } = await query(
    `SELECT COUNT(*)::int AS n FROM promotions WHERE supplier_id = $1`,
    [supplierId]
  )
  if (Number(existing[0]?.n) >= 2) {
    console.log('  Promotions already present — skipping')
    return
  }

  const { rows: products } = await query(`SELECT id FROM product WHERE supplier_id = $1 LIMIT 3`, [
    supplierId,
  ])

  const now = new Date()
  const starts = new Date(now.getTime() - 7 * 86400000).toISOString()
  const ends = new Date(now.getTime() + 90 * 86400000).toISOString()

  const promos = [
    {
      name: 'Spring 10% Off',
      description: 'Ten percent off eligible lines — auto-applied at checkout.',
      type: 'percentage_discount',
      discount_value: 10,
      min_order_amount: 50,
      max_discount_cap: 75,
      is_featured: true,
    },
    {
      name: 'Free delivery week',
      description: 'Free shipping on orders over $100.',
      type: 'free_shipping',
      discount_value: 15,
      min_order_amount: 100,
      max_discount_cap: 15,
      is_featured: false,
    },
    {
      name: 'Bulk produce deal',
      description: 'Buy 10 cases, get 2 free on selected SKUs.',
      type: 'buy_x_get_y',
      buy_quantity: 10,
      get_quantity: 2,
      min_order_amount: 200,
      is_featured: true,
    },
  ]

  for (const p of promos) {
    const { rows } = await query(
      `INSERT INTO promotions (
         supplier_id, name, description, type, discount_value, min_order_amount, max_discount_cap,
         buy_quantity, get_quantity, applies_to, status, starts_at, ends_at, is_featured
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active',$11,$12,$13)
       RETURNING id`,
      [
        supplierId,
        p.name,
        p.description,
        p.type,
        p.discount_value ?? null,
        p.min_order_amount ?? null,
        p.max_discount_cap ?? null,
        p.buy_quantity ?? null,
        p.get_quantity ?? null,
        products.length ? 'specific_products' : 'all',
        starts,
        ends,
        p.is_featured,
      ]
    )
    const promoId = rows[0].id
    if (products.length && p.type !== 'free_shipping') {
      for (const prod of products.slice(0, 2)) {
        await query(`INSERT INTO promotion_targets (promotion_id, product_id) VALUES ($1, $2)`, [
          promoId,
          prod.id,
        ])
      }
    }
    await query(
      `INSERT INTO promotion_restaurant_targets (promotion_id, restaurant_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [promoId, restaurantId]
    )
  }
  console.log(`  Created ${promos.length} active promotions`)
}

async function seedDisputes(restaurantId, supplierId) {
  const { rows: orders } = await query(
    `SELECT co.id, co.total_amount
     FROM customer_order co
     WHERE co.restaurant_id = $1 AND co.status = 'COMPLETED'
       AND EXISTS (
         SELECT 1 FROM order_item oi
         WHERE oi.order_id = co.id AND oi.supplier_id = $2
       )
     ORDER BY co.placed_at DESC
     LIMIT 5`,
    [restaurantId, supplierId]
  )
  if (!orders.length) {
    console.log('  No completed orders — skipping disputes')
    return
  }

  const samples = [
    {
      type: 'short_delivery',
      status: 'open',
      description: 'Two cases missing from delivery note #4421.',
    },
    {
      type: 'damaged_goods',
      status: 'under_review',
      description: 'Lettuce arrived wilted; photos attached by receiving.',
    },
    {
      type: 'wrong_items',
      status: 'resolved',
      description: 'Received SKU FF003 instead of FF001.',
      resolution_type: 'credit_note',
      resolution_notes: 'Credit note issued for incorrect lines.',
    },
  ]

  let created = 0
  for (let i = 0; i < Math.min(samples.length, orders.length); i++) {
    const order = orders[i]
    const s = samples[i]
    const { rows: dup } = await query(
      `SELECT 1 FROM disputes WHERE order_id = $1 AND status = ANY($2::text[])`,
      [order.id, ['open', 'under_review', 'escalated']]
    )
    if (dup.length && s.status !== 'resolved') continue

    const { rows: existing } = await query(`SELECT 1 FROM disputes WHERE order_id = $1`, [order.id])
    if (existing.length) continue

    const { rows: items } = await query(
      `SELECT oi.id, oi.quantity, oi.unit_price, p.name
       FROM order_item oi
       LEFT JOIN product p ON p.id = oi.product_id
       WHERE oi.order_id = $1 AND oi.supplier_id = $2
       LIMIT 2`,
      [order.id, supplierId]
    )

    const disputedAmount = Number(order.total_amount) * 0.25
    const { rows: disputeRows } = await query(
      `INSERT INTO disputes (
         order_id, restaurant_id, supplier_id, type, status, description, disputed_amount,
         resolution_type, resolution_notes, resolved_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id`,
      [
        order.id,
        restaurantId,
        supplierId,
        s.type,
        s.status,
        s.description,
        disputedAmount,
        s.resolution_type || null,
        s.resolution_notes || null,
        s.status === 'resolved' ? new Date().toISOString() : null,
      ]
    )
    const disputeId = disputeRows[0].id
    for (const item of items) {
      await query(
        `INSERT INTO dispute_items (
           dispute_id, order_item_id, product_name, quantity_ordered, quantity_received, unit_price, issue_description
         ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          disputeId,
          item.id,
          item.name,
          item.quantity,
          Math.max(0, Number(item.quantity) - 1),
          item.unit_price,
          s.description,
        ]
      )
    }
    if (s.status === 'resolved' && s.resolution_type === 'credit_note') {
      await query(
        `INSERT INTO credit_note (
           credit_note_number, supplier_id, restaurant_id, issue_date, reason, description,
           credit_amount, applied_amount, remaining_amount, status, currency, order_id, dispute_id
         )
         SELECT $1, $2, $3, CURRENT_DATE, 'RETURN', $4, $5, 0, $5, 'ISSUED', 'USD', $6, $7
         WHERE NOT EXISTS (SELECT 1 FROM credit_note WHERE dispute_id = $7)`,
        [
          `CN-DEMO-${disputeId.slice(0, 8)}`,
          supplierId,
          restaurantId,
          s.resolution_notes,
          disputedAmount,
          order.id,
          disputeId,
        ]
      )
    }
    created++
  }
  console.log(`  Created ${created} sample disputes`)
}

export async function seedFeatureDemos() {
  console.log('Seeding reports, disputes, and promotions/deals…\n')

  const pairs = await resolveTenantPairs()
  if (!pairs.length) {
    throw new Error(
      'No restaurant/supplier pairs found. Run pnpm run seed:demo-tenants or pnpm run seed:full first.'
    )
  }

  for (const pair of pairs) {
    console.log(`▶ ${pair.label}`)
    await ensureGoldPlan(pair.restaurantId, 'RESTAURANT')
    await ensureGoldPlan(pair.supplierId, 'SUPPLIER')
    await ensureCompletedOrders(pair.restaurantId, pair.supplierId)
    await seedPromotions(pair.supplierId, pair.restaurantId)
    await seedDisputes(pair.restaurantId, pair.supplierId)
  }

  console.log(`
✅ Feature demo seed complete.

Try as restaurant@supplify.com or restaurant-gold@supplify.com (Supplify1! / SupplifyRestaurant1!):
  • Reports → /app/reports
  • Disputes → /app/disputes
  • Deals → /app/deals

Try as supplier@supplify.com or supplier-gold@supplify.com:
  • Promotions → /app/promotions
  • Disputes (incoming) → /app/disputes
  • Reports → /app/reports
`)
}

async function main() {
  try {
    await seedFeatureDemos()
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
