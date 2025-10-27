import { query } from '../src/lib/db.js';
import { getUserContactInfo } from '../src/services/notification.service.js';

async function setupTestContacts() {
  try {
    console.log('🔧 Setting up test contact information...');

    // Get the first restaurant
    const { rows: restaurants } = await query('SELECT id, name FROM restaurant LIMIT 1');
    
    if (restaurants.length === 0) {
      console.log('⚠️  No restaurants found. Please create a restaurant first.');
      return;
    }

    const restaurantId = restaurants[0].id;
    console.log(`📝 Found restaurant: ${restaurants[0].name}`);

    // Check if contact info already exists
    const { rows: existing } = await query(
      'SELECT * FROM restaurant_contact_info WHERE restaurant_id = $1',
      [restaurantId]
    );

    if (existing.length > 0) {
      // Update existing
      await query(`
        UPDATE restaurant_contact_info
        SET email = $1, phone = $2, updated_at = now()
        WHERE restaurant_id = $3
      `, ['mdallalghadi@gmail.com', '0096176911906', restaurantId]);
      console.log('✅ Updated existing restaurant contact info');
    } else {
      // Create new
      await query(`
        INSERT INTO restaurant_contact_info (restaurant_id, email, phone, email_verified, phone_verified)
        VALUES ($1, $2, $3, true, true)
      `, [restaurantId, 'mdallalghadi@gmail.com', '0096176911906']);
      console.log('✅ Created restaurant contact info');
    }

    // Get the first supplier
    const { rows: suppliers } = await query('SELECT id, name FROM supplier LIMIT 1');
    
    if (suppliers.length > 0) {
      const supplierId = suppliers[0].id;
      console.log(`📝 Found supplier: ${suppliers[0].name}`);

      // Check if contact info exists
      const { rows: suppExisting } = await query(
        'SELECT * FROM supplier_contact_info WHERE supplier_id = $1',
        [supplierId]
      );

      if (suppExisting.length > 0) {
        await query(`
          UPDATE supplier_contact_info
          SET email = $1, phone = $2, updated_at = now()
          WHERE supplier_id = $3
        `, ['mdallalghadi@gmail.com', '0096176911906', supplierId]);
        console.log('✅ Updated existing supplier contact info');
      } else {
        await query(`
          INSERT INTO supplier_contact_info (supplier_id, email, phone, email_verified, phone_verified)
          VALUES ($1, $2, $3, true, true)
        `, [supplierId, 'mdallalghadi@gmail.com', '0096176911906']);
        console.log('✅ Created supplier contact info');
      }
    }

    console.log('\n🎉 Contact information setup complete!');
    console.log('📧 Email: mdallalghadi@gmail.com');
    console.log('📱 Phone: 0096176911906\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

setupTestContacts()
  .then(() => {
    console.log('✅ Setup completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  });

