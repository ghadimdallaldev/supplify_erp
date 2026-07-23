/**
 * Supplier stock compatibility layer.
 * Prefer warehouse_inventory when multi-warehouse / warehouses are enabled;
 * keep legacy `inventory` for consumers until all callers migrate.
 */
import { query } from '../lib/db.js'
import { getWarehouseSupplierColumn, isDefaultWarehouse } from '../lib/warehouse-helpers.js'
import { hasFeature } from '../lib/subscription.js'
import { resolveOrgBillingTenantId } from '../lib/org-billing-tenant.js'

export async function supplierUsesWarehouseInventory(supplierId, { client = null } = {}) {
  const billingId = await resolveOrgBillingTenantId(supplierId, 'SUPPLIER')
  const multiWh = await hasFeature(billingId, 'SUPPLIER', 'multi_warehouse')
  if (multiWh) return true

  const db = client ? (sql, params) => client.query(sql, params) : query
  const supplierCol = await getWarehouseSupplierColumn((sql, params) => db(sql, params))
  const { rows } = await db(
    `SELECT COUNT(*)::int AS c FROM warehouse WHERE ${supplierCol} = $1 AND is_active = TRUE`,
    [supplierId]
  )
  return Number(rows[0]?.c || 0) > 0
}

/**
 * Aggregate available qty for a product across active warehouses, falling back to inventory.
 */
export async function getSupplierProductAvailableQty(supplierId, productId) {
  if (await supplierUsesWarehouseInventory(supplierId)) {
    const supplierCol = await getWarehouseSupplierColumn()
    const { rows } = await query(
      `
      SELECT COALESCE(SUM(wi.quantity_available), 0)::numeric AS available
      FROM warehouse_inventory wi
      JOIN warehouse w ON w.id = wi.warehouse_id
      WHERE wi.product_id = $1 AND w.${supplierCol} = $2 AND w.is_active = TRUE
      `,
      [productId, supplierId]
    )
    return Number(rows[0]?.available || 0)
  }

  const { rows } = await query(`SELECT available_qty FROM inventory WHERE product_id = $1`, [
    productId,
  ])
  return Number(rows[0]?.available_qty || 0)
}

/**
 * Supplier-wide stock display: aggregate warehouse rows when enabled, else legacy inventory.
 */
export async function listSupplierStockDisplay(supplierId, { productIds = null } = {}) {
  const useWh = await supplierUsesWarehouseInventory(supplierId)

  if (useWh) {
    const supplierCol = await getWarehouseSupplierColumn()
    const params = [supplierId]
    let productClause = ''
    if (productIds?.length) {
      params.push(productIds)
      productClause = ` AND wi.product_id = ANY($${params.length}::uuid[])`
    }
    const { rows } = await query(
      `
      SELECT
        wi.product_id,
        COALESCE(SUM(wi.quantity_available), 0)::numeric AS available_qty,
        COALESCE(SUM(wi.quantity_reserved), 0)::numeric AS reserved_qty,
        COALESCE(SUM(wi.quantity_on_hand), 0)::numeric AS on_hand_qty,
        'warehouse_inventory' AS source
      FROM warehouse_inventory wi
      JOIN warehouse w ON w.id = wi.warehouse_id
      WHERE w.${supplierCol} = $1 AND w.is_active = TRUE
      ${productClause}
      GROUP BY wi.product_id
      ORDER BY wi.product_id
      `,
      params
    )
    return rows
  }

  const params = []
  let productClause = ''
  if (productIds?.length) {
    params.push(productIds)
    productClause = ` WHERE product_id = ANY($1::uuid[])`
  }
  const { rows } = await query(
    `
    SELECT product_id, available_qty, reserved_qty,
           (available_qty + reserved_qty) AS on_hand_qty,
           'inventory' AS source
    FROM inventory
    ${productClause}
    ORDER BY product_id
    `,
    params
  )
  return rows
}

/**
 * Ensure a default warehouse exists for stock-controlled paid suppliers.
 * Non-destructive: creates warehouse row when missing; does not mutate inventory quantities.
 */
export async function ensureDefaultWarehouseForSupplier(supplierId, { client = null } = {}) {
  const db = client ? (sql, params) => client.query(sql, params) : query
  const supplierCol = await getWarehouseSupplierColumn((sql, params) => db(sql, params))

  const { rows: existing } = await db(
    `SELECT * FROM warehouse WHERE ${supplierCol} = $1 AND is_active = TRUE ORDER BY created_at`,
    [supplierId]
  )
  if (existing.length) {
    const def = existing.find((w) => isDefaultWarehouse(w)) || existing[0]
    await db(
      `UPDATE supplier SET default_warehouse_id = COALESCE(default_warehouse_id, $2), updated_at = NOW()
       WHERE id = $1 AND default_warehouse_id IS NULL`,
      [supplierId, def.id]
    )
    return def
  }

  const { rows: inserted } = await db(
    `
    INSERT INTO warehouse (${supplierCol}, name, is_active, is_default, is_main)
    VALUES ($1, 'Default Warehouse', TRUE, TRUE, TRUE)
    RETURNING *
    `,
    [supplierId]
  )
  const warehouse = inserted[0]
  await db(`UPDATE supplier SET default_warehouse_id = $2, updated_at = NOW() WHERE id = $1`, [
    supplierId,
    warehouse.id,
  ])
  return warehouse
}
