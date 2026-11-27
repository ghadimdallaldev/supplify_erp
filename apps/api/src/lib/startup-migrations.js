/**
 * Full migration pipeline for API startup and `pnpm db:migrate`.
 * SQL files + runtime schema checks + tenant role backfill + supplier org backfill +
 * category backfill.
 */
import { config } from '../config/env.js'
import { logger } from './logger.js'
import { baseSchemaExists, runAllSqlMigrations } from './sql-migrator.js'
import { ensureDeliverySchema } from './ensure-delivery-schema.js'
import { ensureQuoteRequestSchema } from './ensure-quote-request-schema.js'
import { ensureTenantBrandingSchema } from './ensure-tenant-branding-schema.js'
import { ensureReservationsSchema, ensureStaffAppSchema } from './migrator.js'
import { isOrgMigrationComplete } from './supplier-org.js'
import {
  isTenantRoleBackfillComplete,
  migrateUsersToTenantRoles,
} from '../../scripts/migrate-users-to-roles.js'
import { migrateSuppliersToOrgs } from '../../scripts/migrate-suppliers-to-orgs.js'
import { runCategoryBackfill } from './category-backfill.js'

/**
 * @param {{ force?: boolean }} [options]
 *   force — run even when RUN_MIGRATIONS_ON_START is false (e.g. empty database)
 */
export async function runFullStartupMigrations(options = {}) {
  const hasBaseSchema = await baseSchemaExists()
  const shouldRunBackfills = options.force || config.RUN_MIGRATIONS_ON_START || !hasBaseSchema

  logger.info('Running startup SQL migrations', {
    runMigrationsOnStart: config.RUN_MIGRATIONS_ON_START,
    baseSchemaExists: hasBaseSchema,
    forced: Boolean(options.force),
  })

  // Always apply pending numbered SQL files — new API code depends on them.
  await runAllSqlMigrations()
  await ensureQuoteRequestSchema()
  await ensureTenantBrandingSchema()
  await ensureDeliverySchema()
  await Promise.all([ensureStaffAppSchema(), ensureReservationsSchema()])

  if (!shouldRunBackfills) {
    logger.debug('Startup backfills skipped', {
      runMigrationsOnStart: config.RUN_MIGRATIONS_ON_START,
      baseSchemaExists: hasBaseSchema,
    })
    return { skipped: false, backfillsSkipped: true }
  }

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

  if (process.env.SKIP_CATEGORY_BACKFILL === '1') {
    logger.info('SKIP_CATEGORY_BACKFILL=1 — category backfill skipped')
  } else {
    // Locked and resumable; a verified run returns at once. A failure is recorded in
    // data_migration_run and the API keeps serving (non-leaf ids read as "Other").
    try {
      const stats = await runCategoryBackfill()
      if (!stats.skipped) logger.info('Category backfill finished', { stats })
    } catch (error) {
      logger.error('Category backfill did not finish; it resumes on the next start', {
        error: error.message,
      })
    }
  }

  logger.info('Full startup migrations completed')
  return { skipped: false, backfillsSkipped: false }
}
