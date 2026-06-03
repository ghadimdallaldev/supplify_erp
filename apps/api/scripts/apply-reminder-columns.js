import { query, pool } from '../src/lib/db.js';

async function main() {
  try {
    console.log('Ensuring reminder columns exist on customer_order...');
    await query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'customer_order' AND column_name = 'reminder_count'
        ) THEN
          ALTER TABLE customer_order ADD COLUMN reminder_count integer NOT NULL DEFAULT 0;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'customer_order' AND column_name = 'last_reminder_sent_at'
        ) THEN
          ALTER TABLE customer_order ADD COLUMN last_reminder_sent_at timestamptz;
        END IF;
      END $$;
    `);
    console.log('✓ Reminder columns are present.');
    process.exit(0);
  } catch (err) {
    console.error('Failed to ensure reminder columns:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();


