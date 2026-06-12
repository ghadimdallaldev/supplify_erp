import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/supplify',
});

async function linkInventoryToWarehouses() {
  console.log('Linking inventory to warehouses...');

  try {
    // Get supplier ID
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

    // Link each product to a warehouse (distribute across warehouses)
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const warehouseIndex = i % warehouses.length;
      const warehouse = warehouses[warehouseIndex];

      // First, check if inventory record exists
      const { rows: inventoryExists } = await pool.query(
        'SELECT id FROM inventory WHERE product_id = $1',
        [product.id]
      );

      if (inventoryExists.length > 0) {
        // Update existing inventory with warehouse_id
        await pool.query(
          'UPDATE inventory SET warehouse_id = $1 WHERE product_id = $2',
          [warehouse.id, product.id]
        );
        console.log(`✓ Linked ${product.name} (${product.sku}) to ${warehouse.name}`);
      } else {
        // Create inventory record with warehouse
        const availableQty = Math.floor(Math.random() * 200) + 50;
        const reservedQty = Math.floor(Math.random() * 100) + 10;

        await pool.query(
          `INSERT INTO inventory (product_id, warehouse_id, available_qty, reserved_qty, updated_at)
           VALUES ($1, $2, $3, $4, NOW())`,
          [product.id, warehouse.id, availableQty, reservedQty]
        );
        console.log(`✓ Created inventory for ${product.name} (${product.sku}) at ${warehouse.name}`);
      }
    }

    console.log('\nInventory linking completed successfully');
  } catch (error) {
    console.error('Error linking inventory to warehouses:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

linkInventoryToWarehouses();
