import { query } from '../src/lib/db.js';
import { logger } from '../src/lib/logger.js';

async function seedRestaurantInventory() {
  try {
    logger.info('Starting to seed restaurant inventory with demo data...');
    
    // Get restaurant
    const { rows: restaurants } = await query('SELECT id FROM restaurant LIMIT 1');
    if (restaurants.length === 0) {
      logger.error('No restaurant found');
      process.exit(1);
    }
    const restaurantId = restaurants[0].id;
    
    logger.info(`Found restaurant: ${restaurantId}`);
    
    // Get all products
    const { rows: products } = await query('SELECT id, name, unit FROM product LIMIT 20');
    logger.info(`Found ${products.length} products`);
    
    let totalAdded = 0;
    
    // Add inventory for products with varied quantities to show reorder suggestions
    for (const product of products) {
      // Generate random quantity between 5 and 100
      const quantity = Math.floor(Math.random() * 95) + 5;
      
      // Set low stock threshold randomly (between 10 and 50)
      const lowStockThreshold = Math.floor(Math.random() * 40) + 10;
      
      // Check if inventory already exists
      const { rows: existing } = await query(`
        SELECT * FROM restaurant_inventory 
        WHERE restaurant_id = $1 AND product_id = $2
      `, [restaurantId, product.id]);
      
      if (existing.length > 0) {
        // Update existing inventory
        await query(`
          UPDATE restaurant_inventory 
          SET quantity = $1,
              low_stock_threshold = $2,
              last_restocked_at = now(),
              updated_at = now()
          WHERE id = $3
        `, [quantity, lowStockThreshold, existing[0].id]);
        logger.info(`Updated inventory for ${product.name}: ${quantity} ${product.unit || 'units'}`);
      } else {
        // Create new inventory entry
        await query(`
          INSERT INTO restaurant_inventory (
            restaurant_id, product_id, quantity, low_stock_threshold, last_restocked_at, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, now(), now(), now())
        `, [restaurantId, product.id, quantity, lowStockThreshold]);
        logger.info(`Created inventory for ${product.name}: ${quantity} ${product.unit || 'units'} (threshold: ${lowStockThreshold})`);
      }
      
      totalAdded++;
    }
    
    logger.info(`Successfully seeded ${totalAdded} inventory items`);
    
    // Get current inventory count
    const { rows: inventoryCount } = await query(`
      SELECT COUNT(*) as count FROM restaurant_inventory WHERE restaurant_id = $1
    `, [restaurantId]);
    
    logger.info(`Total restaurant inventory items: ${inventoryCount[0].count}`);
    
    // Show some items with low stock (for demo)
    const { rows: lowStock } = await query(`
      SELECT ri.quantity, ri.low_stock_threshold, p.name, p.unit
      FROM restaurant_inventory ri
      JOIN product p ON p.id = ri.product_id
      WHERE ri.restaurant_id = $1 AND ri.quantity < ri.low_stock_threshold
      LIMIT 5
    `, [restaurantId]);
    
    if (lowStock.length > 0) {
      logger.info(`\nLow stock items (will show suggested reorder):`);
      lowStock.forEach(item => {
        logger.info(`  - ${item.name}: ${item.quantity} ${item.unit || 'units'} (threshold: ${item.low_stock_threshold})`);
      });
    }
    
    process.exit(0);
  } catch (error) {
    logger.error('Error seeding restaurant inventory:', error);
    process.exit(1);
  }
}

seedRestaurantInventory();

