import { readFileSync, readdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { query } from '../src/lib/db.js'
import { isMainModule } from './lib/is-main.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function readMigrationSql(filePath) {
  const buf = readFileSync(filePath)
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.toString('utf16le').replace(/^\uFEFF/, '')
  }
  return buf.toString('utf8')
}

async function runAllMigrations() {
  try {
    // Create schema_migrations table if it doesn't exist (matches 0001_init.sql: version + applied_at)
    console.log('Ensuring schema_migrations table exists...')
    await query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)
    console.log('✓ schema_migrations table ready')

    // Get all migration files
    const migrationsDir = join(__dirname, '../db/migrations')
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort()

    for (const file of files) {
      // Check if migration was already applied
      const { rows } = await query(
        'SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = $1)',
        [file]
      )

      if (rows[0].exists) {
        console.log(`Skipping ${file} (already applied)`)
        continue
      }

      console.log(`Running migration: ${file}`)
      const sql = readMigrationSql(join(migrationsDir, file))
      // Wrap in try-catch to handle existing tables
      try {
        await query(sql)
      } catch (error) {
        if (error.code === '42P07') {
          // table already exists
          console.log(`  Table already exists, skipping...`)
        } else {
          throw error
        }
      }

      // Record migration
      await query('INSERT INTO schema_migrations (version) VALUES ($1)', [file])

      console.log(`✓ ${file} completed`)
    }

    console.log('All migrations completed successfully')
    process.exit(0)
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  }
}

if (isMainModule(import.meta.url)) {
  runAllMigrations()
}
