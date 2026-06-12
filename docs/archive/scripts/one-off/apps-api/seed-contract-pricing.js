import { query, client } from '../src/lib/db.js';

async function seedContractPricing() {
  try {
    console.log('🌱 Seeding contract pricing data...');

    // Get a restaurant and supplier
    const { rows: restaurants } = await query('SELECT id FROM restaurant LIMIT 1');
    const { rows: suppliers } = await query('SELECT id FROM supplier LIMIT 1');
    const { rows: products } = await query(`
      SELECT p.id, p.name, pr.amount, p.supplier_id
      FROM product p
      JOIN price pr ON pr.product_id = p.id
      WHERE p.supplier_id = $1
      LIMIT 5
    `, [suppliers[0].id]);

    if (restaurants.length === 0 || suppliers.length === 0 || products.length === 0) {
      console.log('⚠️  No restaurants, suppliers, or products found. Please seed data first.');
      return;
    }

    const restaurantId = restaurants[0].id;
    const supplierId = suppliers[0].id;

    console.log(`📦 Found ${products.length} products for supplier ${supplierId}`);

    // Create contract pricing for the restaurant
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const standardPrice = parseFloat(product.amount);
      
      // Calculate contract price (10-20% discount for regular customers)
      const discount = 10 + (i * 2); // 10%, 12%, 14%, 16%, 18%
      const contractPrice = standardPrice * (1 - discount / 100);

      // Insert contract pricing
      await query(`
        INSERT INTO restaurant_pricing (
          supplier_id, restaurant_id, product_id, 
          price, currency, agreement_type, 
          contract_discount_percentage, is_active,
          contract_start_date, contract_end_date
        ) VALUES ($1, $2, $3, $4, 'USD', 'RELATIONSHIP', $5, true, 
                  CURRENT_DATE, CURRENT_DATE + INTERVAL '1 year')
        ON CONFLICT (supplier_id, restaurant_id, product_id)
        DO UPDATE SET
          price = EXCLUDED.price,
          contract_discount_percentage = EXCLUDED.contract_discount_percentage,
          updated_at = now()
      `, [
        supplierId,
        restaurantId,
        product.id,
        contractPrice.toFixed(2),
        discount,
      ]);

      console.log(`✅ Created contract pricing for ${product.name}: $${standardPrice.toFixed(2)} → $${contractPrice.toFixed(2)} (${discount}% off)`);
    }

    // Create a volume-based pricing contract
    await query(`
      INSERT INTO restaurant_pricing (
        supplier_id, restaurant_id, product_id,
        price, currency, agreement_type,
        contract_discount_percentage, min_order_quantity,
        is_active, contract_start_date, contract_end_date,
        notes
      ) VALUES ($1, $2, $3, $4, 'USD', 'VOLUME', $5, $6, true,
                CURRENT_DATE, CURRENT_DATE + INTERVAL '1 year',
                'Volume discount: 25% off for orders over 100 units')
      ON CONFLICT (supplier_id, restaurant_id, product_id)
      DO NOTHING
    `, [
      supplierId,
      restaurantId,
      products[0].id,
      (parseFloat(products[0].amount) * 0.75).toFixed(2),
      25,
      100,
    ]);

    console.log('✅ Created volume-based pricing contract');

    console.log('🎉 Contract pricing seed completed!');
    console.log(`\nSummary:`);
    console.log(`- Restaurant: ${restaurantId}`);
    console.log(`- Supplier: ${supplierId}`);
    console.log(`- Products with contract pricing: ${products.length}`);
    console.log(`\nTo test, log in as the restaurant and browse products.`);
    console.log(`You should see the discounted contract prices instead of standard prices.`);

  } catch (error) {
    console.error('❌ Error seeding contract pricing:', error.message);
    process.exit(1);
  }
}

seedContractPricing()
  .then(() => {
    console.log('✅ Seed script completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Seed script failed:', error);
    process.exit(1);
  });

