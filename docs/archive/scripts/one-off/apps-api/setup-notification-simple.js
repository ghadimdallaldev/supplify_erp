import { query, pool } from '../src/lib/db.js';

async function setupNotificationTables() {
  try {
    console.log('🔧 Creating notification tables...');
    
    // Create notification_preferences table
    await query(`
      CREATE TABLE IF NOT EXISTS notification_preferences (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        user_type TEXT NOT NULL CHECK (user_type IN ('SUPPLIER', 'RESTAURANT', 'ADMIN')),
        
        -- Notification channels
        email_enabled BOOLEAN DEFAULT true,
        sms_enabled BOOLEAN DEFAULT false,
        push_enabled BOOLEAN DEFAULT false,
        in_app_enabled BOOLEAN DEFAULT true,
        
        -- Notification types
        notify_order_new BOOLEAN DEFAULT true,
        notify_order_acknowledged BOOLEAN DEFAULT true,
        notify_order_processing BOOLEAN DEFAULT true,
        notify_order_shipped BOOLEAN DEFAULT true,
        notify_order_delivered BOOLEAN DEFAULT true,
        notify_order_cancelled BOOLEAN DEFAULT true,
        notify_message_received BOOLEAN DEFAULT true,
        notify_invoice_issued BOOLEAN DEFAULT true,
        notify_invoice_overdue BOOLEAN DEFAULT true,
        notify_payment_received BOOLEAN DEFAULT true,
        notify_low_stock BOOLEAN DEFAULT true,
        notify_out_of_stock BOOLEAN DEFAULT true,
        notify_system_updates BOOLEAN DEFAULT true,
        notify_promotions BOOLEAN DEFAULT true,
        
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now(),
        
        UNIQUE(user_id, user_type)
      )
    `);
    
    // Create notification_log table
    await query(`
      CREATE TABLE IF NOT EXISTS notification_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        user_type TEXT NOT NULL,
        
        notification_type TEXT NOT NULL,
        notification_category TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        
        email_sent BOOLEAN DEFAULT false,
        sms_sent BOOLEAN DEFAULT false,
        push_sent BOOLEAN DEFAULT false,
        in_app_sent BOOLEAN DEFAULT true,
        
        reference_id UUID,
        reference_type TEXT,
        
        is_read BOOLEAN DEFAULT false,
        read_at TIMESTAMPTZ,
        
        metadata JSONB,
        
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `);
    
    // Create restaurant_contact_info
    await query(`
      CREATE TABLE IF NOT EXISTS restaurant_contact_info (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        restaurant_id UUID REFERENCES restaurant(id) ON DELETE CASCADE NOT NULL,
        
        email TEXT NOT NULL,
        email_verified BOOLEAN DEFAULT false,
        phone TEXT,
        phone_verified BOOLEAN DEFAULT false,
        
        fcm_token TEXT,
        apns_token TEXT,
        
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now(),
        
        UNIQUE(restaurant_id)
      )
    `);
    
    // Create supplier_contact_info
    await query(`
      CREATE TABLE IF NOT EXISTS supplier_contact_info (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        supplier_id UUID REFERENCES supplier(id) ON DELETE CASCADE NOT NULL,
        
        email TEXT NOT NULL,
        email_verified BOOLEAN DEFAULT false,
        phone TEXT,
        phone_verified BOOLEAN DEFAULT false,
        
        fcm_token TEXT,
        apns_token TEXT,
        
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now(),
        
        UNIQUE(supplier_id)
      )
    `);
    
    console.log('✅ Notification tables created successfully!');
    
    // Now set up test contacts
    console.log('\n📧 Setting up test contacts...');
    
    // Get first restaurant
    const { rows: restaurants } = await query('SELECT id, name FROM restaurant LIMIT 1');
    
    if (restaurants.length > 0) {
      const restaurantId = restaurants[0].id;
      console.log(`📝 Setting up for restaurant: ${restaurants[0].name}`);
      
      await query(`
        INSERT INTO restaurant_contact_info (restaurant_id, email, phone, email_verified, phone_verified)
        VALUES ($1, $2, $3, true, true)
        ON CONFLICT (restaurant_id)
        DO UPDATE SET email = $2, phone = $3, updated_at = now()
      `, [restaurantId, 'mdallalghadi@gmail.com', '0096176911906']);
      
      console.log('✅ Restaurant contact info added');
      console.log('  📧 Email: mdallalghadi@gmail.com');
      console.log('  📱 Phone: 0096176911906');
    }
    
    // Get first supplier
    const { rows: suppliers } = await query('SELECT id, name FROM supplier LIMIT 1');
    
    if (suppliers.length > 0) {
      const supplierId = suppliers[0].id;
      console.log(`📝 Setting up for supplier: ${suppliers[0].name}`);
      
      await query(`
        INSERT INTO supplier_contact_info (supplier_id, email, phone, email_verified, phone_verified)
        VALUES ($1, $2, $3, true, true)
        ON CONFLICT (supplier_id)
        DO UPDATE SET email = $2, phone = $3, updated_at = now()
      `, [supplierId, 'mdallalghadi@gmail.com', '0096176911906']);
      
      console.log('✅ Supplier contact info added');
    }
    
    console.log('\n🎉 Setup completed!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

setupNotificationTables()
  .then(() => {
    console.log('✅ All done');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Failed:', error);
    process.exit(1);
  });

