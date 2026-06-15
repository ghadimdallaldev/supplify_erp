import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { query, migrationQuery } from './db.js'
import { logger } from './logger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(__dirname, '..', '..', 'db', 'migrations')

function isCommentOnlyStatement(trimmed) {
  return trimmed.split(/\r?\n/).every((line) => {
    const t = line.trim()
    return t.length === 0 || t.startsWith('--')
  })
}

export function splitMigrationStatements(sql) {
  const statements = []
  let current = ''
  let i = 0
  /** @type {string | null} null = not inside a dollar-quoted string */
  let dollarTag = null

  while (i < sql.length) {
    if (dollarTag === null) {
      const dollarMatch = sql.slice(i).match(/^\$([A-Za-z0-9_]*)\$/)
      if (dollarMatch) {
        dollarTag = dollarMatch[1]
        current += dollarMatch[0]
        i += dollarMatch[0].length
        continue
      }

      if (sql[i] === ';') {
        const rest = sql.slice(i + 1)
        if (/^\s*(?:\r?\n|$)/.test(rest)) {
          const trimmed = current.trim()
          if (trimmed.length > 0 && !isCommentOnlyStatement(trimmed)) {
            statements.push(trimmed)
          }
          current = ''
          i += 1
          const ws = rest.match(/^\s*/)
          if (ws) i += ws[0].length
          continue
        }
      }

      current += sql[i]
      i += 1
      continue
    }

    const close = `$${dollarTag}$`
    if (sql.slice(i, i + close.length) === close) {
      current += close
      i += close.length
      dollarTag = null
      continue
    }

    current += sql[i]
    i += 1
  }

  const trimmed = current.trim()
  if (trimmed.length > 0 && !isCommentOnlyStatement(trimmed)) {
    statements.push(trimmed)
  }

  return statements
}

function isIdempotentCreateStatement(statement) {
  return /^\s*CREATE\s+(TABLE|INDEX|UNIQUE\s+INDEX)\s+IF\s+NOT\s+EXISTS/i.test(statement)
}

async function runMigrationStatements(sql) {
  const statements = splitMigrationStatements(sql)
  for (const statement of statements) {
    try {
      await migrationQuery(`${statement};`)
    } catch (error) {
      if (error.code === '42P07' && isIdempotentCreateStatement(statement)) {
        logger.warn({ event: 'db.migration.object_exists', statement: statement.slice(0, 120) })
        continue
      }
      throw error
    }
  }
}

function readMigrationSql(filePath) {
  const buf = readFileSync(filePath)
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.toString('utf16le').replace(/^\uFEFF/, '')
  }
  return buf.toString('utf8')
}

async function loadAppliedMigrationVersions() {
  const { rows: colRows } = await query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'schema_migrations'
      AND column_name IN ('version', 'migration')
  `)
  const names = new Set(colRows.map((r) => r.column_name))
  const col = names.has('version') ? 'version' : names.has('migration') ? 'migration' : 'version'
  const { rows } = await query(`SELECT ${col} AS version FROM schema_migrations`)
  return new Set(rows.map((row) => row.version))
}

async function recordAppliedMigration(file) {
  const { rows: colRows } = await query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'schema_migrations'
      AND column_name IN ('version', 'migration')
  `)
  const names = new Set(colRows.map((r) => r.column_name))
  if (names.has('version')) {
    await query(
      'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING',
      [file]
    )
    return
  }
  if (names.has('migration')) {
    await query(
      'INSERT INTO schema_migrations (migration) VALUES ($1) ON CONFLICT (migration) DO NOTHING',
      [file]
    )
  }
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

  const applied = await loadAppliedMigrationVersions()

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
      await runMigrationStatements(sql)
    } catch (error) {
      logger.error(`SQL migration failed: ${file}`, {
        event: 'db.migration.failed',
        file,
        code: error.code,
        error: error.message,
      })
      throw error
    }

    await recordAppliedMigration(file)
    applied.add(file)
    logger.info({ event: 'db.migration.applied', file })
  }

  logger.info('SQL migrations completed', { applied: pending.length })
}
