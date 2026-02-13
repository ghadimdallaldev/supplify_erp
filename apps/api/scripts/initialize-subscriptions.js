import 'dotenv/config'
import pg from 'pg'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const { Pool } = pg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

async function initializeSubscriptions() {
  console.log('Initializing subscriptions for existing tenants...\n')

  try {
    // Step 1: Assign default Free plan to all suppliers without subscriptions
    console.log('Step 1: Assigning Free plan to suppliers...')
    const { rows: suppliers } = await pool.query(`
      SELECT s.id, s.name, s.contact_email
      FROM supplier s
      LEFT JOIN subscription sub ON sub.tenant_id = s.id AND sub.tenant_type = 'SUPPLIER'
      WHERE sub.id IS NULL
    `)

    for (const supplier of suppliers) {
      const {
        rows: [subscription],
      } = await pool.query(
        `
        INSERT INTO subscription (tenant_id, tenant_type, plan_id, plan_name, status, billing_cycle, current_period_start, current_period_end)
        SELECT 
          $1, 'SUPPLIER', sp.id, sp.name, 'ACTIVE', 'MONTHLY', now(), now() + INTERVAL '1 month'
        FROM subscription_plan sp
        WHERE sp.code = 'free' AND sp.tenant_type = 'SUPPLIER' AND sp.is_active = true
        LIMIT 1
        RETURNING *
      `,
        [supplier.id]
      )

      console.log(`✓ Assigned Free plan to supplier: ${supplier.name}`)
    }
    console.log(`  → Initialized ${suppliers.length} supplier subscriptions\n`)

    // Step 2: Assign default Free plan to all restaurants without subscriptions
    console.log('Step 2: Assigning Free plan to restaurants...')
    const { rows: restaurants } = await pool.query(`
      SELECT r.id, r.name, r.contact_email
      FROM restaurant r
      LEFT JOIN subscription sub ON sub.tenant_id = r.id AND sub.tenant_type = 'RESTAURANT'
      WHERE sub.id IS NULL
    `)

    for (const restaurant of restaurants) {
      const {
        rows: [subscription],
      } = await pool.query(
        `
        INSERT INTO subscription (tenant_id, tenant_type, plan_id, plan_name, status, billing_cycle, current_period_start, current_period_end)
        SELECT 
          $1, 'RESTAURANT', sp.id, sp.name, 'ACTIVE', 'MONTHLY', now(), now() + INTERVAL '1 month'
        FROM subscription_plan sp
        WHERE sp.code = 'free' AND sp.tenant_type = 'RESTAURANT' AND sp.is_active = true
        LIMIT 1
        RETURNING *
      `,
        [restaurant.id]
      )

      console.log(`✓ Assigned Free plan to restaurant: ${restaurant.name}`)
    }
    console.log(`  → Initialized ${restaurants.length} restaurant subscriptions\n`)

    // Step 3: Initialize usage meters for suppliers
    console.log('Step 3: Initializing supplier usage meters...')
    const { rows: supplierSubs } = await pool.query(`
      SELECT s.id, s.tenant_id, s.tenant_type, sp.limits
      FROM subscription s
      JOIN subscription_plan sp ON sp.id = s.plan_id
      WHERE s.tenant_type = 'SUPPLIER' AND s.status IN ('ACTIVE', 'TRIALING')
    `)

    for (const sub of supplierSubs) {
      // Count products
      const { rows: productCount } = await pool.query(
        'SELECT COUNT(*) as count FROM product WHERE supplier_id = $1',
        [sub.tenant_id]
      )
      const productCountValue = parseInt(productCount[0].count)

      // Insert or update usage meter for products
      const productLimit = sub.limits?.products === -1 ? null : parseInt(sub.limits?.products || 0)
      await pool.query(
        `
        INSERT INTO usage_meter (tenant_id, tenant_type, meter_type, current_value, period_type, period_start_date, limit_value, is_over_limit)
        VALUES ($1, $2, 'products', $3, 'DAILY', CURRENT_DATE, $4, $3 >= COALESCE($4, 999999))
        ON CONFLICT (tenant_id, tenant_type, meter_type, period_start_date)
        DO UPDATE SET 
          current_value = EXCLUDED.current_value,
          limit_value = EXCLUDED.limit_value,
          is_over_limit = EXCLUDED.current_value >= COALESCE(EXCLUDED.limit_value, 999999)
      `,
        [sub.tenant_id, sub.tenant_type, productCountValue, productLimit]
      )

      console.log(`✓ Initialized products usage for supplier: ${productCountValue} products`)
    }

    // Step 4: Initialize usage meters for restaurants
    console.log('\nStep 4: Initializing restaurant usage meters...')
    const { rows: restaurantSubs } = await pool.query(`
      SELECT s.id, s.tenant_id, s.tenant_type, sp.limits
      FROM subscription s
      JOIN subscription_plan sp ON sp.id = s.plan_id
      WHERE s.tenant_type = 'RESTAURANT' AND s.status IN ('ACTIVE', 'TRIALING')
    `)

    for (const sub of restaurantSubs) {
      // Count today's orders
      const { rows: orderCount } = await pool.query(
        'SELECT COUNT(*) as count FROM customer_order WHERE restaurant_id = $1 AND placed_at::date = CURRENT_DATE',
        [sub.tenant_id]
      )
      const orderCountValue = parseInt(orderCount[0].count)

      // Insert or update usage meter for orders_per_day
      const orderLimit =
        sub.limits?.orders_per_day === -1 ? null : parseInt(sub.limits?.orders_per_day || 0)
      await pool.query(
        `
        INSERT INTO usage_meter (tenant_id, tenant_type, meter_type, current_value, period_type, period_start_date, limit_value, is_over_limit)
        VALUES ($1, $2, 'orders_per_day', $3, 'DAILY', CURRENT_DATE, $4, $3 >= COALESCE($4, 999999))
        ON CONFLICT (tenant_id, tenant_type, meter_type, period_start_date)
        DO UPDATE SET 
          current_value = EXCLUDED.current_value,
          limit_value = EXCLUDED.limit_value,
          is_over_limit = EXCLUDED.current_value >= COALESCE(EXCLUDED.limit_value, 999999)
      `,
        [sub.tenant_id, sub.tenant_type, orderCountValue, orderLimit]
      )

      console.log(`✓ Initialized orders_per_day usage for restaurant: ${orderCountValue} orders`)
    }

    console.log('\n✅ Subscription initialization completed successfully!')
    console.log(`\nSummary:`)
    console.log(`  - Suppliers initialized: ${suppliers.length}`)
    console.log(`  - Restaurants initialized: ${restaurants.length}`)
    console.log(`  - Usage meters created for all tenants`)
  } catch (error) {
    console.error('❌ Error initializing subscriptions:', error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

initializeSubscriptions()
