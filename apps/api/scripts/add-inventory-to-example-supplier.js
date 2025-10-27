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

async function addInventory() {
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
    
    // Get products without inventory
    const { rows: products } = await pool.query(`
      SELECT p.id, p.name, p.sku
      FROM product p
      WHERE p.supplier_id = $1
        AND NOT EXISTS (
          SELECT 1 FROM inventory i WHERE i.product_id = p.id
        )
    `, [supplierId]);
    
    console.log(`\n📦 Found ${products.length} products without inventory\n`);
    
    if (products.length === 0) {
      console.log('All products already have inventory!');
      process.exit(0);
    }
    
    // Get warehouse
    const { rows: warehouses } = await pool.query(`
      SELECT id, name FROM warehouse WHERE supplier_id = $1 LIMIT 1
    `, [supplierId]);
    
    if (warehouses.length === 0) {
      console.log('❌ No warehouse found for Example Supplier');
      process.exit(1);
    }
    
    const warehouseId = warehouses[0].id;
    console.log(`📦 Using warehouse: ${warehouses[0].name}\n`);
    
    // Add inventory for each product
    for (const product of products) {
      const quantity = Math.floor(Math.random() * 1000) + 100; // Random quantity between 100-1000
      
      await pool.query(`
        INSERT INTO inventory (warehouse_id, product_id, available_qty, reserved_qty)
        VALUES ($1, $2, $3, 0)
      `, [warehouseId, product.id, quantity]);
      
      console.log(`✅ ${product.name} - ${quantity} kg`);
    }
    
    console.log(`\n✅ Successfully added inventory for ${products.length} products!`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

addInventory();
