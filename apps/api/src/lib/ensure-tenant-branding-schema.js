import { query, migrationQuery } from './db.js'
import { logger } from './logger.js'

const BRANDING_COLUMNS_DDL = `
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS brand_primary VARCHAR(7),
  ADD COLUMN IF NOT EXISTS brand_accent VARCHAR(7),
  ADD COLUMN IF NOT EXISTS brand_display_name VARCHAR(120)
`

export async function columnExists(table, columnName) {
  const { rows } = await query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = $1
       AND column_name = $2
     LIMIT 1`,
    [table, columnName]
  )
  return rows.length > 0
}

/** True when brand color columns are present (used before PATCH). */
export async function brandingColumnsExist(table) {
  return columnExists(table, 'brand_primary')
}

export async function tenantBrandingColumnMap(table) {
  const [logoUrl, brandPrimary, brandAccent, brandDisplayName] = await Promise.all([
    columnExists(table, 'logo_url'),
    columnExists(table, 'brand_primary'),
    columnExists(table, 'brand_accent'),
    columnExists(table, 'brand_display_name'),
  ])
  return { logoUrl, brandPrimary, brandAccent, brandDisplayName }
}

/**
 * Idempotent tenant branding DDL — uses migration connection so ALTER TABLE works
 * on hosts where the app pool targets a transaction pooler.
 */
export async function ensureTenantBrandingSchema() {
  await migrationQuery(`ALTER TABLE restaurant ${BRANDING_COLUMNS_DDL}`)
  await migrationQuery(`ALTER TABLE supplier ${BRANDING_COLUMNS_DDL}`)

  const supplierCols = await tenantBrandingColumnMap('supplier')
  const restaurantCols = await tenantBrandingColumnMap('restaurant')
  const supplierOk = supplierCols.brandPrimary && supplierCols.logoUrl
  const restaurantOk = restaurantCols.brandPrimary && restaurantCols.logoUrl
  if (!supplierOk || !restaurantOk) {
    logger.error('Tenant branding schema ensure finished but columns are still missing', {
      supplierCols,
      restaurantCols,
    })
    throw new Error('Tenant branding columns could not be created')
  }

  logger.info('Tenant branding schema ensure completed')
}
