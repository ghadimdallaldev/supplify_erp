import 'dotenv/config';
import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function applyMigration() {
  console.log('Applying subscription system migration...\n');

  try {
    // Read the migration file
    const migrationPath = join(__dirname, '..', 'db', 'migrations', '0022_subscription_system.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf8');

    console.log('Executing migration SQL...');
    await pool.query(migrationSQL);

    // Mark as applied (check if column exists first)
    try {
      await pool.query(`
        INSERT INTO schema_migrations (version, applied_at)
        VALUES ('0022_subscription_system', now())
        ON CONFLICT (version) DO NOTHING
      `);
    } catch (error) {
      // If schema_migrations doesn't have the right structure, that's OK
      console.log('Note: Could not update schema_migrations table');
    }

    console.log('✅ Migration 0022_subscription_system applied successfully!\n');

  } catch (error) {
    console.error('❌ Error applying migration:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

applyMigration();
