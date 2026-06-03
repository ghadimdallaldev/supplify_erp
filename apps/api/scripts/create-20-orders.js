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

async function createTwentyOrders() {
  const client = await pool.connect();
  try {
    console.log('🛒 Creating 20 test orders (PLACED)...');

    // Fetch one restaurant (the one linked to your logged-in demo user typically)
    const { rows: restaurants } = await client.query(`
      SELECT id, name FROM restaurant LIMIT 1
    `);
    if (restaurants.length === 0) throw new Error('No restaurant found');
    const restaurant = restaurants[0];

    // Fetch suppliers and products with valid prices and inventory
    const { rows: products } = await client.query(`
      SELECT p.id, p.supplier_id, p.name, p.sku, pr.amount as price
      FROM product p
      JOIN price pr ON pr.product_id = p.id 
        AND (pr.valid_to IS NULL OR now() BETWEEN pr.valid_from AND pr.valid_to)
      JOIN inventory inv ON inv.product_id = p.id AND inv.available_qty > 0
      ORDER BY p.supplier_id, p.name
    `);
    if (products.length === 0) throw new Error('No products with price and available inventory');

    // Group products by supplier
    const bySupplier = new Map();
    for (const p of products) {
      if (!bySupplier.has(p.supplier_id)) bySupplier.set(p.supplier_id, []);
      bySupplier.get(p.supplier_id).push(p);
    }

    let created = 0;
    for (let i = 0; i < 20; i++) {
      await client.query('BEGIN');
      try {
        // Pick a supplier with products
        const supplierIds = Array.from(bySupplier.keys());
        const supplierId = supplierIds[Math.floor(Math.random() * supplierIds.length)];
        const supplierProducts = bySupplier.get(supplierId);
        if (!supplierProducts || supplierProducts.length === 0) {
          await client.query('ROLLBACK');
          continue;
        }

        // Create order
        const { rows: [order] } = await client.query(`
          INSERT INTO customer_order (restaurant_id, currency, status, placed_at)
          VALUES ($1, 'USD', 'PLACED', now())
          RETURNING *
        `, [restaurant.id]);

        // Choose 2-3 items
        const itemCount = 2 + Math.floor(Math.random() * 2);
        const chosen = supplierProducts.slice().sort(() => Math.random() - 0.5).slice(0, Math.min(itemCount, supplierProducts.length));

        let total = 0;
        for (const p of chosen) {
          // Ensure inventory is available
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
          `, [order.id, p.id, supplierId, qty, unitPrice, lineTotal]);

          // Reserve inventory for placed order
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
        console.log(`   ✓ Created order ${created}/20 → ${restaurant.name.slice(0,20)} | $${total.toFixed(2)}`);
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('   ✗ Failed to create one order:', e.message);
      }
    }

    console.log(`\n✅ Done. Created ${created} orders.`);
  } finally {
    client.release();
    await pool.end();
  }
}

createTwentyOrders().catch((e) => {
  console.error('💥 Script failed:', e);
  process.exit(1);
});


