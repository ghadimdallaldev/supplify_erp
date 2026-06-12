import { query } from './db.js'

/** @type {'warehouse' | 'branch' | 'none' | null} */
let cachedDeliveryZoneJoinMode = null

async function resolveDeliveryZoneJoinMode() {
  if (cachedDeliveryZoneJoinMode) return cachedDeliveryZoneJoinMode

  const { rows } = await query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'delivery_zone'
      AND column_name IN ('warehouse_id', 'branch_id', 'supplier_id')
    `
  )
  const columns = new Set(rows.map((row) => row.column_name))

  if (columns.has('warehouse_id')) {
    cachedDeliveryZoneJoinMode = 'warehouse'
  } else if (columns.has('branch_id')) {
    cachedDeliveryZoneJoinMode = 'branch'
  } else {
    cachedDeliveryZoneJoinMode = 'none'
  }

  return cachedDeliveryZoneJoinMode
}

/**
 * SQL fragment for joining delivery_zone to customer_order rows.
 * Supports supplier warehouse zones and consumer branch zones.
 */
export async function getDeliveryZoneJoinSql({ supplierParam } = {}) {
  const mode = await resolveDeliveryZoneJoinMode()

  if (mode === 'warehouse') {
    if (supplierParam) {
      return `LEFT JOIN delivery_zone dz ON dz.warehouse_id = owa.warehouse_id AND dz.supplier_id = ${supplierParam}`
    }
    return `LEFT JOIN delivery_zone dz ON dz.warehouse_id = owa.warehouse_id`
  }

  if (mode === 'branch') {
    return `LEFT JOIN delivery_zone dz ON dz.branch_id = o.branch_id AND COALESCE(dz.is_active, TRUE) = TRUE`
  }

  return `LEFT JOIN delivery_zone dz ON FALSE`
}

/** Reset cached schema mode after DDL (startup ensure / tests). */
export function resetDeliveryZoneJoinCache() {
  cachedDeliveryZoneJoinMode = null
}

/** @deprecated use resetDeliveryZoneJoinCache */
export function resetDeliveryZoneJoinCacheForTests() {
  resetDeliveryZoneJoinCache()
}
