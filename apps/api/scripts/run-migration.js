import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from '../src/config/env.js';
import { query } from '../src/lib/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runAllMigrations() {
  try {
    // Get all migration files
    const migrationsDir = join(__dirname, '../db/migrations');
    const files = readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      // Check if migration was already applied
      const { rows } = await query(
        "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE migration = $1)",
        [file]
      );

      if (rows[0].exists) {
        console.log(`Skipping ${file} (already applied)`);
        continue;
      }

      console.log(`Running migration: ${file}`);
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      await query(sql);

      // Record migration
      await query(
        "INSERT INTO schema_migrations (migration) VALUES ($1)",
        [file]
      );

      console.log(`✓ ${file} completed`);
    }

    console.log('All migrations completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runAllMigrations();

