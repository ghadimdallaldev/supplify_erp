import { query } from '../src/lib/db.js';

async function fixSchemaTable() {
  try {
    console.log('Dropping and recreating schema_migrations table...');
    
    await query('DROP TABLE IF EXISTS schema_migrations CASCADE');
    
    await query(`
      CREATE TABLE schema_migrations (
        id SERIAL PRIMARY KEY,
        migration TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    
    await query(`
      CREATE INDEX idx_schema_migrations_migration ON schema_migrations(migration)
    `);
    
    console.log('✓ schema_migrations table recreated successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

fixSchemaTable();

