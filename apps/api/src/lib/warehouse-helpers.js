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

function formatAddressForWarehouse(addressJson) {
  if (!addressJson || typeof addressJson !== 'object') return null
  const parts = [
    addressJson.street,
    addressJson.city,
    addressJson.region,
    addressJson.country,
    addressJson.postalCode ?? addressJson.zip,
  ].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

/**
 * Create the default warehouse for a new supplier branch (transaction-safe).
 */
export async function createDefaultWarehouseForSupplier(client, supplier, db = query) {
  const getCol =
    db === query
      ? async () => getWarehouseSupplierColumn(db)
      : async () => getWarehouseSupplierColumn((sql, params) => client.query(sql, params))

  const supplierCol = await getCol()
  const address = formatAddressForWarehouse(supplier.address_json)
  const warehouseName = `${supplier.name} Warehouse`

  const { rows } = await client.query(
    `INSERT INTO warehouse (
      ${supplierCol}, name, code, address, is_default, is_main, is_active
    ) VALUES ($1, $2, 'MAIN', $3, TRUE, TRUE, TRUE)
    RETURNING id`,
    [supplier.id, warehouseName, address]
  )

  const warehouseId = rows[0].id

  await client.query(
    `UPDATE supplier
     SET default_warehouse_id = $1,
         fulfillment_mode = 'single',
         updated_at = now()
     WHERE id = $2`,
    [warehouseId, supplier.id]
  )

  return warehouseId
}
