import { pool } from '../src/lib/db.js';

async function applyEnumFix() {
  try {
    console.log('Applying enum fix...');
    
    // Step 1: Convert to TEXT
    await pool.query(`ALTER TABLE customer_order ALTER COLUMN status TYPE TEXT USING status::TEXT`);
    console.log('✓ Converted to TEXT');
    
    // Step 2: Update existing values
    await pool.query(`UPDATE customer_order SET status = 'COMPLETED' WHERE status = 'FULFILLING'`);
    console.log('✓ Updated FULFILLING to COMPLETED');
    
    await pool.query(`UPDATE customer_order SET status = 'ACKNOWLEDGED' WHERE status = 'CONFIRMED'`);
    console.log('✓ Updated CONFIRMED to ACKNOWLEDGED');
    
    // Step 3: Drop old enum (with CASCADE to drop dependent objects)
    await pool.query(`DROP TYPE IF EXISTS order_status CASCADE`);
    console.log('✓ Dropped old enum');
    
    // Step 4: Create new enum
    await pool.query(`
      CREATE TYPE order_status AS ENUM ('DRAFT', 'PLACED', 'ACKNOWLEDGED', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED')
    `);
    console.log('✓ Created new enum');
    
    // Step 5: Convert back to enum
    await pool.query(`ALTER TABLE customer_order ALTER COLUMN status TYPE order_status USING status::order_status`);
    console.log('✓ Converted back to enum');
    
    await pool.end();
    console.log('✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

applyEnumFix();

