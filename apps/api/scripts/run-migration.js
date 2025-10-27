import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from '../src/config/env.js';
import { query } from '../src/lib/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const migrationFile = join(__dirname, '../db/migrations/0008_add_reserved_qty.sql');
const sql = readFileSync(migrationFile, 'utf8');

async function runMigration() {
  try {
    console.log('Running migration: 0008_add_reserved_qty.sql');
    await query(sql);
    console.log('Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigration();

