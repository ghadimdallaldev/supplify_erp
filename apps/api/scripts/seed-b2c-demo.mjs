/**
 * Al Maalem-style B2C demo — rich menu, images, modifiers, zones, loyalty, ordering hours.
 *
 * Run:  node apps/api/scripts/seed-b2c-demo.mjs
 *       node apps/api/scripts/seed-b2c-demo.mjs --force
 *       B2C_DEMO_SLUG=my-restaurant node apps/api/scripts/seed-b2c-demo.mjs
 */
import bcrypt from 'bcryptjs'
import { query, withTransaction } from '../src/lib/db.js'
import { invalidateMenuCache } from '../src/services/consumer-menu.service.js'

const SLUG = process.env.B2C_DEMO_SLUG || 'tier-restaurant-free-01'
const FORCE = process.argv.includes('--force')
const DEMO_DINER_USER = 'demo_diner'
const DEMO_DINER_PASS = 'demo1234'

/** Stable Unsplash food photos (400×400 crop) */
const IMG = {
  mezze: 'https://images.unsplash.com/photo-1571068316347-75b76f2280cd?w=400&h=400&fit=crop',
  salad: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=400&fit=crop',
  fries: 'https://images.unsplash.com/photo-1573080496216-bf070d0fcc0b?w=400&h=400&fit=crop',
  shawarma: 'https://images.unsplash.com/photo-1529006557810-274b1b4c7847?w=400&h=400&fit=crop',
  wrap: 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?w=400&h=400&fit=crop',
  grill: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=400&h=400&fit=crop',
  kebab: 'https://images.unsplash.com/photo-1603360946369-dc9bb6258143?w=400&h=400&fit=crop',
  manakish: 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?w=400&h=400&fit=crop',
  pizza: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=400&h=400&fit=crop',
  platter: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=400&h=400&fit=crop',
  burger: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=400&fit=crop',
  lemonade: 'https://images.unsplash.com/photo-1621263764928-df1444c5e859?w=400&h=400&fit=crop',
  coffee: 'https://images.unsplash.com/photo-1511920170033-f8396924c348?w=400&h=400&fit=crop',
  dessert: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=400&h=400&fit=crop',
  kunafa: 'https://images.unsplash.com/photo-1599599810769-2a5d3a2c4f8e?w=400&h=400&fit=crop',
}

const SPICE_LEVEL = {
  name: 'Spice level',
  min: 1,
  max: 1,
  required: true,
  options: [
    { name: 'Mild', priceDelta: 0 },
    { name: 'Medium', priceDelta: 0 },
    { name: 'Hot', priceDelta: 0 },
  ],
}

const BREAD_TYPE = {
  name: 'Bread',
  min: 1,
  max: 1,
  required: true,
  options: [
    { name: 'Arabic bread', priceDelta: 0 },
    { name: 'Saj wrap', priceDelta: 0 },
    { name: 'Markook', priceDelta: 0.5 },
  ],
}

