import { query } from '../src/lib/db.js';

async function createSchemaTable() {
  try {
    console.log('Creating schema_migrations table...');
    
    await query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        migration TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    
    await query(`
      CREATE INDEX IF NOT EXISTS idx_schema_migrations_migration ON schema_migrations(migration);
    `);
    
    console.log('✓ schema_migrations table created successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error creating schema_migrations table:', error.message);
    process.exit(1);
  }
}

createSchemaTable();

