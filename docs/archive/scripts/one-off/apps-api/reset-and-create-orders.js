import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../../.env') });

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/supplify',
});

async function resetAndCreateOrders() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('🗑️  Deleting all existing orders...');
    
    // Delete invoices first (due to foreign key)
    const invoiceResult = await client.query(`
      DELETE FROM invoice_line_item;
      DELETE FROM invoice;
      DELETE FROM invoice_sequence;
    `);
    console.log(`   Deleted all invoices and invoice sequences`);
    
    // Delete receiving reports
    const receivingResult = await client.query(`
      DELETE FROM receiving_line_item;
      DELETE FROM receiving_report;
    `);
    console.log(`   Deleted all receiving reports`);
    
    // Delete order items
    const orderItemsResult = await client.query(`
      DELETE FROM order_item;
    `);
    console.log(`   Deleted all order items`);
    
    // Delete orders
    const ordersResult = await client.query(`
      DELETE FROM customer_order;
    `);
    console.log(`   Deleted all orders`);
    
    // Reset usage meters
    await client.query(`
      DELETE FROM usage_meter WHERE meter_type = 'orders_per_day';
    `);
    console.log(`   Reset orders_per_day usage meters`);
    
    console.log('\n📦 Getting restaurants, suppliers, and products...');
    
    // Get restaurants
    const { rows: restaurants } = await client.query(`
      SELECT id, name FROM restaurant LIMIT 10
    `);
    
    // Get suppliers
    const { rows: suppliers } = await client.query(`
      SELECT id, name FROM supplier LIMIT 5
    `);
    
    // Get products with prices for each supplier
    const { rows: allProducts } = await client.query(`
      SELECT p.id, p.supplier_id, p.name, p.sku, pr.amount as price
      FROM product p
      LEFT JOIN price pr ON pr.product_id = p.id 
        AND (pr.valid_to IS NULL OR now() BETWEEN pr.valid_from AND pr.valid_to)
      WHERE pr.amount IS NOT NULL
      ORDER BY p.supplier_id, p.name
    `);
    
    // Group products by supplier
    const productsBySupplier = {};
    allProducts.forEach(product => {
      if (!productsBySupplier[product.supplier_id]) {
        productsBySupplier[product.supplier_id] = [];
      }
      productsBySupplier[product.supplier_id].push(product);
    });
    
    console.log(`   Found ${restaurants.length} restaurants, ${suppliers.length} suppliers`);
    console.log(`   Found ${allProducts.length} products with prices\n`);
    
    if (restaurants.length === 0 || suppliers.length === 0 || allProducts.length === 0) {
      throw new Error('Need at least 1 restaurant, 1 supplier, and products with prices');
    }
    
    // Order statuses with distribution
    const statuses = [
      'PLACED', 'PLACED', 'PLACED', // 30% placed
      'ACKNOWLEDGED', 'ACKNOWLEDGED', // 20% acknowledged
      'PROCESSING', 'PROCESSING', // 20% processing
      'SHIPPED', 'SHIPPED', // 20% shipped
      'COMPLETED', // 10% completed
    ];
    
    console.log('🛒 Creating 50 orders with invoices...\n');
    
    const createdOrders = [];
    const ordersPerRestaurant = Math.ceil(50 / restaurants.length);
    
    // Track invoice sequences per supplier to avoid duplicates
    // Initialize map with existing invoice numbers
    const supplierInvoiceSequences = new Map();
    const { rows: existingInvoices } = await client.query(`
      SELECT supplier_id, invoice_number
      FROM invoice
      WHERE invoice_number LIKE 'INV-%'
    `);
    
    existingInvoices.forEach(inv => {
      const match = inv.invoice_number.match(/INV-(\d{4})-(\d{2})-(\d+)/);
      if (match) {
        const year = parseInt(match[1]);
        const month = parseInt(match[2]);
        const num = parseInt(match[3]);
        const key = `${inv.supplier_id}-${year}-${month}`;
        const currentMax = supplierInvoiceSequences.get(key) || 0;
        supplierInvoiceSequences.set(key, Math.max(currentMax, num));
      }
    });
    
    for (let i = 0; i < 50; i++) {
      const restaurant = restaurants[i % restaurants.length];
      const status = statuses[i % statuses.length];
      
      // Pick a random supplier that has products
      const availableSuppliers = suppliers.filter(s => 
        productsBySupplier[s.id] && productsBySupplier[s.id].length > 0
      );
      
      if (availableSuppliers.length === 0) continue;
      
      const supplier = availableSuppliers[Math.floor(Math.random() * availableSuppliers.length)];
      const supplierProducts = productsBySupplier[supplier.id];
      
      // Create order
      const orderResult = await client.query(`
        INSERT INTO customer_order (restaurant_id, currency, status, total_amount, placed_at, created_at, updated_at)
        VALUES ($1, 'USD', $2::order_status, 0, 
          CASE WHEN $2::text = 'PLACED' THEN now() - (random() * INTERVAL '7 days') ELSE NULL END,
          now() - (random() * INTERVAL '30 days'),
          now())
        RETURNING *
      `, [restaurant.id, status]);
      
      const order = orderResult.rows[0];
      
      // Select 1-5 random products from this supplier
      const numItems = Math.floor(Math.random() * 5) + 1;
      const selectedProducts = supplierProducts
        .sort(() => Math.random() - 0.5)
        .slice(0, Math.min(numItems, supplierProducts.length));
      
      let totalAmount = 0;
      const orderItems = [];
      
      // Create order items
      for (const product of selectedProducts) {
        const quantity = Math.floor(Math.random() * 10) + 1;
        const unitPrice = parseFloat(product.price || 0);
        const lineTotal = unitPrice * quantity;
        totalAmount += lineTotal;
        
        const itemResult = await client.query(`
          INSERT INTO order_item (order_id, product_id, supplier_id, quantity, unit_price, line_total)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `, [order.id, product.id, supplier.id, quantity, unitPrice, lineTotal]);
        
        orderItems.push({
          ...itemResult.rows[0],
          product_name: product.name,
          product_sku: product.sku,
        });
      }
      
      // Update order total
      await client.query(`
        UPDATE customer_order 
        SET total_amount = $1, updated_at = now()
        WHERE id = $2
      `, [totalAmount, order.id]);
      
      order.total_amount = totalAmount;
      
      // Create invoice for COMPLETED orders
      if (status === 'COMPLETED') {
        // Get supplier tax config or use defaults
        let taxRate = 0;
        let paymentTermsDays = 30;
        
        try {
          const { rows: taxConfig } = await client.query(`
            SELECT tax_rate
            FROM tax_config
            WHERE supplier_id = $1 AND is_active = true
            LIMIT 1
          `, [supplier.id]);
          
          if (taxConfig.length > 0) {
            taxRate = parseFloat(taxConfig[0]?.tax_rate || 0);
          }
        } catch (e) {
          // Use defaults if tax_config doesn't exist or has issues
          taxRate = 0;
          paymentTermsDays = 30;
        }
        
        // Generate invoice number - use atomic increment on invoice_sequence table
        // Since invoice_number is globally unique, we need to ensure uniqueness
        const year = new Date().getFullYear();
        const month = String(new Date().getMonth() + 1).padStart(2, '0');
        
        let invoiceNumber;
        let attempts = 0;
        const maxAttempts = 100;
        
        while (attempts < maxAttempts) {
          // Atomically increment the sequence and get the new number
          const { rows: seqRows } = await client.query(`
            INSERT INTO invoice_sequence (supplier_id, year, month, current_number)
            VALUES ($1, $2, $3, 1)
            ON CONFLICT (supplier_id, year, month)
            DO UPDATE SET current_number = invoice_sequence.current_number + 1
            RETURNING current_number
          `, [supplier.id, year, month]);
          
          const sequenceNum = parseInt(seqRows[0].current_number);
          invoiceNumber = `INV-${year}-${month}-${String(sequenceNum).padStart(6, '0')}`;
          
          // Check if this invoice number already exists (globally)
          const { rows: existing } = await client.query(`
            SELECT 1 FROM invoice WHERE invoice_number = $1 LIMIT 1
          `, [invoiceNumber]);
          
          if (existing.length === 0) {
            // Invoice number is unique, we can use it
            break;
          }
          
          // If exists, increment sequence and try again
          attempts++;
        }
        
        if (attempts >= maxAttempts) {
          throw new Error(`Could not generate unique invoice number after ${maxAttempts} attempts`);
        }
        
        const invoiceDate = new Date();
        const issueDate = new Date();
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + paymentTermsDays);
        
        const subtotal = totalAmount;
        const taxAmount = (subtotal * taxRate) / 100;
        const totalInvoiceAmount = subtotal + taxAmount;
        
        // Create invoice
        const invoiceResult = await client.query(`
          INSERT INTO invoice (
            invoice_number, supplier_id, restaurant_id, order_id,
            invoice_date, issue_date, due_date,
            subtotal, tax_amount, tax_rate, tax_included, total_amount,
            balance_due, paid_amount,
            status, currency,
            payment_terms_days,
            notes, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, now(), now())
          RETURNING *
        `, [
          invoiceNumber,
          supplier.id,
          restaurant.id,
          order.id,
          invoiceDate,
          issueDate,
          dueDate,
          subtotal,
          taxAmount,
          taxRate,
          false,
          totalInvoiceAmount,
          totalInvoiceAmount,
          0,
          'ISSUED',
          'USD',
          paymentTermsDays,
          `Invoice for Order #${order.id.slice(0, 8)}`,
        ]);
        
        const invoice = invoiceResult.rows[0];
        
        // Create invoice line items
        for (const item of orderItems) {
          await client.query(`
            INSERT INTO invoice_line_item (
              invoice_id, product_id, description, sku,
              quantity, unit_price, line_total,
              tax_rate, tax_amount,
              order_item_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          `, [
            invoice.id,
            item.product_id,
            item.product_name || 'Product',
            item.product_sku || 'N/A',
            item.quantity,
            item.unit_price,
            item.line_total,
            taxRate,
            (item.line_total * taxRate) / 100,
            item.id,
          ]);
        }
        
        console.log(`   ✓ Order ${i + 1}/50: ${restaurant.name.slice(0, 20)} → ${supplier.name.slice(0, 20)} | $${totalAmount.toFixed(2)} | ${status} | Invoice: ${invoiceNumber}`);
      } else {
        console.log(`   ✓ Order ${i + 1}/50: ${restaurant.name.slice(0, 20)} → ${supplier.name.slice(0, 20)} | $${totalAmount.toFixed(2)} | ${status}`);
      }
      
      createdOrders.push({ order, items: orderItems, status });
    }
    
    await client.query('COMMIT');
    
    console.log(`\n✅ Successfully created ${createdOrders.length} orders!`);
    console.log(`   - PLACED: ${createdOrders.filter(o => o.status === 'PLACED').length}`);
    console.log(`   - ACKNOWLEDGED: ${createdOrders.filter(o => o.status === 'ACKNOWLEDGED').length}`);
    console.log(`   - PROCESSING: ${createdOrders.filter(o => o.status === 'PROCESSING').length}`);
    console.log(`   - SHIPPED: ${createdOrders.filter(o => o.status === 'SHIPPED').length}`);
    console.log(`   - COMPLETED (with invoices): ${createdOrders.filter(o => o.status === 'COMPLETED').length}`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

resetAndCreateOrders()
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Failed:', error);
    process.exit(1);
  });

