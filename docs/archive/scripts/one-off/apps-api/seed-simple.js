import pg from 'pg'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const { Pool } = pg
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') })

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://supplify_user:supplify_pass@localhost:5432/supplify_db',
})

async function seedDatabase() {
  console.log('🌱 Starting database seeding...\n')

  try {
    // 1. Seed Suppliers
    console.log('📦 Seeding suppliers...')
    const { rows: suppliers } = await pool.query(`
      INSERT INTO supplier (name, slug, contact_email, contact_phone, address_json, is_active)
      VALUES 
        ('Fresh Produce Co', 'fresh-produce-co', 'supplier@freshproduce.com', '+1234567890', 
          '{"street": "123 Farm Road", "city": "Agricultural City", "country": "USA"}'::jsonb, true),
        ('Quality Meats Ltd', 'quality-meats', 'supplier@qualitymeats.com', '+1234567891',
          '{"street": "456 Butcher Street", "city": "Meat City", "country": "USA"}'::jsonb, true),
        ('Beverages Express', 'beverages-express', 'supplier@beverages.com', '+1234567892',
          '{"street": "789 Drink Avenue", "city": "Beverage City", "country": "USA"}'::jsonb, true)
      ON CONFLICT (slug) DO NOTHING
      RETURNING *
    `)
    console.log(`✅ Seeded ${suppliers.length} suppliers\n`)

    // 2. Seed Restaurants
    console.log('🍽️ Seeding restaurants...')
    const { rows: restaurants } = await pool.query(`
      INSERT INTO restaurant (name, slug, contact_email, contact_phone, address_json, is_active)
      VALUES 
        ('Bella Italia Restaurant', 'bella-italia', 'restaurant@bellaitalia.com', '+1234567900',
          '{"street": "321 Italian Street", "city": "Food City", "country": "USA"}'::jsonb, true),
        ('Steak House & Grill', 'steak-house', 'restaurant@steakhouse.com', '+1234567901',
          '{"street": "654 Grill Avenue", "city": "Food City", "country": "USA"}'::jsonb, true),
        ('Ocean View Seafood', 'ocean-view', 'restaurant@oceanview.com', '+1234567902',
          '{"street": "987 Fish Lane", "city": "Food City", "country": "USA"}'::jsonb, true)
      ON CONFLICT (slug) DO NOTHING
      RETURNING *
    `)
    console.log(`✅ Seeded ${restaurants.length} restaurants\n`)

    // 3. Seed Products
    console.log('🛒 Seeding products...')
    
    const { rows: fpProducts } = await pool.query(`
      INSERT INTO product (supplier_id, sku, name, description, category, unit, image_url)
      VALUES 
        ($1, 'FP-001', 'Organic Tomatoes', 'Fresh organic tomatoes', 'Vegetables', 'kg', 'https://via.placeholder.com/300'),
        ($1, 'FP-002', 'Fresh Lettuce', 'Crisp lettuce', 'Vegetables', 'bunch', 'https://via.placeholder.com/300'),
        ($1, 'FP-003', 'Organic Carrots', 'Sweet organic carrots', 'Vegetables', 'kg', 'https://via.placeholder.com/300')
      ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name
      RETURNING *
    `, [suppliers[0].id])
    
    const { rows: qmProducts } = await pool.query(`
      INSERT INTO product (supplier_id, sku, name, description, category, unit, image_url)
      VALUES 
        ($1, 'QM-001', 'Premium Beef Steak', 'High quality beef', 'Meat', 'kg', 'https://via.placeholder.com/300'),
        ($1, 'QM-002', 'Fresh Chicken Breast', 'Boneless chicken', 'Meat', 'kg', 'https://via.placeholder.com/300')
      ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name
      RETURNING *
    `, [suppliers[1].id])
    
    const { rows: beProducts } = await pool.query(`
      INSERT INTO product (supplier_id, sku, name, description, category, unit, image_url)
      VALUES 
        ($1, 'BE-001', 'Fresh Orange Juice', '100% fresh juice', 'Beverages', 'liter', 'https://via.placeholder.com/300')
      ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name
      RETURNING *
    `, [suppliers[2].id])

    const allProducts = [...fpProducts, ...qmProducts, ...beProducts]
    console.log(`✅ Seeded ${allProducts.length} products\n`)

    // 4. Seed prices
    console.log('💰 Seeding prices...')
    const prices = []
    for (const product of allProducts) {
      const price = product.sku.startsWith('FP-') ? 25 : product.sku.startsWith('QM-') ? 80 : 45
      await pool.query(`
        INSERT INTO price (product_id, amount, currency, valid_from)
        VALUES ($1, $2, 'USD', now())
        ON CONFLICT DO NOTHING
      `, [product.id, price])
      prices.push(price)
    }
    console.log(`✅ Seeded ${prices.length} prices\n`)

    // 5. Seed inventory
    console.log('📊 Seeding inventory...')
    for (const product of allProducts) {
      const quantity = Math.floor(Math.random() * 200) + 50
      await pool.query(`
        INSERT INTO inventory (product_id, available_qty)
        VALUES ($1, $2)
        ON CONFLICT (product_id) DO UPDATE SET available_qty = EXCLUDED.available_qty
      `, [product.id, quantity])
    }
    console.log(`✅ Updated inventory for ${allProducts.length} products\n`)

    // 6. Seed orders
    console.log('📦 Seeding orders...')
    const orders = []
    
    for (let i = 0; i < 2; i++) {
      const restaurant = restaurants[i]
      const { rows: orderRows } = await pool.query(`
        INSERT INTO customer_order (restaurant_id, status, total_amount, placed_at)
        VALUES ($1, 'PLACED', $2, now() - INTERVAL '${i} days')
        RETURNING *
      `, [restaurant.id, 500 + (i * 100)])
      
      const order = orderRows[0]
      
      // Add order items
      for (let j = 0; j < 2; j++) {
        const product = allProducts[j]
        const quantity = Math.floor(Math.random() * 10) + 1
        const unitPrice = prices[j]
        
        await pool.query(`
          INSERT INTO order_item (order_id, product_id, supplier_id, quantity, unit_price, line_total)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [order.id, product.id, product.supplier_id, quantity, unitPrice, quantity * unitPrice])
      }
      
      orders.push(order)
    }
    console.log(`✅ Seeded ${orders.length} orders\n`)

    console.log('✨ Database seeding completed successfully!\n')
    console.log('📊 Summary:')
    console.log(`   - Suppliers: ${suppliers.length}`)
    console.log(`   - Restaurants: ${restaurants.length}`)
    console.log(`   - Products: ${allProducts.length}`)
    console.log(`   - Orders: ${orders.length}`)

  } catch (error) {
    console.error('❌ Error seeding database:', error)
    throw error
  } finally {
    await pool.end()
  }
}

seedDatabase()
