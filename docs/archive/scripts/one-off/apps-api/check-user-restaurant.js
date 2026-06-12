import { query } from '../src/lib/db.js';
import { logger } from '../src/lib/logger.js';

async function checkUserRestaurant() {
  try {
    // Get all users with RESTAURANT role
    const { rows: users } = await query(
      'SELECT id, email, role FROM app_user WHERE role = $1 OR role = $2',
      ['RESTAURANT', 'restaurant']
    );
    logger.info('Restaurant users:', users);
    
    for (const user of users) {
      // Find restaurant by contact_email matching user email
      const { rows: restaurants } = await query(
        'SELECT id, name, contact_email FROM restaurant WHERE contact_email = $1',
        [user.email]
      );
      
      logger.info(`Restaurant for user ${user.email}:`, restaurants);
      
      if (restaurants.length > 0) {
        const restaurantId = restaurants[0].id;
        
        // Count orders
        const { rows: orderCount } = await query(
          'SELECT COUNT(*) as count FROM customer_order WHERE restaurant_id = $1',
          [restaurantId]
        );
        
        logger.info(`Orders for restaurant ${restaurants[0].name}:`, orderCount[0].count);
      }
    }
  } catch (error) {
    logger.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

checkUserRestaurant();
