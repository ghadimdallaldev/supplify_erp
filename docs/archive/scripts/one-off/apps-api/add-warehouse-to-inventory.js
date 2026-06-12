import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/supplify',
});

async function addWarehouseToInventory() {
  console.log('Adding warehouse support to inventory table...');

  try {
    // Add warehouse_id and reserved_qty columns if they don't exist
    await pool.query(`
      ALTER TABLE inventory ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouse(id) ON DELETE SET NULL;
      ALTER TABLE inventory ADD COLUMN IF NOT EXISTS reserved_qty NUMERIC(14,3) NOT NULL DEFAULT 0;
    `);
    console.log('✓ Added warehouse_id and reserved_qty columns to inventory table');

    // Now link existing inventory to warehouses
    const { rows: suppliers } = await pool.query(
      'SELECT id FROM supplier WHERE contact_email = $1',
      ['supplier@example.com']
    );

    if (suppliers.length === 0) {
      console.error('Supplier not found for supplier@example.com');
      process.exit(1);
    }

    const supplierId = suppliers[0].id;
    console.log(`Found supplier ID: ${supplierId}`);

    // Get warehouses
    const { rows: warehouses } = await pool.query(
      'SELECT id, name, code FROM warehouse WHERE supplier_id = $1 ORDER BY is_main DESC, name',
      [supplierId]
    );

    console.log(`Found ${warehouses.length} warehouses`);
    warehouses.forEach(w => console.log(`  - ${w.name} (${w.code}): ${w.id}`));

    // Get all products for this supplier
    const { rows: products } = await pool.query(
      'SELECT id, name, sku FROM product WHERE supplier_id = $1',
      [supplierId]
    );

    console.log(`\nFound ${products.length} products`);

    // Link each product's inventory to a warehouse (distribute across warehouses)
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const warehouseIndex = i % warehouses.length;
      const warehouse = warehouses[warehouseIndex];

      // Update inventory with warehouse_id
      const { rowCount } = await pool.query(
        'UPDATE inventory SET warehouse_id = $1 WHERE product_id = $2',
        [warehouse.id, product.id]
      );

      if (rowCount > 0) {
        console.log(`✓ Linked ${product.name} (${product.sku}) to ${warehouse.name}`);
      }
    }

    console.log('\nInventory linking completed successfully');
  } catch (error) {
    console.error('Error updating inventory:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

addWarehouseToInventory();
