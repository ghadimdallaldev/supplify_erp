import { query, migrationQuery } from './db.js'
import { logger } from './logger.js'

const BRANDING_COLUMNS_DDL = `
  ADD COLUMN IF NOT EXISTS brand_primary VARCHAR(7),
  ADD COLUMN IF NOT EXISTS brand_accent VARCHAR(7),
  ADD COLUMN IF NOT EXISTS brand_display_name VARCHAR(120)
`

export async function brandingColumnsExist(table) {
  const { rows } = await query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = $1
       AND column_name = 'brand_primary'
     LIMIT 1`,
    [table]
  )
  return rows.length > 0
}

/**
 * Idempotent tenant branding DDL — uses migration connection so ALTER TABLE works
 * on hosts where the app pool targets a transaction pooler.
 */
export async function ensureTenantBrandingSchema() {
  await migrationQuery(`ALTER TABLE restaurant ${BRANDING_COLUMNS_DDL}`)
  await migrationQuery(`ALTER TABLE supplier ${BRANDING_COLUMNS_DDL}`)

  const supplierOk = await brandingColumnsExist('supplier')
  const restaurantOk = await brandingColumnsExist('restaurant')
  if (!supplierOk || !restaurantOk) {
    logger.error('Tenant branding schema ensure finished but columns are still missing', {
      supplierOk,
      restaurantOk,
    })
    throw new Error('Tenant branding columns could not be created')
  }

  logger.info('Tenant branding schema ensure completed')
}
