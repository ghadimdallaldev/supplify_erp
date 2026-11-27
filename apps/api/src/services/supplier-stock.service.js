/**
 * Supplier stock compatibility layer.
 * Prefer warehouse_inventory when multi-warehouse / warehouses are enabled;
 * keep legacy `inventory` for consumers until all callers migrate.
 */
import { query } from '../lib/db.js'
import { getWarehouseSupplierColumn, isDefaultWarehouse } from '../lib/warehouse-helpers.js'
import { isFeatureEnabled } from '../lib/subscription.js'
import { resolveOrgBillingTenantId } from '../lib/org-billing-tenant.js'

/** Plan side of the warehouse-stock decision (feature checks are cached per tenant). */
async function supplierHasWarehouseFeature(supplierId, db = query) {
  const options = { dbQuery: db }
  const billingId = await resolveOrgBillingTenantId(supplierId, 'SUPPLIER', options)
  // Single-warehouse (Silver+) and multi-warehouse (Gold+) both use warehouse_inventory
  // when the supplier has at least one active warehouse.
  // Scoped reads can create a compatibility subscription. Serialize them on the client.
  const warehousesFeature = await isFeatureEnabled(billingId, 'SUPPLIER', 'warehouses', options)
  const multiWh = await isFeatureEnabled(billingId, 'SUPPLIER', 'multi_warehouse', options)
  return Boolean(warehousesFeature || multiWh)
}

export async function supplierUsesWarehouseInventory(supplierId, { client = null } = {}) {
  const db = client ? (sql, params) => client.query(sql, params) : query
  const warehousesFeature = await supplierHasWarehouseFeature(supplierId, db)
  // Without the feature the answer is false whatever the warehouse count; skip the COUNT.
  if (!warehousesFeature) return false

  const supplierCol = await getWarehouseSupplierColumn((sql, params) => db(sql, params))
  const { rows } = await db(
    `SELECT COUNT(*)::int AS c FROM warehouse WHERE ${supplierCol} = $1 AND is_active = TRUE`,
    [supplierId]
  )
  return Number(rows[0]?.c || 0) >= 1
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
export async function listSupplierStockDisplay(
  supplierId,
  { productIds = null, dbQuery = query } = {}
) {
  const useWh = await supplierUsesWarehouseInventory(supplierId, {
    client: dbQuery === query ? null : { query: dbQuery },
  })
  const db = dbQuery

  if (useWh) {
    const supplierCol = await getWarehouseSupplierColumn(db)
    const params = [supplierId]
    let productClause = ''
    if (productIds?.length) {
      params.push(productIds)
      productClause = ` AND wi.product_id = ANY($${params.length}::uuid[])`
    }
    const { rows } = await db(
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
  const { rows } = await db(
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
 * Overlay product list/detail rows with checkout-authoritative stock.
 * When a supplier uses warehouse inventory, missing WH rows mean 0 (fail-closed),
 * never fall back to legacy `inventory` qty.
 *
 * @param {Array<{ id: string, supplier_id?: string, available_qty?: number }>} productRows
 * @returns {Promise<typeof productRows>}
 */
export async function overlayProductRowsWithAuthoritativeStock(productRows) {
  if (!Array.isArray(productRows) || productRows.length === 0) return productRows

  const bySupplier = new Map()
  for (const row of productRows) {
    const supplierId = row.supplier_id
    if (!supplierId || !row.id) continue
    if (!bySupplier.has(supplierId)) bySupplier.set(supplierId, [])
    bySupplier.get(supplierId).push(row)
  }
  if (bySupplier.size === 0) return productRows

  // Batched (Plan A Task 11): one warehouse lookup and one stock query for the whole page,
  // instead of a COUNT + aggregate per supplier.
  const supplierCol = await getWarehouseSupplierColumn()
  const supplierIds = [...bySupplier.keys()]
  const { rows: whRows } = await query(
    `SELECT DISTINCT ${supplierCol} AS supplier_id FROM warehouse
     WHERE ${supplierCol} = ANY($1::uuid[]) AND is_active = TRUE`,
    [supplierIds]
  )
  const withWarehouse = new Set(whRows.map((r) => String(r.supplier_id)))
  const candidates = supplierIds.filter((id) => withWarehouse.has(String(id)))
  const featureFlags = await Promise.all(candidates.map((id) => supplierHasWarehouseFeature(id)))
  const warehouseSuppliers = candidates.filter((_, i) => featureFlags[i])
  if (!warehouseSuppliers.length) return productRows

  const productIds = warehouseSuppliers.flatMap((id) => bySupplier.get(id).map((p) => p.id))
  const { rows: stockRows } = await query(
    `SELECT wi.product_id, COALESCE(SUM(wi.quantity_available), 0)::numeric AS available_qty
     FROM warehouse_inventory wi
     JOIN warehouse w ON w.id = wi.warehouse_id AND w.is_active = TRUE
     JOIN product p ON p.id = wi.product_id AND p.supplier_id = w.${supplierCol}
     WHERE w.${supplierCol} = ANY($1::uuid[]) AND wi.product_id = ANY($2::uuid[])
     GROUP BY wi.product_id`,
    [warehouseSuppliers, productIds]
  )
  const authoritativeQty = new Map(productIds.map((id) => [id, 0])) // fail closed
  for (const stock of stockRows) {
    authoritativeQty.set(stock.product_id, Number(stock.available_qty ?? 0))
  }

  return productRows.map((row) =>
    authoritativeQty.has(row.id) ? { ...row, available_qty: authoritativeQty.get(row.id) } : row
  )
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
    FOR UPDATE OF wi
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

    // Insert only. ON CONFLICT DO UPDATE would copy a stale legacy quantity over a
    // reservation another checkout already committed on this row.
    const available = Number(row.available_qty) || 0
    const reserved = Number(row.reserved_qty) || 0
    await db(
      `INSERT INTO warehouse_inventory (
         warehouse_id, product_id, quantity_available, quantity_reserved, quantity_on_hand, updated_at
       ) VALUES ($1, $2, $3, $4, $3, now())
       ON CONFLICT (warehouse_id, product_id) DO NOTHING`,
      [targetWarehouseId, row.product_id, available, reserved]
    )
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
     FROM warehouse_inventory WHERE warehouse_id = $1 ORDER BY product_id FOR UPDATE`,
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
