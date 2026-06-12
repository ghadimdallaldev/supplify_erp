// Script to verify restaurant contact info exists
import { pool } from '../src/lib/db.js';

async function verifyRestaurantContact() {
  try {
    // Get the restaurant
    const { rows: restaurants } = await pool.query(`
      SELECT id, name, contact_email, phone 
      FROM restaurant 
      WHERE contact_email = 'restaurant@example.com'
      LIMIT 1
    `);
    
    if (restaurants.length === 0) {
      console.log('❌ No restaurant found with contact_email = restaurant@example.com');
      return;
    }
    
    const restaurant = restaurants[0];
    console.log('✅ Restaurant found:', {
      id: restaurant.id,
      name: restaurant.name,
      email: restaurant.contact_email,
      phone: restaurant.phone
    });
    
    // Check restaurant_contact_info
    const { rows: contactInfo } = await pool.query(`
      SELECT * FROM restaurant_contact_info WHERE restaurant_id = $1
    `, [restaurant.id]);
    
    if (contactInfo.length === 0) {
      console.log('❌ No contact info found in restaurant_contact_info table');
      console.log('📝 Creating contact info entry...');
      
      await pool.query(`
        INSERT INTO restaurant_contact_info (restaurant_id, email, phone, email_verified, phone_verified)
        VALUES ($1, $2, $3, true, true)
      `, [restaurant.id, restaurant.contact_email, restaurant.phone]);
      
      console.log('✅ Contact info created');
    } else {
      console.log('✅ Contact info found:', contactInfo[0]);
    }
    
    // Check app_user
    const { rows: users } = await pool.query(`
      SELECT * FROM app_user WHERE email = $1
    `, [restaurant.contact_email]);
    
    console.log('📧 App User:', users.length > 0 ? users[0] : 'Not found');
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

verifyRestaurantContact();

