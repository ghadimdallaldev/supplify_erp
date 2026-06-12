import { query } from '../src/lib/db.js';
import { logger } from '../src/lib/logger.js';

async function addSuppliersAndProducts() {
  try {
    logger.info('Starting to add 10 new suppliers with products...');
    
    const cities = [
      'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix',
      'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'San Jose'
    ];
    
    const states = [
      'NY', 'CA', 'IL', 'TX', 'AZ',
      'PA', 'TX', 'CA', 'TX', 'CA'
    ];
    
    const zipCodes = [
      '10001', '90001', '60601', '77001', '85001',
      '19101', '78201', '92101', '75201', '95101'
    ];
    
    const supplierNames = [
      'City Fresh Produce', 'Ocean Blue Seafood', 'Valley Farm Meats',
      'Mountain Top Dairy', 'Golden Grain Co', 'Pure Olive Imports',
      'Fresh Veggies Direct', 'Prime Cut Butchers', 'Artisan Bakery Supply',
      'Organic Market Place'
    ];
    
    const categories = [
      ['Vegetables', 'Fruits', 'Herbs'],
      ['Seafood', 'Fish', 'Shellfish'],
      ['Meat', 'Beef', 'Pork', 'Lamb'],
      ['Dairy', 'Cheese', 'Yogurt'],
      ['Grains', 'Rice', 'Wheat'],
      ['Oils', 'Vinegar', 'Condiments'],
      ['Vegetables', 'Organic', 'Local'],
      ['Meat', 'Chicken', 'Turkey'],
      ['Bakery', 'Flour', 'Yeast'],
      ['Organic', 'Eco-Friendly', 'Sustainable']
    ];
    
    for (let i = 0; i < 10; i++) {
      // Create supplier
      const supplierName = supplierNames[i];
      const slug = supplierName.toLowerCase().replace(/\s+/g, '-');
      const email = `supplier${i + 1}@example.com`;
      const phone = `+1-555-${String(i).padStart(4, '0')}`;
      
      const { rows: suppliers } = await query(
        `INSERT INTO supplier (name, slug, contact_email, phone, address_json, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, now(), now())
         RETURNING *`,
        [
          supplierName,
          slug,
          email,
          phone,
          JSON.stringify({
            street: `${100 + i * 10} Main Street`,
            city: cities[i],
            state: states[i],
            zip: zipCodes[i]
          })
        ]
      );
      
      const supplier = suppliers[0];
      logger.info(`Created supplier: ${supplierName}`);
      
      // Get warehouse for this supplier (use first warehouse if exists, otherwise null)
      const { rows: warehouses } = await query('SELECT * FROM warehouse LIMIT 1');
      const warehouseId = warehouses.length > 0 ? warehouses[0].id : null;
      
      // Create 5 products for this supplier
      for (let j = 0; j < 5; j++) {
        const categoryList = categories[i];
        const category = categoryList[j % categoryList.length];
        
        const productNames = [
          `${category} Product ${j + 1}`,
          `Premium ${category} ${j + 1}`,
          `Fresh ${category} ${j + 1}`,
          `Organic ${category} ${j + 1}`,
          `Quality ${category} ${j + 1}`,
        ];
        
        const productName = productNames[j];
        const sku = `${supplierName.substring(0, 3).toUpperCase()}-${i + 1}-${j + 1}`;
        
        const { rows: products } = await query(
          `INSERT INTO product (name, sku, category, supplier_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, now(), now())
           RETURNING *`,
          [productName, sku, category, supplier.id]
        );
        
        const product = products[0];
        
        // Add random price
        let basePrice = 5 + Math.random() * 25;
        if (category.includes('Organic')) basePrice += 5;
        if (category.includes('Premium') || category.includes('Prime')) basePrice += 10;
        
        const price = parseFloat(basePrice.toFixed(2));
        
        await query(
          `INSERT INTO price (product_id, amount, currency, valid_from)
           VALUES ($1, $2, 'USD', now())`,
          [product.id, price]
        );
        
        // Add random inventory
        const availableQty = Math.floor(Math.random() * 450) + 50;
        const reservedQty = Math.floor(Math.random() * 50);
        
        await query(
          `INSERT INTO inventory (product_id, warehouse_id, available_qty, reserved_qty, updated_at)
           VALUES ($1, $2, $3, $4, now())`,
          [product.id, warehouseId, availableQty, reservedQty]
        );
        
        logger.info(`  Created product: ${productName} (${category}) - $${price} - ${availableQty} in stock`);
      }
      
      logger.info(`Completed supplier ${i + 1}/10: ${supplierName}`);
    }
    
    logger.info('Successfully added 10 suppliers with 50 products total');
    process.exit(0);
  } catch (error) {
    logger.error('Error adding suppliers and products:', error);
    process.exit(1);
  }
}

addSuppliersAndProducts();
