import { query } from '../src/lib/db.js';
import { logger } from '../src/lib/logger.js';

async function addStockToProducts() {
  try {
    logger.info('Starting to add stock to all products...');
    
    // Get all products
    const { rows: products } = await query('SELECT * FROM product');
    logger.info(`Found ${products.length} products`);
    
    // Get warehouses (if any exist)
    const { rows: warehouses } = await query('SELECT * FROM warehouse');
    logger.info(`Found ${warehouses.length} warehouses`);
    
    for (const product of products) {
      // Generate random stock quantity (50-500)
      const availableQty = Math.floor(Math.random() * 450) + 50;
      const reservedQty = Math.floor(Math.random() * 50);
      
      // Use first warehouse if exists, otherwise null
      const warehouseId = warehouses.length > 0 ? warehouses[0].id : null;
      
      // Check if inventory already exists for this product
      const { rows: existing } = await query(
        'SELECT * FROM inventory WHERE product_id = $1',
        [product.id]
      );
      
      if (existing.length > 0) {
        // Update existing inventory
        await query(
          `UPDATE inventory 
           SET available_qty = $1, reserved_qty = $2, updated_at = now()
           WHERE product_id = $3`,
          [availableQty, reservedQty, product.id]
        );
        logger.info(`Updated inventory for ${product.name}: ${availableQty} available, ${reservedQty} reserved`);
      } else {
        // Insert new inventory
        await query(
          `INSERT INTO inventory (product_id, warehouse_id, available_qty, reserved_qty, updated_at)
           VALUES ($1, $2, $3, $4, now())`,
          [product.id, warehouseId, availableQty, reservedQty]
        );
        logger.info(`Added inventory for ${product.name}: ${availableQty} available, ${reservedQty} reserved`);
      }
    }
    
    logger.info('Successfully added stock to all products');
    process.exit(0);
  } catch (error) {
    logger.error('Error adding stock to products:', error);
    process.exit(1);
  }
}

addStockToProducts();
