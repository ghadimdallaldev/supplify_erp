import { query } from './db.js'
import { logger } from './logger.js'

/**
 * Idempotent tenant branding DDL — runs after SQL migrations so /me/branding works
 * even if schema_migrations tracking drifted or migration 0148 failed partway.
 */
const BRANDING_COLUMNS_DDL = `
  ADD COLUMN IF NOT EXISTS brand_primary VARCHAR(7),
  ADD COLUMN IF NOT EXISTS brand_accent VARCHAR(7),
  ADD COLUMN IF NOT EXISTS brand_display_name VARCHAR(120)
`

export async function ensureTenantBrandingSchema() {
  // One ALTER per table — avoids multi-statement issues with some poolers.
  await query(`ALTER TABLE restaurant ${BRANDING_COLUMNS_DDL}`)
  await query(`ALTER TABLE supplier ${BRANDING_COLUMNS_DDL}`)
  logger.info('Tenant branding schema ensure completed')
}
