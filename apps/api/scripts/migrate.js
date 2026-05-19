import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { logger } from '../src/lib/logger.js'
import { ensureReservationsSchema, ensureStaffAppSchema } from '../src/lib/migrator.js'
import { pool } from '../src/lib/db.js'
import { disconnectCache } from '../src/lib/cache.js'
import { isTenantRoleBackfillComplete } from './migrate-users-to-roles.js'
import { isOrgMigrationComplete } from '../src/lib/supplier-org.js'
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
    await Promise.all([ensureStaffAppSchema(), ensureReservationsSchema()])

    const skipRoleBackfill = process.env.SKIP_TENANT_ROLE_BACKFILL === '1'
    if (skipRoleBackfill) {
      logger.info('SKIP_TENANT_ROLE_BACKFILL=1 — tenant role backfill skipped')
    } else if (await isTenantRoleBackfillComplete()) {
      logger.info('Tenant role backfill already complete — skipped')
    } else {
      await runNodeScript('migrate-users-to-roles.js')
    }

    const skipOrgMigration = process.env.SKIP_SUPPLIER_ORG_MIGRATION === '1'
    if (skipOrgMigration) {
      logger.info('SKIP_SUPPLIER_ORG_MIGRATION=1 — supplier org backfill skipped')
    } else if (await isOrgMigrationComplete()) {
      logger.info('Supplier org backfill already complete — skipped')
    } else {
      await runNodeScript('migrate-suppliers-to-orgs.js')
    }

    logger.info('SQL migrations, runtime schema checks, and tenant role backfill completed')
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
