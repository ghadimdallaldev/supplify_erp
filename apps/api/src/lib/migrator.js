import { readFile } from 'fs/promises'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { query } from './db.js'
import { logger } from './logger.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const RESERVATIONS_MIGRATION = '0033_reservations_system.sql'
const STAFF_BASE_MIGRATION = '0034_staff_app.sql'
const STAFF_EXTENSIONS_MIGRATION = '0035_staff_app_extensions.sql'
const PORTAL_SUPPORT_MIGRATION = '0037_portal_support.sql'

const RESERVATIONS_MIGRATION_PATH = join(__dirname, '..', '..', 'db', 'migrations', RESERVATIONS_MIGRATION)
const STAFF_BASE_MIGRATION_PATH = join(__dirname, '..', '..', 'db', 'migrations', STAFF_BASE_MIGRATION)
const STAFF_EXTENSIONS_MIGRATION_PATH = join(__dirname, '..', '..', 'db', 'migrations', STAFF_EXTENSIONS_MIGRATION)
const PORTAL_SUPPORT_MIGRATION_PATH = join(__dirname, '..', '..', 'db', 'migrations', PORTAL_SUPPORT_MIGRATION)

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

async function reservationPublicColumnsExist() {
  const { rows } = await query(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'reservation'
        AND column_name = 'public_token'
    ) AS has_public_token
  `)
  return Boolean(rows[0]?.has_public_token)
}

async function staffPortalSessionTableExists() {
  const { rows } = await query(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_name = 'staff_portal_session'
    ) AS has_portal_session
  `)
  return Boolean(rows[0]?.has_portal_session)
}

export async function ensureReservationsSchema() {
  try {
    if (await reservationsSchemaExists()) {
      logger.debug('Reservations schema already present, skipping migration 0033')
    } else {
      logger.info('Applying reservations schema migration (0033)')
      const sql = await readFile(RESERVATIONS_MIGRATION_PATH, 'utf8')
      await query(sql)
      logger.info('Reservations schema migration applied successfully')
    }

    if (!(await reservationPublicColumnsExist())) {
      logger.info('Applying reservation portal support migration (0037)')
      const portalSql = await readFile(PORTAL_SUPPORT_MIGRATION_PATH, 'utf8')
      await query(portalSql)
      logger.info('Reservation portal support migration applied successfully')
    } else if (!(await staffPortalSessionTableExists())) {
      logger.info('Ensuring staff portal session table via migration (0037)')
      const portalSql = await readFile(PORTAL_SUPPORT_MIGRATION_PATH, 'utf8')
      await query(portalSql)
      logger.info('Staff portal session table created successfully')
    } else {
      logger.debug('Portal support schema already present, skipping migration 0037')
    }
  } catch (error) {
    logger.error('Failed to apply reservations schema migration', { error: error.message })
    throw error
  }
}

async function staffBaseSchemaExists() {
  const { rows } = await query(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_name = 'staff_member'
    ) AS has_staff_member
  `)

  return Boolean(rows[0]?.has_staff_member)
}

async function staffExtensionsSchemaExists() {
  const { rows } = await query(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_name = 'staff_pto_request'
    ) AS has_pto
  `)

  return Boolean(rows[0]?.has_pto)
}

export async function ensureStaffAppSchema() {
  try {
    if (!(await staffBaseSchemaExists())) {
      logger.info('Applying staff app base schema migration (0034)')
      const baseSql = await readFile(STAFF_BASE_MIGRATION_PATH, 'utf8')
      await query(baseSql)
      logger.info('Staff app base schema migration applied successfully')
    } else {
      logger.debug('Staff app base schema already present, skipping migration')
    }

    if (!(await staffExtensionsSchemaExists())) {
      logger.info('Applying staff app extensions migration (0035)')
      const extSql = await readFile(STAFF_EXTENSIONS_MIGRATION_PATH, 'utf8')
      await query(extSql)
      logger.info('Staff app extensions migration applied successfully')
    } else {
      logger.debug('Staff app extensions already present, skipping migration')
    }
  } catch (error) {
    logger.error('Failed to ensure staff app schema', { error: error.message })
    throw error
  }
}

