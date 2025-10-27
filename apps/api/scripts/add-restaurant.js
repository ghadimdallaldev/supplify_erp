import { query } from '../src/lib/db.js';
import { config } from '../src/config/env.js';

async function addRestaurant() {
  try {
    const email = 'restaurant@example.com';
    
    // Check if restaurant already exists
    const { rows: existing } = await query(
      'SELECT id FROM restaurant WHERE contact_email = $1',
      [email]
    );
    
    if (existing.length > 0) {
      console.log(`Restaurant with email ${email} already exists with ID: ${existing[0].id}`);
      process.exit(0);
    }
    
    // Create restaurant
    const { rows } = await query(`
      INSERT INTO restaurant (name, slug, contact_email, phone, address_json)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, name, contact_email
    `, [
      'Test Restaurant',
      'test-restaurant',
      email,
      '+1234567890',
      JSON.stringify({
        street: '123 Restaurant Street',
        city: 'Test City',
        country: 'Test Country'
      })
    ]);
    
    console.log('✓ Restaurant created successfully:', rows[0]);
    process.exit(0);
  } catch (error) {
    console.error('Error creating restaurant:', error.message);
    process.exit(1);
  }
}

addRestaurant();

