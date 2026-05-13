import { pool, query } from '../src/lib/db.js'
import { logger } from '../src/lib/logger.js'
import { isMainModule } from './lib/is-main.mjs'

async function resetDatabase() {
  try {
    logger.info('Resetting database...')

    // Drop all tables (in reverse order due to foreign keys)
    const tables = [
      'audit_log',
      'attachment',
      'address',
      'order_item',
      'customer_order',
      'inventory',
      'price',
      'product',
      'catalog',
      'restaurant',
      'supplier',
      'app_user',
      'schema_migrations',
    ]

    for (const table of tables) {
      await query(`DROP TABLE IF EXISTS ${table} CASCADE`)
      logger.info(`Dropped table ${table}`)
    }

    // Drop enum types
    await query('DROP TYPE IF EXISTS order_status CASCADE')
    logger.info('Dropped enum types')

    logger.info('Database reset completed')
  } catch (error) {
    logger.error('Database reset failed:', error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

if (isMainModule(import.meta.url)) {
  resetDatabase()
}
