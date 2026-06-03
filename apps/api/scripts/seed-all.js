import { query } from '../src/lib/db.js';
import { logger } from '../src/lib/logger.js';

async function seedAll() {
  logger.info('Starting complete database seeding...');

  try {
    // Check and create suppliers
    const { rows: existingSuppliers } = await query('SELECT * FROM supplier');
    
    if (existingSuppliers.length < 2) {
      logger.info('Creating suppliers...');
      
      const supplier1 = await query(`
        INSERT INTO supplier (name, slug, contact_email, phone, address_json, created_at, updated_at)
        VALUES ('Fresh Foods Supply', 'fresh-foods-supply', 'fresh@example.com', '+1-555-0101', '{"street": "123 Food St", "city": "New York", "state": "NY", "zip": "10001"}', now(), now())
        RETURNING *
      `);
      
      const supplier2 = await query(`
        INSERT INTO supplier (name, slug, contact_email, phone, address_json, created_at, updated_at)
        VALUES ('Global Grocery Co', 'global-grocery-co', 'global@example.com', '+1-555-0202', '{"street": "456 Market Ave", "city": "Los Angeles", "state": "CA", "zip": "90001"}', now(), now())
        RETURNING *
      `);
      
      logger.info('Created 2 suppliers');
    } else {
      logger.info(`Found ${existingSuppliers.length} existing suppliers`);
    }

    // Get suppliers
    const { rows: suppliers } = await query('SELECT * FROM supplier LIMIT 2');

    // Check and create products
    const { rows: existingProducts } = await query('SELECT * FROM product');
    
    if (existingProducts.length < 10) {
      logger.info('Creating products...');
      
      const products = [
        { name: 'Organic Tomatoes', sku: 'TOM-001', category: 'Vegetables', supplier: 0 },
        { name: 'Fresh Lettuce', sku: 'LET-001', category: 'Vegetables', supplier: 0 },
        { name: 'Organic Carrots', sku: 'CAR-001', category: 'Vegetables', supplier: 0 },
        { name: 'Premium Rice', sku: 'RIC-001', category: 'Grains', supplier: 0 },
        { name: 'Extra Virgin Olive Oil', sku: 'OIL-001', category: 'Oils', supplier: 0 },
        { name: 'Chicken Breast', sku: 'CHK-001', category: 'Meat', supplier: 1 },
        { name: 'Fresh Salmon', sku: 'SLM-001', category: 'Seafood', supplier: 1 },
        { name: 'Ground Beef', sku: 'BEEF-001', category: 'Meat', supplier: 1 },
        { name: 'Premium Pasta', sku: 'PST-001', category: 'Grains', supplier: 1 },
        { name: 'Fresh Milk', sku: 'MLK-001', category: 'Dairy', supplier: 1 },
      ];
      
      for (const product of products) {
        await query(`
          INSERT INTO product (name, sku, category, supplier_id, created_at, updated_at)
          VALUES ($1, $2, $3, $4, now(), now())
        `, [product.name, product.sku, product.category, suppliers[product.supplier].id]);
      }
      
      logger.info('Created 10 products');
    } else {
      logger.info(`Found ${existingProducts.length} existing products`);
    }

    // Get products
    const { rows: products } = await query('SELECT * FROM product');
    
    // Update product supplier_id to distribute products between suppliers
    for (let i = 0; i < products.length; i++) {
      const supplierIdx = i < 5 ? 0 : 1;
      await query('UPDATE product SET supplier_id = $1 WHERE id = $2', [suppliers[supplierIdx].id, products[i].id]);
      products[i].supplier_id = suppliers[supplierIdx].id;
    }

    // Check and create a restaurant
    const { rows: existingRestaurants } = await query('SELECT * FROM restaurant');
    
    if (existingRestaurants.length === 0) {
      logger.info('Creating restaurant...');
      
      // First, create a user
      const user = await query(`
        INSERT INTO app_user (email, role, created_at, updated_at)
        VALUES ('restaurant@example.com', 'RESTAURANT', now(), now())
        RETURNING *
      `);
      
      const restaurant = await query(`
        INSERT INTO restaurant (name, contact_email, phone, address_json, created_at, updated_at)
        VALUES ('Test Restaurant', 'restaurant@example.com', '+1-555-0303', '{"street": "789 Main St", "city": "Chicago", "state": "IL", "zip": "60601"}', now(), now())
        RETURNING *
      `);
      
      logger.info('Created restaurant');
    } else {
      logger.info(`Found ${existingRestaurants.length} existing restaurants`);
    }

    // Get restaurant
    const { rows: restaurants } = await query('SELECT * FROM restaurant');
    
    if (restaurants.length === 0) {
      logger.error('No restaurant found');
      process.exit(1);
    }

    const restaurant = restaurants[0];

    // Create 10 orders with different statuses
    logger.info('Creating orders...');
    
    const statuses = ['PLACED', 'ACKNOWLEDGED', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED'];
    const numOrders = 10;
    
    // Reset balance fields
    logger.info('Updating all products with supplier IDs...');
    
    for (let i = 0; i < numOrders; i++) {
      const status = statuses[i % statuses.length];
      const supplierIdx = i < 5 ? 0 : 1; // Alternate between suppliers
      const supplier = suppliers[supplierIdx];
      
      const { rows: order } = await query(`
        INSERT INTO customer_order (restaurant_id, status, total_amount, currency, placed_at, created_at)
        VALUES ($1, $2, 0, 'USD', now(), now())
        RETURNING *
      `, [restaurant.id, status]);

      logger.info(`Created order ${order[0].id} for supplier ${supplier.name} with status ${status}`);

      // Add 2-3 random products to this order
      const numItems = 2 + Math.floor(Math.random() * 2);
      let totalAmount = 0;

      for (let j = 0; j < numItems; j++) {
        // Select products from any supplier (products table has supplier_id)
        const supplierProducts = products;
        if (supplierProducts.length === 0) continue;
        
        const randomProduct = supplierProducts[Math.floor(Math.random() * supplierProducts.length)];
        const quantity = 1 + Math.floor(Math.random() * 10);
        const unitPrice = Math.random() * 50 + 10;
        const lineTotal = quantity * unitPrice;
        totalAmount += lineTotal;

        await query(`
          INSERT INTO order_item (order_id, product_id, supplier_id, quantity, unit_price, line_total)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [order[0].id, randomProduct.id, randomProduct.supplier_id, quantity, unitPrice, lineTotal]);

        // If order is completed, add products to restaurant inventory
        if (status === 'COMPLETED') {
          try {
            const { rows: existingInventory } = await query(`
              SELECT * FROM restaurant_inventory 
              WHERE restaurant_id = $1 AND product_id = $2
            `, [restaurant.id, randomProduct.id]);

            const balanceBefore = existingInventory.length > 0 ? parseFloat(existingInventory[0].current_qty || 0) : 0;
            const balanceAfter = balanceBefore + quantity;

            if (existingInventory.length > 0) {
              await query(`
                UPDATE restaurant_inventory 
                SET current_qty = $1,
                    last_receipt_at = now(),
                    updated_at = now()
                WHERE id = $2
              `, [balanceAfter, existingInventory[0].id]);
            } else {
              await query(`
                INSERT INTO restaurant_inventory (
                  restaurant_id, product_id, current_qty, last_receipt_at
                )
                VALUES ($1, $2, $3, now())
              `, [restaurant.id, randomProduct.id, balanceAfter]);
            }

            await query(`
              INSERT INTO inventory_movement_log (
                restaurant_id, product_id, type, quantity, balance_before, balance_after, reason, reference_id, reference_type
              )
              VALUES ($1, $2, 'RECEIVED', $3, $4, $5, $6, $7, 'ORDER')
            `, [restaurant.id, randomProduct.id, quantity, balanceBefore, balanceAfter, 'Order received', order[0].id]);
          } catch (invError) {
            logger.error('Error adding to inventory:', invError.message);
            // Continue even if inventory update fails
          }
        }
      }

      // Update order total
      await query(`
        UPDATE customer_order 
        SET total_amount = $1, updated_at = now()
        WHERE id = $2
      `, [totalAmount, order[0].id]);

      logger.info(`Added ${numItems} items to order ${order[0].id} (total: $${totalAmount.toFixed(2)})`);
    }

    logger.info('Successfully created 10 orders');
    logger.info('Complete database seeding completed successfully');
    
    process.exit(0);
  } catch (error) {
    logger.error('Error seeding database:', error);
    logger.error('Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      hint: error.hint,
      position: error.position,
    });
    logger.error('Stack:', error.stack);
    process.exit(1);
  }
}

seedAll();