const CATEGORIES = [
  {
    name: 'Mezze & Starters',
    description: 'Share plates and small bites',
    sortOrder: 1,
    items: [
      {
        name: 'Hummus & Warm Bread',
        description: 'Classic chickpea dip, olive oil, pine nuts, fresh flatbread',
        price: 12,
        sortOrder: 1,
        imageUrl: IMG.mezze,
      },
      {
        name: 'Mutabal',
        description: 'Smoky eggplant dip with tahini and pomegranate',
        price: 11,
        sortOrder: 2,
        imageUrl: IMG.mezze,
      },
      {
        name: 'Fattoush Salad',
        description: 'Crisp greens, tomatoes, sumac, fried bread chips',
        price: 13,
        sortOrder: 3,
        imageUrl: IMG.salad,
        modifiers: [
          {
            name: 'Dressing',
            min: 1,
            max: 1,
            required: true,
            options: [
              { name: 'Classic lemon', priceDelta: 0 },
              { name: 'Pomegranate molasses', priceDelta: 1 },
            ],
          },
        ],
      },
      {
        name: 'Crispy Fries',
        description: 'Golden fries with garlic aioli',
        price: 9,
        sortOrder: 4,
        imageUrl: IMG.fries,
        modifiers: [
          {
            name: 'Seasoning',
            min: 0,
            max: 2,
            required: false,
            options: [
              { name: 'Cheese sauce', priceDelta: 2 },
              { name: 'Spicy dust', priceDelta: 0.5 },
            ],
          },
        ],
      },
    ],
  },
  {
    name: 'Shawarma & Sandwiches',
    description: 'Fresh off the rotisserie',
    sortOrder: 2,
    items: [
      {
        name: 'Chicken Shawarma Plate',
        description: 'Marinated chicken, garlic sauce, pickles, fries',
        price: 26,
        sortOrder: 1,
        imageUrl: IMG.shawarma,
        modifiers: [SPICE_LEVEL, BREAD_TYPE],
      },
      {
        name: 'Beef Shawarma Wrap',
        description: 'Tender beef strips, tahini, tomatoes, onions',
        price: 22,
        sortOrder: 2,
        imageUrl: IMG.wrap,
        modifiers: [
          BREAD_TYPE,
          {
            name: 'Extras',
            min: 0,
            max: 3,
            required: false,
            options: [
              { name: 'Extra garlic', priceDelta: 1 },
              { name: 'Pickled turnips', priceDelta: 0.5 },
              { name: 'Fries inside', priceDelta: 2 },
            ],
          },
        ],
      },
      {
        name: 'Mixed Grill Sandwich',
        description: 'Chicken and kafta in one wrap',
        price: 24,
        sortOrder: 3,
        imageUrl: IMG.wrap,
        modifiers: [SPICE_LEVEL],
      },
    ],
  },
  {
    name: 'From the Grill',
    description: 'Charcoal-fired favourites',
    sortOrder: 3,
    items: [
      {
        name: 'Mixed Grill Platter',
        description: 'Kafta, shish tawook, lamb chop — serves 2',
        price: 68,
        sortOrder: 1,
        imageUrl: IMG.platter,
        modifiers: [SPICE_LEVEL],
      },
      {
        name: 'Shish Tawook',
        description: 'Marinated chicken skewers, rice, grilled tomato',
        price: 32,
        sortOrder: 2,
        imageUrl: IMG.grill,
        modifiers: [SPICE_LEVEL],
      },
      {
        name: 'Lamb Kafta',
        description: 'Seasoned minced lamb skewers with herb rice',
        price: 34,
        sortOrder: 3,
        imageUrl: IMG.kebab,
        modifiers: [SPICE_LEVEL],
      },
      {
        name: 'House Burger',
        description: 'Angus beef, lettuce, tomato, house sauce',
        price: 24,
        sortOrder: 4,
        imageUrl: IMG.burger,
        modifiers: [
          {
            name: 'Size',
            min: 1,
            max: 1,
            required: true,
            options: [
              { name: 'Regular', priceDelta: 0 },
              { name: 'Large', priceDelta: 4 },
            ],
          },
          {
            name: 'Extras',
            min: 0,
            max: 3,
            required: false,
            options: [
              { name: 'Extra cheese', priceDelta: 2 },
              { name: 'Bacon', priceDelta: 3.5 },
              { name: 'Avocado', priceDelta: 3 },
            ],
          },
        ],
      },
    ],
  },
  {
    name: 'Manakish & Bakery',
    description: 'Fresh from the oven',
    sortOrder: 4,
    items: [
      {
        name: 'Zaatar Manakish',
        description: 'Wild thyme, olive oil, sesame — baked to order',
        price: 8,
        sortOrder: 1,
        imageUrl: IMG.manakish,
      },
      {
        name: 'Cheese Manakish',
        description: 'Akawi cheese blend, optional extras',
        price: 10,
        sortOrder: 2,
        imageUrl: IMG.manakish,
        modifiers: [
          {
            name: 'Add-ons',
            min: 0,
            max: 2,
            required: false,
            options: [
              { name: 'Labneh', priceDelta: 1.5 },
              { name: 'Olives', priceDelta: 1 },
            ],
          },
        ],
      },
      {
        name: 'Margherita Flatbread',
        description: 'Tomato, mozzarella, basil',
        price: 18,
        sortOrder: 3,
        imageUrl: IMG.pizza,
        modifiers: [
          {
            name: 'Toppings',
            min: 0,
            max: 4,
            required: false,
            options: [
              { name: 'Mushrooms', priceDelta: 1.5 },
              { name: 'Pepperoni', priceDelta: 2 },
              { name: 'Olives', priceDelta: 1.5 },
              { name: 'Extra mozzarella', priceDelta: 2.5 },
            ],
          },
        ],
      },
    ],
  },
  {
    name: 'Family Combos',
    description: 'Best value for sharing',
    sortOrder: 5,
    items: [
      {
        name: 'Family Feast (4 persons)',
        description: 'Mixed grill, hummus, fattoush, fries, soft drinks',
        price: 120,
        sortOrder: 1,
        imageUrl: IMG.platter,
      },
      {
        name: 'Shawarma Party Box',
        description: '12 wraps, garlic sauce, pickles — perfect for gatherings',
        price: 95,
        sortOrder: 2,
        imageUrl: IMG.shawarma,
        modifiers: [
          {
            name: 'Protein mix',
            min: 1,
            max: 1,
            required: true,
            options: [
              { name: 'All chicken', priceDelta: 0 },
              { name: 'All beef', priceDelta: 5 },
              { name: 'Mixed', priceDelta: 3 },
            ],
          },
        ],
      },
    ],
  },
  {
    name: 'Drinks',
    description: 'Cold & hot beverages',
    sortOrder: 6,
    items: [
      {
        name: 'Fresh Lemonade',
        description: 'House-made, still or sparkling',
        price: 6,
        sortOrder: 1,
        imageUrl: IMG.lemonade,
        modifiers: [
          {
            name: 'Style',
            min: 1,
            max: 1,
            required: true,
            options: [
              { name: 'Still', priceDelta: 0 },
              { name: 'Sparkling', priceDelta: 0.5 },
            ],
          },
        ],
      },
      {
        name: 'Mint Lemonade',
        description: 'Classic Levantine refresher',
        price: 7,
        sortOrder: 2,
        imageUrl: IMG.lemonade,
      },
      {
        name: 'Arabic Coffee',
        description: 'Cardamom-spiced, served traditional style',
        price: 5,
        sortOrder: 3,
        imageUrl: IMG.coffee,
      },
      {
        name: 'Espresso',
        description: 'Single or double shot',
        price: 4,
        sortOrder: 4,
        imageUrl: IMG.coffee,
        modifiers: [
          {
            name: 'Size',
            min: 1,
            max: 1,
            required: true,
            options: [
              { name: 'Single', priceDelta: 0 },
              { name: 'Double', priceDelta: 1.5 },
            ],
          },
        ],
      },
    ],
  },
  {
    name: 'Desserts',
    description: 'Sweet finish',
    sortOrder: 7,
    items: [
      {
        name: 'Kunafa Slice',
        description: 'Warm cheese pastry, syrup, crushed pistachios',
        price: 11,
        sortOrder: 1,
        imageUrl: IMG.kunafa,
      },
      {
        name: 'Chocolate Brownie',
        description: 'Warm brownie with vanilla ice cream',
        price: 10,
        sortOrder: 2,
        imageUrl: IMG.dessert,
      },
      {
        name: 'Baklava Selection',
        description: 'Three pieces — pistachio and walnut',
        price: 9,
        sortOrder: 3,
        imageUrl: IMG.dessert,
      },
    ],
  },
]

