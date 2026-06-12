import 'dotenv/config';
import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/supplify',
});

async function createWarehouses() {
  console.log('Creating warehouses...');

  try {
    // First, ensure the warehouse table exists by running the migration
    const migrationFile = join(__dirname, '../db/migrations/0005_supplier_onboarding.sql');
    const sql = readFileSync(migrationFile, 'utf8');
    
    // Extract and run just the warehouse table creation
    const warehouseTableSQL = sql.split('-- Create warehouse table')[1].split('-- Create delivery coverage zone')[0];
    
    try {
      await pool.query(warehouseTableSQL);
      console.log('✓ Warehouse table created');
    } catch (error) {
      if (error.code === '42P07') {
        console.log('✓ Warehouse table already exists');
      } else {
        throw error;
      }
    }

    // Get supplier ID for supplier@example.com
    const { rows: suppliers } = await pool.query(
      'SELECT id FROM supplier WHERE contact_email = $1',
      ['supplier@example.com']
    );

    if (suppliers.length === 0) {
      console.error('Supplier not found for supplier@example.com');
      process.exit(1);
    }

    const supplierId = suppliers[0].id;
    console.log(`Found supplier ID: ${supplierId}`);

    // Insert two warehouses
    const warehouses = [
      {
        name: 'Main Warehouse',
        code: 'WH-001',
        address: {
          street: '123 Farm Road',
          city: 'Agricultural City',
          state: 'CA',
          zip: '90210',
          country: 'USA'
        },
        is_main: true
      },
      {
        name: 'Distribution Center',
        code: 'WH-002',
        address: {
          street: '456 Industrial Blvd',
          city: 'Distribution City',
          state: 'NY',
          zip: '10001',
          country: 'USA'
        },
        is_main: false
      }
    ];

    for (const warehouse of warehouses) {
      const { rows } = await pool.query(
        `INSERT INTO warehouse (supplier_id, name, code, address_json, is_main)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (supplier_id, code) DO UPDATE SET
           name = EXCLUDED.name,
           address_json = EXCLUDED.address_json,
           is_main = EXCLUDED.is_main
         RETURNING id, name, code`,
        [supplierId, warehouse.name, warehouse.code, JSON.stringify(warehouse.address), warehouse.is_main]
      );

      console.log(`✓ Created/Updated warehouse: ${rows[0].name} (${rows[0].code})`);
    }

    console.log('Warehouse creation completed successfully');
  } catch (error) {
    console.error('Error creating warehouses:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

createWarehouses();
