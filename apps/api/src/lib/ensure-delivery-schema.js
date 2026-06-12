import { migrationQuery, query } from './db.js'
import { logger } from './logger.js'

async function tableExists(tableName) {
  const { rows } = await query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
    [tableName]
  )
  return rows.length > 0
}

/**
 * Idempotent delivery schema for Railway hosts where numbered migrations may lag.
 * Uses bare UUID columns first (no FK) so partial consumer-ordering schemas still upgrade.
 */
export async function ensureDeliverySchema() {
  if (await tableExists('branch')) {
    await migrationQuery(`
      ALTER TABLE branch
        ADD COLUMN IF NOT EXISTS delivery_latitude DECIMAL(10, 7),
        ADD COLUMN IF NOT EXISTS delivery_longitude DECIMAL(10, 7),
        ADD COLUMN IF NOT EXISTS delivery_location_label TEXT,
        ADD COLUMN IF NOT EXISTS delivery_address_notes TEXT
    `)
  }

  if (await tableExists('restaurant')) {
    await migrationQuery(`
      ALTER TABLE restaurant
        ADD COLUMN IF NOT EXISTS delivery_latitude DECIMAL(10, 7),
        ADD COLUMN IF NOT EXISTS delivery_longitude DECIMAL(10, 7),
        ADD COLUMN IF NOT EXISTS delivery_location_label TEXT,
        ADD COLUMN IF NOT EXISTS delivery_address_notes TEXT
    `)
  }

  if (!(await tableExists('delivery_zone'))) {
    logger.debug('delivery_zone table missing — skipping zone column ensure')
    return
  }

  await migrationQuery(`
    ALTER TABLE delivery_zone
      ADD COLUMN IF NOT EXISTS supplier_id UUID,
      ADD COLUMN IF NOT EXISTS warehouse_id UUID,
      ADD COLUMN IF NOT EXISTS coverage_area_json JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS delivery_time_days INTEGER DEFAULT 1,
      ADD COLUMN IF NOT EXISTS zone_type VARCHAR(20) DEFAULT 'polygon',
      ADD COLUMN IF NOT EXISTS geometry JSONB,
      ADD COLUMN IF NOT EXISTS postal_codes TEXT[],
      ADD COLUMN IF NOT EXISTS radius_km NUMERIC(6, 2),
      ADD COLUMN IF NOT EXISTS center_lat NUMERIC(10, 7),
      ADD COLUMN IF NOT EXISTS center_lng NUMERIC(10, 7),
      ADD COLUMN IF NOT EXISTS estimated_delivery_hours INTEGER
  `)

  await migrationQuery(
    `CREATE INDEX IF NOT EXISTS idx_delivery_zone_supplier ON delivery_zone(supplier_id)`
  )
  await migrationQuery(
    `CREATE INDEX IF NOT EXISTS idx_delivery_zone_warehouse ON delivery_zone(warehouse_id)`
  )
  await migrationQuery(`
    CREATE INDEX IF NOT EXISTS idx_delivery_zone_active
    ON delivery_zone(supplier_id) WHERE is_active = true
  `)

  logger.info('Delivery schema ensure completed')
}
