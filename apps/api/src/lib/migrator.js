import { readFile } from 'fs/promises'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { query } from './db.js'
import { logger } from './logger.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const RESERVATIONS_MIGRATION = '0033_reservations_system.sql'
const RESERVATIONS_MIGRATION_PATH = join(__dirname, '..', '..', 'db', 'migrations', RESERVATIONS_MIGRATION)

async function reservationsSchemaExists() {
  const { rows } = await query(`
    SELECT
      EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_name = 'reservation_table'
      ) AS has_tables,
      EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_name = 'reservation'
      ) AS has_reservations
  `)

  const result = rows[0] || {}
  return Boolean(result.has_tables && result.has_reservations)
}

export async function ensureReservationsSchema() {
  try {
    if (await reservationsSchemaExists()) {
      logger.debug('Reservations schema already present, skipping migration')
      return
    }

    logger.info('Applying reservations schema migration (0033)')
    const sql = await readFile(RESERVATIONS_MIGRATION_PATH, 'utf8')
    await query(sql)

    logger.info('Reservations schema migration applied successfully')
  } catch (error) {
    logger.error('Failed to apply reservations schema migration', { error: error.message })
    throw error
  }
}

