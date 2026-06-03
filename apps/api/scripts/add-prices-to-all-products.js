import { query } from '../src/lib/db.js';
import { logger } from '../src/lib/logger.js';

async function addPricesToAllProducts() {
  try {
    logger.info('Starting to add prices to all products...');
    
    // Get all products
    const { rows: products } = await query('SELECT * FROM product');
    logger.info(`Found ${products.length} products`);
    
    for (const product of products) {
      // Check if price already exists
      const { rows: existingPrices } = await query(
        'SELECT * FROM price WHERE product_id = $1 AND (valid_to IS NULL OR valid_to > now())',
        [product.id]
      );
      
      if (existingPrices.length === 0) {
        // Generate random price based on product category
        let basePrice = 10; // Default base price
        
        if (product.category === 'Vegetables') {
          basePrice = 2 + Math.random() * 8; // $2-10
        } else if (product.category === 'Meat' || product.category === 'Seafood') {
          basePrice = 8 + Math.random() * 22; // $8-30
        } else if (product.category === 'Grains') {
          basePrice = 3 + Math.random() * 12; // $3-15
        } else if (product.category === 'Oils') {
          basePrice = 5 + Math.random() * 25; // $5-30
        } else if (product.category === 'Dairy') {
          basePrice = 2 + Math.random() * 8; // $2-10
        }
        
        const price = parseFloat(basePrice.toFixed(2));
        
        // Insert new price
        await query(
          `INSERT INTO price (product_id, amount, currency, valid_from)
           VALUES ($1, $2, 'USD', now())`,
          [product.id, price]
        );
        
        logger.info(`Added price $${price} to ${product.name}`);
      } else {
        logger.info(`Price already exists for ${product.name}`);
      }
    }
    
    logger.info('Successfully added prices to all products');
    process.exit(0);
  } catch (error) {
    logger.error('Error adding prices to products:', error);
    process.exit(1);
  }
}

addPricesToAllProducts();
