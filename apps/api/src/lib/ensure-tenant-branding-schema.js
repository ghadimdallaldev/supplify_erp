import { query } from './db.js'
import { logger } from './logger.js'

/**
 * Idempotent tenant branding DDL — runs after SQL migrations so /me/branding works
 * even if schema_migrations tracking drifted or migration 0148 failed partway.
 */
export async function ensureTenantBrandingSchema() {
  await query(`
    ALTER TABLE restaurant
      ADD COLUMN IF NOT EXISTS brand_primary VARCHAR(7),
      ADD COLUMN IF NOT EXISTS brand_accent VARCHAR(7),
      ADD COLUMN IF NOT EXISTS brand_display_name VARCHAR(120);

    ALTER TABLE supplier
      ADD COLUMN IF NOT EXISTS brand_primary VARCHAR(7),
      ADD COLUMN IF NOT EXISTS brand_accent VARCHAR(7),
      ADD COLUMN IF NOT EXISTS brand_display_name VARCHAR(120);
  `)

  logger.info('Tenant branding schema ensure completed')
}
