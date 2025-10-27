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

async function checkSupplier() {
  try {
    console.log('\n🔍 Checking Fresh Produce Co supplier...\n');
    
    // Check if supplier exists
    const { rows: supplier } = await pool.query(`
      SELECT id, name, contact_email
      FROM supplier 
      WHERE name ILIKE '%Fresh Produce%'
    `);
    
    if (supplier.length === 0) {
      console.log('❌ Supplier "Fresh Produce Co" not found\n');
      
      // List all suppliers
      const { rows: allSuppliers } = await pool.query(`
        SELECT id, name, contact_email
        FROM supplier
        ORDER BY name
      `);
      
      console.log(`\n📋 Found ${allSuppliers.length} suppliers total:\n`);
      allSuppliers.forEach(s => {
        console.log(`  - ${s.name} - ${s.contact_email}`);
      });
    } else {
      console.log('✅ Found supplier:', supplier[0]);
      console.log(`   ID: ${supplier[0].id}`);
      console.log(`   Email: ${supplier[0].contact_email}`);
      
      // Check products
      const { rows: products } = await pool.query(`
        SELECT id, name, sku
        FROM product
        WHERE supplier_id = $1
      `, [supplier[0].id]);
      
      console.log(`\n📦 Products: ${products.length}`);
      products.slice(0, 5).forEach(p => {
        console.log(`   - ${p.name} (${p.sku})`);
      });
      
      // Check blocklist
      const { rows: blocklist } = await pool.query(`
        SELECT DISTINCT restaurant_id
        FROM supplier_blocklist
        WHERE supplier_id = $1
      `, [supplier[0].id]);
      
      console.log(`\n🚫 Blocked by ${blocklist.length} restaurants`);
      
      // Check restaurant
      const { rows: restaurants } = await pool.query(`
        SELECT id, name, contact_email
        FROM restaurant
        ORDER BY name
      `);
      
      console.log(`\n🏪 Restaurants (${restaurants.length}):`);
      restaurants.forEach(r => {
        console.log(`   - ${r.name} (${r.contact_email})`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

checkSupplier();
