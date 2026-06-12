import { query, pool } from '../src/lib/db.js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function setupNotificationTables() {
  try {
    console.log('🔧 Setting up notification tables...');
    
    // Read the migration file
    const migrationPath = join(__dirname, '..', 'db', 'migrations', '0020_notifications.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf8');
    
    console.log('📝 Applying notification migration...');
    
    // Execute the migration
    await query(migrationSQL);
    
    // Check if table exists
    const { rows } = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('notification_preferences', 'notification_log', 'restaurant_contact_info', 'supplier_contact_info')
    `);
    
    console.log('✅ Notification tables created:');
    rows.forEach(row => console.log(`  - ${row.table_name}`));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

setupNotificationTables()
  .then(() => {
    console.log('✅ Setup completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  });

