import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/supplify'
});

async function seedInventory() {
  try {
    console.log('Seeding inventory data...');

    // Get the supplier ID
    const { rows: suppliers } = await pool.query(
      "SELECT id FROM supplier WHERE contact_email = 'supplier@example.com'"
    );

    if (suppliers.length === 0) {
      console.error('No supplier found');
      process.exit(1);
    }

    const supplierId = suppliers[0].id;

    // Get products for this supplier
    const { rows: products } = await pool.query(
      'SELECT id, name, sku FROM product WHERE supplier_id = $1',
      [supplierId]
    );

    if (products.length === 0) {
      console.error('No products found for supplier');
      process.exit(1);
    }

    console.log(`Found ${products.length} products`);

    // Seed inventory with random quantities
    for (const product of products) {
      const availableQty = Math.floor(Math.random() * 500) + 10;
      const reservedQty = Math.floor(Math.random() * 100);

      // Update or insert inventory
      await pool.query(
        `INSERT INTO inventory (product_id, available_qty, reserved_qty, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (product_id) 
         DO UPDATE SET 
           available_qty = EXCLUDED.available_qty,
           reserved_qty = EXCLUDED.reserved_qty,
           updated_at = now()`,
        [product.id, availableQty, reservedQty]
      );

      console.log(`Updated inventory for ${product.name}: ${availableQty} available, ${reservedQty} reserved`);
    }

    console.log('Inventory seeding completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding inventory:', error);
    process.exit(1);
  }
}

seedInventory();