const OPERATING_HOURS = {
  monday: { open: '11:00', close: '23:00' },
  tuesday: { open: '11:00', close: '23:00' },
  wednesday: { open: '11:00', close: '23:00' },
  thursday: { open: '11:00', close: '23:00' },
  friday: { open: '11:00', close: '00:00' },
  saturday: { open: '11:00', close: '00:00' },
  sunday: { open: '12:00', close: '23:00' },
}

const RESTAURANT_LOGO =
  'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=200&h=200&fit=crop'

async function clearMenu(client, restaurantId) {
  await client.query(
    `DELETE FROM menu_modifier_option
     WHERE modifier_group_id IN (
       SELECT g.id FROM menu_modifier_group g
       JOIN menu_item i ON i.id = g.menu_item_id
       WHERE i.restaurant_id = $1
     )`,
    [restaurantId]
  )
  await client.query(
    `DELETE FROM menu_modifier_group
     WHERE menu_item_id IN (SELECT id FROM menu_item WHERE restaurant_id = $1)`,
    [restaurantId]
  )
  await client.query(`DELETE FROM menu_item WHERE restaurant_id = $1`, [restaurantId])
  await client.query(`DELETE FROM menu_category WHERE restaurant_id = $1`, [restaurantId])
}

async function insertItemWithModifiers(client, restaurantId, categoryId, item) {
  const { rows } = await client.query(
    `INSERT INTO menu_item (
       restaurant_id, branch_id, category_id, name, description,
       base_price, image_url, sort_order
     )
     VALUES ($1, NULL, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      restaurantId,
      categoryId,
      item.name,
      item.description,
      item.price,
      item.imageUrl ?? null,
      item.sortOrder,
    ]
  )
  const itemId = rows[0].id

  for (const [gi, group] of (item.modifiers || []).entries()) {
    const { rows: groupRows } = await client.query(
      `INSERT INTO menu_modifier_group (
         restaurant_id, menu_item_id, name, min_selections, max_selections, is_required, sort_order
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        restaurantId,
        itemId,
        group.name,
        group.min,
        group.max,
        group.required,
        gi + 1,
      ]
    )
    const groupId = groupRows[0].id
    for (const [oi, opt] of group.options.entries()) {
      await client.query(
        `INSERT INTO menu_modifier_option (modifier_group_id, name, price_delta, sort_order)
         VALUES ($1, $2, $3, $4)`,
        [groupId, opt.name, opt.priceDelta, oi + 1]
      )
    }
  }
  return itemId
}

