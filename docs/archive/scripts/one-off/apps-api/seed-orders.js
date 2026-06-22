import { query } from '../src/lib/db.js';
import { logger } from '../src/lib/logger.js';

async function seedOrders() {
  logger.info('Starting order seeding...');

  try {
    // Get all suppliers
    const { rows: suppliers } = await query('SELECT * FROM supplier LIMIT 2');
    
    if (suppliers.length < 2) {
      logger.error('Need at least 2 suppliers in the database');
      process.exit(1);
    }

    logger.info(`Found ${suppliers.length} suppliers`);

    // Get all restaurants
    const { rows: restaurants } = await query('SELECT * FROM restaurant');
    
    if (restaurants.length === 0) {
      logger.error('No restaurants found in the database');
      process.exit(1);
    }

    logger.info(`Found ${restaurants.length} restaurants`);

    // Get all products
    const { rows: products } = await query('SELECT * FROM product');
    
    if (products.length === 0) {
      logger.error('No products found in the database');
      process.exit(1);
    }

    logger.info(`Found ${products.length} products`);

    // Assign products to suppliers (distribute products between the 2 suppliers)
    const supplier1Products = products.slice(0, Math.floor(products.length / 2));
    const supplier2Products = products.slice(Math.floor(products.length / 2));
    
    supplier1Products.forEach(product => {
      product.supplierId = suppliers[0].id;
    });
    
    supplier2Products.forEach(product => {
      product.supplierId = suppliers[1].id;
    });

    // Create 10 orders with different statuses
    const statuses = ['PLACED', 'ACKNOWLEDGED', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED'];
    const numOrdersPerSupplier = 5;
    
    for (let i = 0; i < numOrdersPerSupplier; i++) {
      // Order for supplier 1
      const orderStatus1 = statuses[i % statuses.length];
      const restaurant1 = restaurants[Math.floor(Math.random() * restaurants.length)];
      const supplier1 = suppliers[0];
      
      const { rows: order1 } = await query(`
        INSERT INTO customer_order (restaurant_id, status, total_amount, currency, placed_at, created_at)
        VALUES ($1, $2, 0, 'USD', now(), now())
        RETURNING *
      `, [restaurant1.id, orderStatus1]);

      logger.info(`Created order ${order1[0].id} for supplier ${supplier1.name} with status ${orderStatus1}`);

      // Add 2-3 random products to this order
      const numItems = 2 + Math.floor(Math.random() * 2);
      let totalAmount = 0;

      for (let j = 0; j < numItems; j++) {
        const randomProduct = supplier1Products[Math.floor(Math.random() * supplier1Products.length)];
        const quantity = 1 + Math.floor(Math.random() * 10);
        const unitPrice = Math.random() * 50 + 10; // Random price between 10 and 60
        const lineTotal = quantity * unitPrice;
        totalAmount += lineTotal;

        await query(`
          INSERT INTO order_item (order_id, product_id, supplier_id, quantity, unit_price, line_total)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [order1[0].id, randomProduct.id, supplier1.id, quantity, unitPrice, lineTotal]);

        // If order is completed, add products to restaurant inventory
        if (orderStatus1 === 'COMPLETED') {
          const { rows: existingInventory } = await query(`
            SELECT * FROM restaurant_inventory 
            WHERE restaurant_id = $1 AND product_id = $2
          `, [restaurant1.id, randomProduct.id]);

          if (existingInventory.length > 0) {
            // Update existing inventory
            await query(`
              UPDATE restaurant_inventory 
              SET current_qty = current_qty + $1,
                  last_receipt_at = now(),
                  updated_at = now()
              WHERE id = $2
            `, [quantity, existingInventory[0].id]);
          } else {
            // Create new inventory entry
            await query(`
              INSERT INTO restaurant_inventory (
                restaurant_id, product_id, current_qty, last_receipt_at
              )
              VALUES ($1, $2, $3, now())
            `, [restaurant1.id, randomProduct.id, quantity]);
          }

          // Add inventory movement log
          await query(`
            INSERT INTO inventory_movement_log (
              restaurant_id, product_id, quantity, movement_type, reason, notes
            )
            VALUES ($1, $2, $3, 'RECEIPT', 'Order received', $4)
          `, [restaurant1.id, randomProduct.id, quantity, `Received from order ${order1[0].id}`]);
        }
      }

      // Update order total
      await query(`
        UPDATE customer_order 
        SET total_amount = $1, updated_at = now()
        WHERE id = $2
      `, [totalAmount, order1[0].id]);

      logger.info(`Added ${numItems} items to order ${order1[0].id} (total: $${totalAmount.toFixed(2)})`);

      // Order for supplier 2
      const orderStatus2 = statuses[(i + 3) % statuses.length];
      const restaurant2 = restaurants[Math.floor(Math.random() * restaurants.length)];
      const supplier2 = suppliers[1];
      
      const { rows: order2 } = await query(`
        INSERT INTO customer_order (restaurant_id, status, total_amount, currency, placed_at, created_at)
        VALUES ($1, $2, 0, 'USD', now(), now())
        RETURNING *
      `, [restaurant2.id, orderStatus2]);

      logger.info(`Created order ${order2[0].id} for supplier ${supplier2.name} with status ${orderStatus2}`);

      totalAmount = 0;
      const numItems2 = 2 + Math.floor(Math.random() * 2);

      for (let j = 0; j < numItems2; j++) {
        const randomProduct2 = supplier2Products[Math.floor(Math.random() * supplier2Products.length)];
        const quantity = 1 + Math.floor(Math.random() * 10);
        const unitPrice = Math.random() * 50 + 10;
        const lineTotal = quantity * unitPrice;
        totalAmount += lineTotal;

        await query(`
          INSERT INTO order_item (order_id, product_id, supplier_id, quantity, unit_price, line_total)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [order2[0].id, randomProduct2.id, supplier2.id, quantity, unitPrice, lineTotal]);

        // If order is completed, add products to restaurant inventory
        if (orderStatus2 === 'COMPLETED') {
          const { rows: existingInventory } = await query(`
            SELECT * FROM restaurant_inventory 
            WHERE restaurant_id = $1 AND product_id = $2
          `, [restaurant2.id, randomProduct2.id]);

          if (existingInventory.length > 0) {
            await query(`
              UPDATE restaurant_inventory 
              SET current_qty = current_qty + $1,
                  last_receipt_at = now(),
                  updated_at = now()
              WHERE id = $2
            `, [quantity, existingInventory[0].id]);
          } else {
            await query(`
              INSERT INTO restaurant_inventory (
                restaurant_id, product_id, current_qty, last_receipt_at
              )
              VALUES ($1, $2, $3, now())
            `, [restaurant2.id, randomProduct2.id, quantity]);
          }

          await query(`
            INSERT INTO inventory_movement_log (
              restaurant_id, product_id, quantity, movement_type, reason, notes
            )
            VALUES ($1, $2, $3, 'RECEIPT', 'Order received', $4)
          `, [restaurant2.id, randomProduct2.id, quantity, `Received from order ${order2[0].id}`]);
        }
      }

      await query(`
        UPDATE customer_order 
        SET total_amount = $1, updated_at = now()
        WHERE id = $2
      `, [totalAmount, order2[0].id]);

      logger.info(`Added ${numItems2} items to order ${order2[0].id} (total: $${totalAmount.toFixed(2)})`);
    }

    logger.info('Successfully created 10 orders');
    
    // Add some initial inventory to restaurants (50 units each)
    logger.info('Adding initial inventory to restaurants...');
    
    for (const restaurant of restaurants) {
      for (const product of products) {
        const randomQty = 20 + Math.floor(Math.random() * 60); // 20-80 units
        
        const { rows: existingInventory } = await query(`
          SELECT * FROM restaurant_inventory 
          WHERE restaurant_id = $1 AND product_id = $2
        `, [restaurant.id, product.id]);

        if (existingInventory.length > 0) {
          await query(`
            UPDATE restaurant_inventory 
            SET current_qty = current_qty + $1, updated_at = now()
            WHERE id = $2
          `, [randomQty, existingInventory[0].id]);
        } else {
          await query(`
            INSERT INTO restaurant_inventory (
              restaurant_id, product_id, current_qty
            )
            VALUES ($1, $2, $3)
          `, [restaurant.id, product.id, randomQty]);
        }
      }
    }

    logger.info('Successfully added inventory to restaurants');
    logger.info('Order seeding completed successfully');
    
    process.exit(0);
  } catch (error) {
    logger.error('Error seeding orders:', error);
    process.exit(1);
  }
}

seedOrders();

