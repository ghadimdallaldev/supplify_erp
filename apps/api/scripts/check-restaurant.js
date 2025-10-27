import { query } from '../src/lib/db.js';
import { logger } from '../src/lib/logger.js';

async function checkRestaurant() {
  try {
    // Get all restaurants
    const { rows: restaurants } = await query('SELECT * FROM restaurant LIMIT 5');
    logger.info('Restaurants:', restaurants);
    
    // Get all users
    const { rows: users } = await query('SELECT * FROM app_user LIMIT 5');
    logger.info('Users:', users);
    
    // Get orders for a specific restaurant
    if (restaurants.length > 0) {
      const restaurantId = restaurants[0].id;
      const { rows: orders } = await query(
        'SELECT COUNT(*) as count FROM customer_order WHERE restaurant_id = $1',
        [restaurantId]
      );
      logger.info(`Orders for restaurant ${restaurantId}:`, orders);
      
      // Get total products
      const { rows: products } = await query('SELECT COUNT(*) as count FROM product');
      logger.info('Total products:', products);
    }
  } catch (error) {
    logger.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

checkRestaurant();
