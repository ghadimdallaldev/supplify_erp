import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pool, query } from '../src/lib/db.js';
import { logger } from '../src/lib/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIGRATIONS_DIR = join(__dirname, 'db', 'migrations');

async function runMigrations() {
  try {
    logger.info('Starting database migrations...');

    // Ensure schema_migrations table exists
    await query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    // Get list of migration files
    const migrationFiles = readdirSync(MIGRATIONS_DIR)
      .filter(file => file.endsWith('.sql'))
      .sort();

    logger.info(`Found ${migrationFiles.length} migration files`);

    // Get applied migrations
    const { rows: appliedMigrations } = await query(
      'SELECT version FROM schema_migrations ORDER BY version'
    );
    const appliedVersions = new Set(appliedMigrations.map(row => row.version));

    // Apply pending migrations
    for (const file of migrationFiles) {
      const version = file.replace('.sql', '');
      
      if (appliedVersions.has(version)) {
        logger.info(`Migration ${version} already applied, skipping`);
        continue;
      }

      logger.info(`Applying migration ${version}...`);
      
      const migrationPath = join(MIGRATIONS_DIR, file);
      const migrationSQL = readFileSync(migrationPath, 'utf8');
      
      // Execute migration
      await query(migrationSQL);
      
      // Record migration as applied
      await query(
        'INSERT INTO schema_migrations (version) VALUES ($1)',
        [version]
      );
      
      logger.info(`Migration ${version} applied successfully`);
    }

    logger.info('All migrations completed successfully');
  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run migrations if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations();
}
