/**
 * Supplier stock compatibility layer.
 * Prefer warehouse_inventory when multi-warehouse / warehouses are enabled;
 * keep legacy `inventory` for consumers until all callers migrate.
 */
import { query } from '../lib/db.js'
import { getWarehouseSupplierColumn, isDefaultWarehouse } from '../lib/warehouse-helpers.js'
import { isFeatureEnabled } from '../lib/subscription.js'
import { resolveOrgBillingTenantId } from '../lib/org-billing-tenant.js'

export async function supplierUsesWarehouseInventory(supplierId, { client = null } = {}) {
  const billingId = await resolveOrgBillingTenantId(supplierId, 'SUPPLIER')
  const multiWh = await isFeatureEnabled(billingId, 'SUPPLIER', 'multi_warehouse')
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
 * Heal products that have legacy (or inactive-warehouse) stock but no active warehouse_inventory row.
 * Prefer transferring stock from inactive warehouses; otherwise seed from legacy inventory.
 * Skips products that already have stock on any active warehouse (multi-WH intentional placement).
 */
export async function seedMissingWarehouseInventoryForSupplier(
  supplierId,
  targetWarehouseId,
  { client = null, productIds = null } = {}
) {
  if (!supplierId || !targetWarehouseId) {
    return { seeded: 0, transferredFromInactive: 0 }
  }

  const db = client ? (sql, params) => client.query(sql, params) : query
  const supplierCol = await getWarehouseSupplierColumn((sql, params) => db(sql, params))

  const params = [supplierId]
  let productFilter = ''
  if (productIds?.length) {
    params.push(productIds)
    productFilter = ` AND p.id = ANY($${params.length}::uuid[])`
  }

  const { rows: missing } = await db(
    `
    SELECT
      p.id AS product_id,
      COALESCE(i.available_qty, 0) AS available_qty,
      COALESCE(i.reserved_qty, 0) AS reserved_qty
    FROM product p
    LEFT JOIN inventory i ON i.product_id = p.id
    WHERE p.supplier_id = $1
      ${productFilter}
      AND NOT EXISTS (
        SELECT 1
        FROM warehouse_inventory wi
        JOIN warehouse w ON w.id = wi.warehouse_id
        WHERE wi.product_id = p.id
          AND w.${supplierCol} = $1
          AND w.is_active = TRUE
      )
    `,
    params
  )

  if (!missing.length) {
    return { seeded: 0, transferredFromInactive: 0 }
  }

  const missingIds = missing.map((row) => row.product_id)
  const { rows: inactiveStock } = await db(
    `
    SELECT wi.product_id, wi.warehouse_id, wi.quantity_available, wi.quantity_reserved
    FROM warehouse_inventory wi
    JOIN warehouse w ON w.id = wi.warehouse_id
    WHERE w.${supplierCol} = $1
      AND w.is_active = FALSE
      AND wi.product_id = ANY($2::uuid[])
    `,
    [supplierId, missingIds]
  )

  const inactiveByProduct = new Map()
  for (const row of inactiveStock) {
    const current = inactiveByProduct.get(row.product_id) || {
      available: 0,
      reserved: 0,
      warehouseIds: [],
    }
    current.available += Number(row.quantity_available) || 0
    current.reserved += Number(row.quantity_reserved) || 0
    current.warehouseIds.push(row.warehouse_id)
    inactiveByProduct.set(row.product_id, current)
  }

  const { upsertWarehouseInventoryFromInventory } = await import('./supplier-inventory.service.js')

  let seeded = 0
  let transferredFromInactive = 0

  for (const row of missing) {
    const inactive = inactiveByProduct.get(row.product_id)
    if (inactive && (inactive.available > 0 || inactive.reserved > 0)) {
      await db(
        `INSERT INTO warehouse_inventory (
           warehouse_id, product_id, quantity_available, quantity_reserved, quantity_on_hand, updated_at
         ) VALUES ($1, $2, $3, $4, $3 + $4, now())
         ON CONFLICT (warehouse_id, product_id) DO UPDATE SET
           quantity_available = warehouse_inventory.quantity_available + EXCLUDED.quantity_available,
           quantity_reserved = warehouse_inventory.quantity_reserved + EXCLUDED.quantity_reserved,
           quantity_on_hand = warehouse_inventory.quantity_on_hand + EXCLUDED.quantity_on_hand,
           updated_at = now()`,
        [targetWarehouseId, row.product_id, inactive.available, inactive.reserved]
      )
      await db(
        `DELETE FROM warehouse_inventory
         WHERE product_id = $1 AND warehouse_id = ANY($2::uuid[])`,
        [row.product_id, [...new Set(inactive.warehouseIds)]]
      )
      transferredFromInactive += 1
      seeded += 1
      continue
    }

    await upsertWarehouseInventoryFromInventory(client, {
      warehouseId: targetWarehouseId,
      productId: row.product_id,
      availableQty: row.available_qty,
      reservedQty: row.reserved_qty || 0,
    })
    seeded += 1
  }

  return { seeded, transferredFromInactive }
}

/**
 * Move all warehouse_inventory rows from one warehouse onto another (merge quantities).
 */
export async function transferWarehouseInventory(client, fromWarehouseId, toWarehouseId) {
  if (!fromWarehouseId || !toWarehouseId || fromWarehouseId === toWarehouseId) {
    return { transferred: 0 }
  }

  const db = client?.query ? (sql, params) => client.query(sql, params) : query
  const { rows } = await db(
    `SELECT product_id, quantity_available, quantity_reserved, quantity_on_hand,
            reorder_point, reorder_quantity
     FROM warehouse_inventory WHERE warehouse_id = $1`,
    [fromWarehouseId]
  )

  for (const row of rows) {
    await db(
      `INSERT INTO warehouse_inventory (
         warehouse_id, product_id, quantity_available, quantity_reserved, quantity_on_hand,
         reorder_point, reorder_quantity, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (warehouse_id, product_id) DO UPDATE SET
         quantity_available = warehouse_inventory.quantity_available + EXCLUDED.quantity_available,
         quantity_reserved = warehouse_inventory.quantity_reserved + EXCLUDED.quantity_reserved,
         quantity_on_hand = warehouse_inventory.quantity_on_hand + EXCLUDED.quantity_on_hand,
         reorder_point = COALESCE(warehouse_inventory.reorder_point, EXCLUDED.reorder_point),
         reorder_quantity = COALESCE(warehouse_inventory.reorder_quantity, EXCLUDED.reorder_quantity),
         updated_at = now()`,
      [
        toWarehouseId,
        row.product_id,
        Number(row.quantity_available) || 0,
        Number(row.quantity_reserved) || 0,
        Number(row.quantity_on_hand) || 0,
        row.reorder_point,
        row.reorder_quantity,
      ]
    )
  }

  if (rows.length) {
    await db(`DELETE FROM warehouse_inventory WHERE warehouse_id = $1`, [fromWarehouseId])
  }

  return { transferred: rows.length }
}

/**
 * Ensure a default warehouse exists for stock-controlled paid suppliers.
 * Seeds inventory from legacy only when a warehouse is newly created.
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
  await seedMissingWarehouseInventoryForSupplier(supplierId, warehouse.id, { client })
  return warehouse
}
