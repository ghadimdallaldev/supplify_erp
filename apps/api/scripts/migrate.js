import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { logger } from '../src/lib/logger.js'
import { ensureReservationsSchema, ensureStaffAppSchema } from '../src/lib/migrator.js'
import { pool } from '../src/lib/db.js'
import { isMainModule } from './lib/is-main.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

function runNodeScript(scriptName) {
  return new Promise((resolve, reject) => {
    const scriptPath = join(__dirname, scriptName)
    const child = spawn(process.execPath, [scriptPath], { stdio: 'inherit', env: process.env })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${scriptName} exited with code ${code}`))
    })
  })
}

async function runMigrations() {
  try {
    await runNodeScript('run-migration.js')
    await ensureStaffAppSchema()
    await ensureReservationsSchema()
    await runNodeScript('migrate-users-to-roles.js')
    logger.info('SQL migrations, runtime schema checks, and tenant role backfill completed')
  } catch (error) {
    logger.error('Migration failed:', error)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

if (isMainModule(import.meta.url)) {
  runMigrations()
}