async function upsertBranchFulfillment(client, branchId, zonePrefixes) {
  await client.query(
    `INSERT INTO branch_fulfillment_config (
       branch_id, delivery_enabled, takeaway_enabled, dine_in_enabled,
       min_order_amount, delivery_fee, estimated_prep_minutes,
       live_order_start, live_order_end, allow_preorders_outside_live_hours
     )
     VALUES ($1, TRUE, TRUE, TRUE, 15, 5, 25, '12:00', '00:00', TRUE)
     ON CONFLICT (branch_id) DO UPDATE SET
       delivery_enabled = TRUE,
       takeaway_enabled = TRUE,
       dine_in_enabled = TRUE,
       min_order_amount = 15,
       delivery_fee = 5,
       estimated_prep_minutes = 25,
       live_order_start = COALESCE(branch_fulfillment_config.live_order_start, '12:00'),
       live_order_end = COALESCE(branch_fulfillment_config.live_order_end, '00:00'),
       allow_preorders_outside_live_hours = COALESCE(
         branch_fulfillment_config.allow_preorders_outside_live_hours, TRUE
       )`,
    [branchId]
  )

  await client.query(`DELETE FROM delivery_zone WHERE branch_id = $1`, [branchId])
  for (const zone of zonePrefixes) {
    await client.query(
      `INSERT INTO delivery_zone (branch_id, name, postcode_prefix, delivery_fee, min_order_amount)
       VALUES ($1, $2, $3, $4, $5)`,
      [branchId, zone.name, zone.prefix, zone.fee, zone.minOrder]
    )
  }
}

