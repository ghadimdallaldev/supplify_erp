import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/supplify',
});

async function createWarehouses() {
  console.log('Creating warehouses...');

  try {
    // Ensure warehouse table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS warehouse (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        address_json JSONB,
        delivery_coverage_zones JSONB DEFAULT '[]'::jsonb,
        is_main BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(supplier_id, code)
      );
      
      CREATE INDEX IF NOT EXISTS idx_warehouse_supplier ON warehouse(supplier_id);
      CREATE INDEX IF NOT EXISTS idx_warehouse_active ON warehouse(supplier_id) WHERE is_active = true;
    `);
    console.log('✓ Warehouse table created');

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
