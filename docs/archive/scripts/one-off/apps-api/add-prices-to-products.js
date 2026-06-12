import { query } from '../src/lib/db.js';
import { logger } from '../src/lib/logger.js';

async function addPricesToProducts() {
  try {
    logger.info('Adding prices to products without price records...');

    // Get all products that don't have prices
    const { rows: productsWithoutPrices } = await query(`
      SELECT p.id, p.name, p.category
      FROM product p
      WHERE NOT EXISTS (
        SELECT 1 FROM price WHERE price.product_id = p.id
      )
    `);

    logger.info(`Found ${productsWithoutPrices.length} products without prices`);

    let addedCount = 0;
    for (const product of productsWithoutPrices) {
      // Generate a random price based on category
      let price = 0;
      switch (product.category?.toLowerCase()) {
        case 'vegetables':
          price = Math.floor(Math.random() * 5) + 1; // $1-$5
          break;
        case 'meat':
          price = Math.floor(Math.random() * 15) + 5; // $5-$20
          break;
        case 'grains':
          price = Math.floor(Math.random() * 8) + 2; // $2-$10
          break;
        case 'dairy':
          price = Math.floor(Math.random() * 10) + 3; // $3-$13
          break;
        case 'beverages':
          price = Math.floor(Math.random() * 8) + 2; // $2-$10
          break;
        default:
          price = Math.floor(Math.random() * 10) + 2; // $2-$12
      }

      await query(`
        INSERT INTO price (product_id, amount, currency, valid_from)
        VALUES ($1, $2, 'USD', now())
      `, [product.id, price]);

      logger.info(`Added price $${price} to ${product.name}`);
      addedCount++;
    }

    logger.info(`Successfully added prices to ${addedCount} products`);
    
    // Verify
    const { rows: verification } = await query(`
      SELECT COUNT(*) as count
      FROM product p
      WHERE EXISTS (
        SELECT 1 FROM price WHERE price.product_id = p.id
      )
    `);
    
    logger.info(`Total products with prices: ${verification[0].count}`);

  } catch (error) {
    logger.error('Error adding prices:', error);
    throw error;
  } finally {
    process.exit(0);
  }
}

addPricesToProducts();

