import { query } from './db.js'

let cachedSupplierCol = null
let cachedOwnerInsert = null

/** Resolve warehouse.supplier_id vs warehouse.tenant_id column name (for filters). */
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

/**
 * INSERT spec when legacy supplier_id and tenant_id both exist (same supplier UUID).
 */
export async function getWarehouseOwnerInsertSpec(db = query) {
  if (cachedOwnerInsert) return cachedOwnerInsert
  const { rows } = await db(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'warehouse'
       AND column_name IN ('supplier_id', 'tenant_id')`
  )
  const names = new Set(rows.map((r) => r.column_name))
  if (names.has('tenant_id') && names.has('supplier_id')) {
    cachedOwnerInsert = {
      columns: 'tenant_id, supplier_id',
      placeholders: '$1, $1',
      filterColumn: 'tenant_id',
    }
  } else if (names.has('tenant_id')) {
    cachedOwnerInsert = {
      columns: 'tenant_id',
      placeholders: '$1',
      filterColumn: 'tenant_id',
    }
  } else {
    cachedOwnerInsert = {
      columns: 'supplier_id',
      placeholders: '$1',
      filterColumn: 'supplier_id',
    }
  }
  return cachedOwnerInsert
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

  const owner = await getWarehouseOwnerInsertSpec((sql, params) => client.query(sql, params))
  const address = formatAddressForWarehouse(supplier.address_json)
  const warehouseName = `${supplier.name} Warehouse`

  const { rows } = await client.query(
    `INSERT INTO warehouse (
      ${owner.columns}, name, code, address, is_default, is_main, is_active
    ) VALUES (${owner.placeholders}, $2, 'MAIN', $3, TRUE, TRUE, TRUE)
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

/**
 * Create a default warehouse when the supplier's plan allows warehouses (Silver+).
 * Skipped on Free registration; call when opening warehouse management after upgrade.
 */
export async function ensureDefaultWarehouseForPaidSupplier(supplierId) {
  const { getTenantSubscription } = await import('./subscription.js')
  const subscription = await getTenantSubscription(supplierId, 'SUPPLIER')
  if (!subscription) return null

  const rawLimit = subscription.limits?.warehouses
  const limit =
    rawLimit === -1 || rawLimit === null || rawLimit === undefined ? null : parseInt(rawLimit, 10)
  if (limit === 0) return null

  const supplierCol = await getWarehouseSupplierColumn()
  const { rows: existing } = await query(
    `SELECT id FROM warehouse WHERE ${supplierCol} = $1 AND is_active = TRUE LIMIT 1`,
    [supplierId]
  )
  if (existing.length) return existing[0].id

  const { rows: supplierRows } = await query(`SELECT * FROM supplier WHERE id = $1`, [supplierId])
  if (!supplierRows.length) return null

  return createDefaultWarehouseForSupplier(query, supplierRows[0])
}
