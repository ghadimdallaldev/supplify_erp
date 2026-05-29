import { pool } from '../src/lib/db.js'
import { runAllSqlMigrations } from '../src/lib/sql-migrator.js'
import { isMainModule } from './lib/is-main.mjs'

async function main() {
  try {
    await runAllSqlMigrations()
    process.exit(0)
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

if (isMainModule(import.meta.url)) {
  main()
}
