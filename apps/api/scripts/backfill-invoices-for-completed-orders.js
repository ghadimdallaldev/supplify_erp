import { pool } from '../src/lib/db.js';

async function main() {
  const client = await pool.connect();
  try {
    console.log('Scanning for COMPLETED orders without invoices...');
    const { rows: orders } = await client.query(`
      SELECT o.id, o.restaurant_id, o.currency
      FROM customer_order o
      WHERE o.status = 'COMPLETED'
        AND NOT EXISTS (SELECT 1 FROM invoice i WHERE i.order_id = o.id)
      ORDER BY o.created_at DESC
      LIMIT 200
    `);

    console.log(`Found ${orders.length} orders to backfill`);

    for (const o of orders) {
      await client.query('BEGIN');
      try {
        const { rows: items } = await client.query(`
          SELECT oi.*, p.supplier_id, p.name as product_name, p.sku
          FROM order_item oi
          JOIN product p ON p.id = oi.product_id
          WHERE oi.order_id = $1
        `, [o.id]);

        if (items.length === 0) { await client.query('ROLLBACK'); continue; }
        const supplierId = items[0].supplier_id;

        // Generate invoice number fallback
        const now = new Date();
        const invoiceNumber = `INV-${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(Date.now()).slice(-6)}`;

        let subtotal = 0;
        for (const it of items) subtotal += Number(it.unit_price) * Number(it.quantity);
        const taxRate = 0;
        const taxAmount = subtotal * taxRate / 100;
        const totalAmount = subtotal + taxAmount;

        const { rows: invRows } = await client.query(`
          INSERT INTO invoice (
            invoice_number, supplier_id, restaurant_id, order_id,
            invoice_date, issue_date, due_date,
            subtotal, tax_amount, tax_rate, tax_included, total_amount,
            balance_due, paid_amount, status, currency, payment_terms_days, notes
          ) VALUES ($1,$2,$3,$4, now(), now(), now() + interval '30 days',
            $5,$6,$7,false,$8,
            $8,0,'ISSUED',$9,30,$10)
          ON CONFLICT DO NOTHING
          RETURNING *
        `, [
          invoiceNumber,
          supplierId,
          o.restaurant_id,
          o.id,
          subtotal,
          taxAmount,
          taxRate,
          totalAmount,
          o.currency || 'USD',
          `Backfilled invoice for order ${o.id}`,
        ]);

        const inv = invRows[0];
        if (inv) {
          for (const it of items) {
            const lineTotal = Number(it.unit_price) * Number(it.quantity);
            await client.query(`
              INSERT INTO invoice_line_item (
                invoice_id, product_id, description, sku,
                quantity, unit_price, line_total, tax_rate, tax_amount, order_item_id
              ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            `, [
              inv.id, it.product_id, it.product_name, it.sku,
              it.quantity, it.unit_price, lineTotal, taxRate, 0, it.id,
            ]);
          }
          console.log(`✓ Created invoice ${inv.invoice_number} for order ${o.id}`);
        } else {
          console.log(`• Invoice already exists for order ${o.id}`);
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        console.error(`✗ Failed to backfill order ${o.id}:`, e.message);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });


