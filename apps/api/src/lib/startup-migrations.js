/**
 * Full migration pipeline for API startup and `pnpm db:migrate`.
 * SQL files + runtime schema checks + tenant role backfill + supplier org backfill.
 */
import { config } from '../config/env.js'
import { logger } from './logger.js'
import { baseSchemaExists, runAllSqlMigrations } from './sql-migrator.js'
import { ensureReservationsSchema, ensureStaffAppSchema } from './migrator.js'
import { isOrgMigrationComplete } from './supplier-org.js'
import {
  isTenantRoleBackfillComplete,
  migrateUsersToTenantRoles,
} from '../../scripts/migrate-users-to-roles.js'
import { migrateSuppliersToOrgs } from '../../scripts/migrate-suppliers-to-orgs.js'

/**
 * @param {{ force?: boolean }} [options]
 *   force — run even when RUN_MIGRATIONS_ON_START is false (e.g. empty database)
 */
export async function runFullStartupMigrations(options = {}) {
  const hasBaseSchema = await baseSchemaExists()
  const shouldRun = options.force || config.RUN_MIGRATIONS_ON_START || !hasBaseSchema

  if (!shouldRun) {
    logger.debug('Startup migrations skipped', {
      runMigrationsOnStart: config.RUN_MIGRATIONS_ON_START,
      baseSchemaExists: hasBaseSchema,
    })
    return { skipped: true }
  }

  logger.info('Running full startup migrations', {
    runMigrationsOnStart: config.RUN_MIGRATIONS_ON_START,
    baseSchemaExists: hasBaseSchema,
    forced: Boolean(options.force),
  })

  await runAllSqlMigrations()
  await Promise.all([ensureStaffAppSchema(), ensureReservationsSchema()])

  if (process.env.SKIP_TENANT_ROLE_BACKFILL === '1') {
    logger.info('SKIP_TENANT_ROLE_BACKFILL=1 — tenant role backfill skipped')
  } else if (await isTenantRoleBackfillComplete()) {
    logger.info('Tenant role backfill already complete — skipped')
  } else {
    logger.info('Running tenant role backfill')
    await migrateUsersToTenantRoles()
  }

  if (process.env.SKIP_SUPPLIER_ORG_MIGRATION === '1') {
    logger.info('SKIP_SUPPLIER_ORG_MIGRATION=1 — supplier org backfill skipped')
  } else if (await isOrgMigrationComplete()) {
    logger.info('Supplier org backfill already complete — skipped')
  } else {
    logger.info('Running supplier org backfill')
    await migrateSuppliersToOrgs()
  }

  logger.info('Full startup migrations completed')
  return { skipped: false }
}