async function ensureDemoDiner(restaurantId) {
  const { rows: existing } = await query(
    `SELECT id FROM consumer_member
     WHERE restaurant_id = $1 AND lower(username) = $2`,
    [restaurantId, DEMO_DINER_USER]
  )
  if (existing.length) {
    return { username: DEMO_DINER_USER, password: DEMO_DINER_PASS, created: false }
  }

  const passwordHash = await bcrypt.hash(DEMO_DINER_PASS, 10)
  await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO consumer_member (
         restaurant_id, username, password_hash, display_name, name, email, phone
       )
       VALUES ($1, $2, $3, $4, $4, $5, $6)
       RETURNING id`,
      [
        restaurantId,
        DEMO_DINER_USER,
        passwordHash,
        'Demo Diner',
        'demo.diner@example.com',
        '+971500000099',
      ]
    )
    const memberId = rows[0].id

    const { rows: programRows } = await client.query(
      `SELECT welcome_bonus_points FROM consumer_loyalty_program
       WHERE restaurant_id = $1 AND enabled = TRUE`,
      [restaurantId]
    )
    const bonus = Number(programRows[0]?.welcome_bonus_points ?? 0)
    if (bonus > 0) {
      await client.query(
        `UPDATE consumer_member
         SET loyalty_points = $1, lifetime_earned = $2, welcome_bonus_awarded = TRUE
         WHERE id = $3`,
        [bonus, bonus, memberId]
      )
      await client.query(
        `INSERT INTO consumer_loyalty_ledger (
           restaurant_id, consumer_member_id, entry_type, points_delta, balance_after, metadata
         )
         VALUES ($1, $2, 'EARN', $3, $4, $5::jsonb)`,
        [
          restaurantId,
          memberId,
          bonus,
          bonus,
          JSON.stringify({ source: 'welcome_bonus', seed: true }),
        ]
      )
    }
  })

  return { username: DEMO_DINER_USER, password: DEMO_DINER_PASS, created: true }
}

export async function seedB2cDemo() {
  const { rows: restaurants } = await query(
    `SELECT id, slug, name FROM restaurant WHERE slug = $1`,
    [SLUG]
  )
  if (!restaurants.length) {
    throw new Error(
      `Restaurant slug "${SLUG}" not found — set B2C_DEMO_SLUG or create the restaurant first`
    )
  }
  const restaurant = restaurants[0]

  const { rows: branches } = await query(
    `SELECT id, name FROM branch WHERE tenant_id = $1 AND is_active ORDER BY name`,
    [restaurant.id]
  )
  if (!branches.length) {
    throw new Error(`No active branch for ${SLUG}`)
  }

  let itemCount = 0
  let modifierGroupCount = 0
  let skipped = false

  await withTransaction(async (client) => {
    const { rows: existing } = await client.query(
      `SELECT id FROM menu_category WHERE restaurant_id = $1 LIMIT 1`,
      [restaurant.id]
    )
    if (existing.length && !FORCE) {
      skipped = true
      return
    }
    if (existing.length && FORCE) {
      await clearMenu(client, restaurant.id)
      console.log(`Cleared existing menu for ${SLUG}`)
    }

    await client.query(
      `UPDATE restaurant SET
         phone = COALESCE(phone, '+971600000001'),
         logo_url = COALESCE(logo_url, $2),
         operating_hours = COALESCE(operating_hours, $3::jsonb),
         updated_at = now()
       WHERE id = $1`,
      [restaurant.id, RESTAURANT_LOGO, JSON.stringify(OPERATING_HOURS)]
    )

    for (const cat of CATEGORIES) {
      const { rows: catRows } = await client.query(
        `INSERT INTO menu_category (restaurant_id, branch_id, name, description, sort_order)
         VALUES ($1, NULL, $2, $3, $4)
         RETURNING id`,
        [restaurant.id, cat.name, cat.description, cat.sortOrder]
      )
      const categoryId = catRows[0].id

      for (const item of cat.items) {
        await insertItemWithModifiers(client, restaurant.id, categoryId, item)
        itemCount += 1
        modifierGroupCount += (item.modifiers || []).length
      }
    }

    await client.query(
      `INSERT INTO consumer_loyalty_program (
         restaurant_id, name, enabled, earn_points_per_currency, redeem_currency_per_point,
         min_redeem_points, welcome_bonus_points, max_redeem_percent, rules_json
       )
       VALUES ($1, 'Rewards Club', TRUE, 1, 0.10, 50, 50, 50, $2::jsonb)
       ON CONFLICT (restaurant_id) DO UPDATE SET
         name = EXCLUDED.name,
         enabled = TRUE,
         welcome_bonus_points = 50,
         max_redeem_percent = 50,
         rules_json = EXCLUDED.rules_json`,
      [
        restaurant.id,
        JSON.stringify({
          fulfillment_multipliers: { TAKEAWAY: 1, DELIVERY: 1.25, DINE_IN: 1.5 },
        }),
      ]
    )

    const zoneSets = [
      [
        { name: 'City centre', prefix: '000', fee: 5, minOrder: 15 },
        { name: 'Marina', prefix: '001', fee: 6, minOrder: 18 },
        { name: 'Outer area', prefix: '002', fee: 8, minOrder: 20 },
      ],
      [
        { name: 'Local delivery', prefix: '010', fee: 4, minOrder: 12 },
        { name: 'Extended zone', prefix: '011', fee: 7, minOrder: 18 },
      ],
    ]

    for (const [idx, branch] of branches.entries()) {
      await upsertBranchFulfillment(client, branch.id, zoneSets[idx % zoneSets.length])
    }
  })

  if (skipped) {
    console.log(`Menu already seeded for ${SLUG}. Use --force to replace.`)
  }

  for (const branch of branches) {
    await invalidateMenuCache(restaurant.id, branch.id)
  }
  await invalidateMenuCache(restaurant.id, null)

  const demoDiner = await ensureDemoDiner(restaurant.id)
  const primaryBranch = branches[0]
  const baseUrl = process.env.MARKETING_WEB_ORIGIN || process.env.WEB_ORIGIN || 'http://localhost:5173'

  const summary = {
    restaurant: restaurant.name,
    slug: SLUG,
    branches: branches.map((b) => ({ id: b.id, name: b.name })),
    primaryBranchId: primaryBranch.id,
    categories: CATEGORIES.length,
    items: itemCount,
    modifierGroups: modifierGroupCount,
    features: [
      'Category menu with images',
      'Item modifiers (size, spice, bread, extras)',
      'Delivery / takeaway / dine-in',
      'Delivery zones by postcode',
      'Live orders 12:00–midnight, preorders overnight',
      'Rewards (50 welcome pts)',
      'Guest + member checkout',
      'Order tracking',
    ],
    demoDiner: {
      username: demoDiner.username,
      password: demoDiner.password,
      note: `Valid only at /order/${SLUG}`,
      created: demoDiner.created,
    },
    urls: {
      storefront: `${baseUrl}/order/${SLUG}`,
      menu: `${baseUrl}/order/${SLUG}/menu?branchId=${primaryBranch.id}`,
      checkout: `${baseUrl}/order/${SLUG}/checkout?branchId=${primaryBranch.id}`,
      account: `${baseUrl}/order/${SLUG}/account`,
      rewards: `${baseUrl}/order/${SLUG}/rewards`,
      track: `${baseUrl}/order/${SLUG}/track`,
    },
  }

  console.log('\n✅ B2C Al Maalem-style demo seeded:\n', JSON.stringify(summary, null, 2))
  return summary
}

const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('seed-b2c-demo.mjs')
if (isMain) {
  try {
    await seedB2cDemo()
    process.exit(0)
  } catch (err) {
    console.error(err.message || err)
    process.exit(1)
  }
}
