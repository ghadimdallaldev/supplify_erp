import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { query } from './db.js'
import { logger } from './logger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(__dirname, '..', '..', 'db', 'migrations')

function readMigrationSql(filePath) {
  const buf = readFileSync(filePath)
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.toString('utf16le').replace(/^\uFEFF/, '')
  }
  return buf.toString('utf8')
}

export async function baseSchemaExists() {
  const { rows } = await query(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'restaurant'
    ) AS exists
  `)
  return Boolean(rows[0]?.exists)
}

/** Apply numbered SQL files from apps/api/db/migrations (idempotent via schema_migrations). */
export async function runAllSqlMigrations() {
  logger.info('Ensuring schema_migrations table exists')
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)

  const { rows: appliedRows } = await query('SELECT version FROM schema_migrations')
  const applied = new Set(appliedRows.map((row) => row.version))

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  const pending = files.filter((file) => !applied.has(file))
  if (pending.length === 0) {
    logger.info('SQL migrations up to date', { total: files.length })
    return
  }

  logger.info('Applying pending SQL migrations', { pending: pending.length, total: files.length })

  for (const file of pending) {
    logger.info({ event: 'db.migration.run', file })
    const sql = readMigrationSql(join(migrationsDir, file))
    try {
      await query(sql)
    } catch (error) {
      if (error.code === '42P07') {
        logger.warn({ event: 'db.migration.exists', file })
      } else {
        throw error
      }
    }

    await query('INSERT INTO schema_migrations (version) VALUES ($1)', [file])
    applied.add(file)
    logger.info({ event: 'db.migration.applied', file })
  }

  logger.info('SQL migrations completed', { applied: pending.length })
}
