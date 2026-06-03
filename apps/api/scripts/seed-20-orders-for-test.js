import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../.env') });

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/supplify',
});

async function seed() {
  const client = await pool.connect();
  try {
    const targetRestaurantName = process.env.TEST_RESTAURANT_NAME || 'Test Restaurant';
    const preferredSupplierNames = (process.env.TEST_SUPPLIER_NAMES || 'Example Supplier,Test Supplier').split(',').map(s => s.trim());

    console.log('🔎 Locating restaurant and supplier...');
    const { rows: restaurants } = await client.query(`SELECT id, name FROM restaurant WHERE name = $1 LIMIT 1`, [targetRestaurantName]);
    if (restaurants.length === 0) throw new Error(`Restaurant '${targetRestaurantName}' not found`);
    const restaurant = restaurants[0];

    let supplier = null;
    for (const name of preferredSupplierNames) {
      const { rows } = await client.query(`SELECT id, name FROM supplier WHERE name = $1 LIMIT 1`, [name]);
      if (rows.length) { supplier = rows[0]; break; }
    }
    if (!supplier) throw new Error(`None of suppliers found: ${preferredSupplierNames.join(', ')}`);

    console.log(`🏪 Restaurant: ${restaurant.name} (${restaurant.id})`);
    console.log(`🏭 Supplier: ${supplier.name} (${supplier.id})`);

    console.log('🧹 Deleting existing orders for this restaurant...');
    await client.query('BEGIN');
    // Collect order_ids for this restaurant to cascade delete related rows safely
    const { rows: orderIdsRows } = await client.query(`SELECT id FROM customer_order WHERE restaurant_id = $1`, [restaurant.id]);
    const orderIds = orderIdsRows.map(r => r.id);
    if (orderIds.length > 0) {
      await client.query(`DELETE FROM invoice_line_item WHERE invoice_id IN (SELECT id FROM invoice WHERE restaurant_id = $1)`, [restaurant.id]);
      await client.query(`DELETE FROM payment WHERE invoice_id IN (SELECT id FROM invoice WHERE restaurant_id = $1)`, [restaurant.id]);
      await client.query(`DELETE FROM invoice WHERE restaurant_id = $1`, [restaurant.id]);
      await client.query(`DELETE FROM receiving_line_item WHERE receiving_report_id IN (SELECT id FROM receiving_report WHERE restaurant_id = $1)`, [restaurant.id]);
      await client.query(`DELETE FROM receiving_report WHERE restaurant_id = $1`, [restaurant.id]);
      await client.query(`DELETE FROM order_item WHERE order_id = ANY($1::uuid[])`, [orderIds]);
      await client.query(`DELETE FROM customer_order WHERE id = ANY($1::uuid[])`, [orderIds]);
    }
    await client.query('COMMIT');
    console.log(`   ✓ Removed ${orderIds.length} orders`);

    console.log('🛒 Creating 20 PLACED orders from chosen supplier...');
    let created = 0;

    // Load supplier products with price and inventory
    const { rows: products } = await client.query(`
      SELECT p.id, p.name, p.sku, pr.amount as price
      FROM product p
      JOIN price pr ON pr.product_id = p.id AND (pr.valid_to IS NULL OR now() BETWEEN pr.valid_from AND pr.valid_to)
      JOIN inventory inv ON inv.product_id = p.id AND inv.available_qty > 0
      WHERE p.supplier_id = $1
      ORDER BY p.name
    `, [supplier.id]);
    if (products.length === 0) throw new Error('Supplier has no saleable products with inventory');

    for (let i = 0; i < 20; i++) {
      await client.query('BEGIN');
      try {
        const { rows: [order] } = await client.query(`
          INSERT INTO customer_order (restaurant_id, currency, status, placed_at)
          VALUES ($1, 'USD', 'PLACED', now())
          RETURNING *
        `, [restaurant.id]);

        const itemCount = 2 + Math.floor(Math.random() * 2);
        const chosen = products.slice().sort(() => Math.random() - 0.5).slice(0, Math.min(itemCount, products.length));
        let total = 0;

        for (const p of chosen) {
          const { rows: inv } = await client.query('SELECT available_qty FROM inventory WHERE product_id = $1 FOR UPDATE', [p.id]);
          const available = Number(inv[0]?.available_qty || 0);
          if (available <= 0) continue;
          const qty = Math.max(1, Math.min(available, Math.floor(Math.random() * 5) + 1));
          const unitPrice = Number(p.price);
          const lineTotal = unitPrice * qty;
          total += lineTotal;

          await client.query(`
            INSERT INTO order_item (order_id, product_id, supplier_id, quantity, unit_price, line_total)
            VALUES ($1, $2, $3, $4, $5, $6)
          `, [order.id, p.id, supplier.id, qty, unitPrice, lineTotal]);

          // Reserve inventory
          await client.query(`
            UPDATE inventory 
            SET available_qty = available_qty - $1,
                reserved_qty = reserved_qty + $1,
                updated_at = now()
            WHERE product_id = $2
          `, [qty, p.id]);
        }

        await client.query(`
          UPDATE customer_order 
          SET total_amount = $1
          WHERE id = $2
        `, [total, order.id]);

        await client.query('COMMIT');
        created++;
        console.log(`   ✓ ${created}/20 | $${total.toFixed(2)} | ${restaurant.name} ← ${supplier.name}`);
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('   ✗ Failed to create an order:', e.message);
      }
    }

    console.log(`\n✅ Done. Created ${created} orders for ${restaurant.name} from ${supplier.name}.`);
  } catch (e) {
    console.error('💥 Seed failed:', e.message);
    process.exit(1);
  } finally {
    // eslint-disable-next-line no-unsafe-finally
    await pool.end();
  }
}

seed();


