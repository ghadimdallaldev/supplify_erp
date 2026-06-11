/**
 * Seeds a minimal B2C demo menu for tier-restaurant-free-01 (Free Plate #1).
 * Run: node apps/api/scripts/seed-b2c-demo.mjs
 */
import { query, withTransaction } from '../src/lib/db.js'

const SLUG = 'tier-restaurant-free-01'

export async function seedB2cDemo() {
  const { rows: restaurants } = await query(
    `SELECT id, slug, name FROM restaurant WHERE slug = $1`,
    [SLUG]
  )
  if (!restaurants.length) {
    throw new Error(`Restaurant slug "${SLUG}" not found`)
  }
  const restaurant = restaurants[0]

  const { rows: branches } = await query(
    `SELECT id, name FROM branch WHERE tenant_id = $1 AND is_active LIMIT 1`,
    [restaurant.id]
  )
  if (!branches.length) {
    throw new Error('No active branch found')
  }
  const branch = branches[0]

  await withTransaction(async (client) => {
    const { rows: existing } = await client.query(
      `SELECT id FROM menu_category WHERE restaurant_id = $1 LIMIT 1`,
      [restaurant.id]
    )
    if (existing.length) {
      console.log('Menu already seeded for', SLUG)
      return
    }

    const { rows: cats } = await client.query(
      `INSERT INTO menu_category (restaurant_id, branch_id, name, sort_order)
       VALUES ($1, $2, 'Mains', 1)
       RETURNING id`,
      [restaurant.id, branch.id]
    )
    const categoryId = cats[0].id

    const { rows: items } = await client.query(
      `INSERT INTO menu_item (restaurant_id, branch_id, category_id, name, description, base_price, sort_order)
       VALUES ($1, $2, $3, 'Demo Burger', 'Walkthrough demo item', 25.00, 1)
       RETURNING id`,
      [restaurant.id, branch.id, categoryId]
    )
    const itemId = items[0].id

    await client.query(
      `INSERT INTO branch_fulfillment_config (branch_id, delivery_enabled, takeaway_enabled, dine_in_enabled, min_order_amount, delivery_fee, estimated_prep_minutes)
       VALUES ($1, TRUE, TRUE, TRUE, 10, 5, 20)
       ON CONFLICT (branch_id) DO UPDATE SET
         delivery_enabled = EXCLUDED.delivery_enabled,
         takeaway_enabled = EXCLUDED.takeaway_enabled,
         dine_in_enabled = EXCLUDED.dine_in_enabled`,
      [branch.id]
    )

    await client.query(
      `INSERT INTO consumer_loyalty_program (
         restaurant_id, enabled, earn_points_per_currency, redeem_currency_per_point,
         min_redeem_points, rules_json
       )
       VALUES ($1, TRUE, 1, 0.10, 50, $2::jsonb)
       ON CONFLICT (restaurant_id) DO UPDATE SET enabled = TRUE`,
      [
        restaurant.id,
        JSON.stringify({
          fulfillment_multipliers: { TAKEAWAY: 1, DELIVERY: 1.25, DINE_IN: 1.5 },
        }),
      ]
    )

    console.log('Seeded B2C demo:', {
      slug: SLUG,
      restaurantId: restaurant.id,
      branchId: branch.id,
      menuItemId: itemId,
    })
  })
}

const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('seed-b2c-demo.mjs')
if (isMain) {
  await seedB2cDemo()
  process.exit(0)
}
