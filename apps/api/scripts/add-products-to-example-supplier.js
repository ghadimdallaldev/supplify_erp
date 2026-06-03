import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../.env') });

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'supplify',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

const products = [
  { name: 'Fresh Tomatoes', sku: 'EXM-TOM-001', category: 'Vegetables', unit: 'kg', description: 'Premium vine tomatoes' },
  { name: 'Baby Spinach', sku: 'EXM-SPI-002', category: 'Vegetables', unit: 'kg', description: 'Organic baby spinach leaves' },
  { name: 'Bell Peppers', sku: 'EXM-BP-003', category: 'Vegetables', unit: 'kg', description: 'Assorted bell peppers' },
  { name: 'Cucumber', sku: 'EXM-CUC-004', category: 'Vegetables', unit: 'kg', description: 'Fresh English cucumbers' },
  { name: 'Lettuce', sku: 'EXM-LET-005', category: 'Vegetables', unit: 'kg', description: 'Crisp iceberg lettuce' },
  { name: 'Carrots', sku: 'EXM-CAR-006', category: 'Vegetables', unit: 'kg', description: 'Fresh organic carrots' },
  { name: 'Onions', sku: 'EXM-ONI-007', category: 'Vegetables', unit: 'kg', description: 'Yellow onions' },
  { name: 'Potatoes', sku: 'EXM-POT-008', category: 'Vegetables', unit: 'kg', description: 'Russet potatoes' },
  { name: 'Garlic', sku: 'EXM-GAR-009', category: 'Vegetables', unit: 'kg', description: 'Fresh garlic bulbs' },
  { name: 'Celery', sku: 'EXM-CEL-010', category: 'Vegetables', unit: 'kg', description: 'Fresh celery stalks' },
];

async function seedProducts() {
  try {
    // Find Example Supplier
    const { rows: supplier } = await pool.query(`
      SELECT id FROM supplier WHERE contact_email = 'supplier@example.com'
    `);
    
    if (supplier.length === 0) {
      console.log('❌ Example Supplier not found');
      process.exit(1);
    }
    
    const supplierId = supplier[0].id;
    console.log(`✅ Found Example Supplier: ${supplierId}`);
    
    // Check existing products
    const { rows: existingProducts } = await pool.query(`
      SELECT name, sku FROM product WHERE supplier_id = $1
    `, [supplierId]);
    
    console.log(`\n📦 Current products for Example Supplier: ${existingProducts.length}`);
    existingProducts.forEach(p => {
      console.log(`   - ${p.name} (${p.sku})`);
    });
    
    console.log(`\n🌱 Adding ${products.length} new products...\n`);
    
    console.log(`\n🌱 Seeding ${products.length} products...\n`);
    
    // Insert products
    for (const product of products) {
      const { rows } = await pool.query(`
        INSERT INTO product (supplier_id, name, sku, category, unit, description)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, name, sku
      `, [supplierId, product.name, product.sku, product.category, product.unit, product.description]);
      
      console.log(`✅ Created: ${product.name} (${product.sku})`);
      
      // Add a price for each product
      const price = (Math.random() * 20 + 5).toFixed(2); // Random price between $5 and $25
      await pool.query(`
        INSERT INTO price (product_id, amount, currency, valid_from)
        VALUES ($1, $2, 'USD', NOW())
      `, [rows[0].id, price]);
      
      console.log(`   💰 Price: $${price}`);
      
      // Add inventory to warehouse
      const { rows: warehouses } = await pool.query(`
        SELECT id FROM warehouse WHERE supplier_id = $1
      `, [supplierId]);
      
      if (warehouses.length > 0) {
        const warehouseId = warehouses[0].id;
        const quantity = Math.floor(Math.random() * 1000) + 100; // Random quantity between 100-1000
        
        await pool.query(`
          INSERT INTO inventory (warehouse_id, product_id, available_qty, reserved_qty)
          VALUES ($1, $2, $3, 0)
          ON CONFLICT (warehouse_id, product_id) 
          DO UPDATE SET available_qty = EXCLUDED.available_qty
        `, [warehouseId, rows[0].id, quantity]);
        
        console.log(`   📦 Stock: ${quantity} kg in warehouse`);
      }
    }
    
    console.log(`\n✅ Successfully seeded ${products.length} products for Example Supplier!`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

seedProducts();
