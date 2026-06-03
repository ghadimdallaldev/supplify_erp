import { logger } from '../src/lib/logger.js'
import { runFullStartupMigrations } from '../src/lib/startup-migrations.js'
import { pool } from '../src/lib/db.js'
import { disconnectCache } from '../src/lib/cache.js'
import { isMainModule } from './lib/is-main.mjs'

async function runMigrations() {
  try {
    await runFullStartupMigrations({ force: true })
    logger.info('CLI migrations finished (pnpm db:migrate)')
  } catch (error) {
    logger.error('Migration failed:', error)
    process.exitCode = 1
  } finally {
    await disconnectCache()
    await pool.end()
  }
}

if (isMainModule(import.meta.url)) {
  runMigrations()
}
