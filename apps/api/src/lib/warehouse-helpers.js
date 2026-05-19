import { query } from './db.js'

let cachedSupplierCol = null

/** Resolve warehouse.supplier_id vs warehouse.tenant_id column name. */
export async function getWarehouseSupplierColumn(db = query) {
  if (cachedSupplierCol) return cachedSupplierCol
  const { rows } = await db(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'warehouse'
       AND column_name IN ('supplier_id', 'tenant_id')
     ORDER BY CASE column_name WHEN 'tenant_id' THEN 0 ELSE 1 END
     LIMIT 1`
  )
  cachedSupplierCol = rows[0]?.column_name || 'supplier_id'
  return cachedSupplierCol
}

export function warehouseBelongsToSupplier(warehouse, supplierId) {
  const owner = warehouse.tenant_id ?? warehouse.supplier_id
  return owner === supplierId
}

/** Effective default flag (is_default or legacy is_main). */
export function isDefaultWarehouse(warehouse) {
  return Boolean(warehouse.is_default ?? warehouse.is_main)
}

export function isMultiWarehouseFulfillmentActive(supplier, planMultiWarehouseEnabled) {
  return (
    Boolean(planMultiWarehouseEnabled) &&
    Boolean(supplier.multi_warehouse_enabled) &&
    supplier.fulfillment_mode === 'multi'
  )
}
