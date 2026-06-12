import { query } from '../src/lib/db.js';
import { logger } from '../src/lib/logger.js';

async function seedRestaurantInventory() {
  try {
    logger.info('Starting to seed restaurant inventory from completed orders...');
    
    // Get restaurant
    const { rows: restaurants } = await query('SELECT id FROM restaurant LIMIT 1');
    if (restaurants.length === 0) {
      logger.error('No restaurant found');
      process.exit(1);
    }
    const restaurantId = restaurants[0].id;
    
    logger.info(`Found restaurant: ${restaurantId}`);
    
    // Get all completed orders for this restaurant
    const { rows: completedOrders } = await query(`
      SELECT o.id, o.restaurant_id
      FROM customer_order o
      WHERE o.restaurant_id = $1 AND o.status = 'COMPLETED'
    `, [restaurantId]);
    
    logger.info(`Found ${completedOrders.length} completed orders`);
    
    let totalAdded = 0;
    
    for (const order of completedOrders) {
      // Get order items
      const { rows: orderItems } = await query(`
        SELECT oi.product_id, oi.quantity
        FROM order_item oi
        WHERE oi.order_id = $1
      `, [order.id]);
      
      for (const item of orderItems) {
        // Check if inventory already exists
        const { rows: existing } = await query(`
          SELECT * FROM restaurant_inventory 
          WHERE restaurant_id = $1 AND product_id = $2
        `, [restaurantId, item.product_id]);
        
        if (existing.length > 0) {
          // Update existing inventory
          await query(`
            UPDATE restaurant_inventory 
            SET quantity = quantity + $1,
                last_restocked_at = now(),
                updated_at = now()
            WHERE id = $2
          `, [item.quantity, existing[0].id]);
        } else {
          // Create new inventory entry
          await query(`
            INSERT INTO restaurant_inventory (
              restaurant_id, product_id, quantity, last_restocked_at
            )
            VALUES ($1, $2, $3, now())
          `, [restaurantId, item.product_id, item.quantity]);
        }
        
        // Add inventory movement log
        await query(`
          INSERT INTO inventory_movement_log (
            restaurant_id, product_id, type, quantity, reason, reference_id, reference_type
          )
          VALUES ($1, $2, 'RECEIVED', $3, $4, $5, 'ORDER')
        `, [
          restaurantId, 
          item.product_id, 
          item.quantity, 
          'Order received (seeded)', 
          order.id
        ]);
        
        totalAdded++;
      }
    }
    
    logger.info(`Successfully added ${totalAdded} inventory items from ${completedOrders.length} orders`);
    
    // Get current inventory count
    const { rows: inventoryCount } = await query(`
      SELECT COUNT(*) as count FROM restaurant_inventory WHERE restaurant_id = $1
    `, [restaurantId]);
    
    logger.info(`Total restaurant inventory items: ${inventoryCount[0].count}`);
    
    process.exit(0);
  } catch (error) {
    logger.error('Error seeding restaurant inventory:', error);
    process.exit(1);
  }
}

seedRestaurantInventory();
