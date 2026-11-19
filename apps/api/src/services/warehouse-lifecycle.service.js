import { getWarehouseSupplierColumn } from '../lib/warehouse-helpers.js'
import { transferWarehouseInventory } from './supplier-stock.service.js'
import { syncLegacyMirrorFromWarehouse } from './supplier-order-stock.service.js'
import { ConflictError, NotFoundError, ValidationError } from '../middlewares/errorHandler.js'
import { writeAuditLog } from '../lib/audit.js'

/** Caller owns the transaction. Lock the supplier before warehouses, then stock rows. */
export async function deactivateSupplierWarehouse(
  client,
  {
    supplierId,
    warehouseId,
    destinationWarehouseId = null,
    confirmTransfer = false,
    actorId = null,
    requestId = null,
  }
) {
  const owner = await getWarehouseSupplierColumn((sql, params) => client.query(sql, params))
  await client.query('SELECT id FROM supplier WHERE id = $1 FOR UPDATE', [supplierId])
  const ids = [...new Set([warehouseId, destinationWarehouseId].filter(Boolean))].sort()
  const { rows: warehouses } = await client.query(
    `SELECT * FROM warehouse WHERE id = ANY($1::uuid[]) AND ${owner} = $2 ORDER BY id FOR UPDATE`,
    [ids, supplierId]
  )
  const warehouse = warehouses.find((row) => row.id === warehouseId)
  if (!warehouse) throw new NotFoundError('Warehouse not found')
  // An already committed retry must not transfer anything again.
  if (warehouse.is_active === false) return warehouse
  if (destinationWarehouseId === warehouseId)
    throw new ValidationError('Choose a different destination warehouse')
  const destination = warehouses.find(
    (row) => row.id === destinationWarehouseId && row.is_active === true
  )
  if (destinationWarehouseId && !destination)
    throw new ValidationError('Destination must be an active warehouse of this supplier')
  const { rows: assignments } = await client.query(
    `SELECT id FROM order_warehouse_assignment WHERE warehouse_id = $1
     AND status NOT IN ('delivered', 'failed', 'superseded') LIMIT 1`,
    [warehouseId]
  )
  if (assignments.length)
    throw new ConflictError('Cannot deactivate warehouse with active fulfillment assignments')
  const { rows: stock } = await client.query(
    `SELECT product_id, quantity_available, quantity_reserved, quantity_on_hand
     FROM warehouse_inventory WHERE warehouse_id = $1 ORDER BY product_id FOR UPDATE`,
    [warehouseId]
  )
  if (stock.some((row) => Number(row.quantity_reserved) !== 0)) {
    throw new ConflictError(
      'Warehouse has reserved stock; resolve reservations before deactivation'
    )
  }
  const hasStock = stock.some(
    (row) => Number(row.quantity_available) !== 0 || Number(row.quantity_on_hand) !== 0
  )
  if (hasStock && (!destination || confirmTransfer !== true)) {
    throw new ConflictError(
      'Choose a destination and confirm the stock transfer before deactivation',
      { destinationRequired: true }
    )
  }
  const { rows: others } = await client.query(
    `SELECT id FROM warehouse WHERE ${owner} = $1 AND id <> $2 AND is_active = TRUE ORDER BY id`,
    [supplierId, warehouseId]
  )
  if ((warehouse.is_default || warehouse.is_main) && others.length && !destination) {
    throw new ConflictError('Choose the replacement default warehouse before deactivation')
  }
  if (hasStock) await transferWarehouseInventory(client, warehouseId, destination.id)
  if (!others.length) {
    // Warehouse mode was authoritative. Do not revive a stale legacy mirror when
    // removing the final empty warehouse makes mode resolution fall back to legacy.
    await client.query(
      `UPDATE inventory i SET available_qty = 0, reserved_qty = 0, updated_at = now()
      FROM product p WHERE p.id = i.product_id AND p.supplier_id = $1`,
      [supplierId]
    )
  }
  const { rows } = await client.query(
    `UPDATE warehouse SET is_active = FALSE, is_default = FALSE, is_main = FALSE, updated_at = now()
     WHERE id = $1 AND ${owner} = $2 RETURNING *`,
    [warehouseId, supplierId]
  )
  if (warehouse.is_default || warehouse.is_main) {
    if (destination)
      await client.query('UPDATE warehouse SET is_default = TRUE, is_main = TRUE WHERE id = $1', [
        destination.id,
      ])
    await client.query('UPDATE supplier SET default_warehouse_id = $1 WHERE id = $2', [
      destination?.id ?? null,
      supplierId,
    ])
  } else {
    await client.query(
      'UPDATE supplier SET default_warehouse_id = $1 WHERE id = $2 AND default_warehouse_id = $3',
      [destination?.id ?? null, supplierId, warehouseId]
    )
  }
  for (const row of stock)
    await syncLegacyMirrorFromWarehouse(client, { supplierId, productId: row.product_id })
  await writeAuditLog(
    { userData: { id: actorId }, requestId },
    {
      action_type: 'warehouse.deactivated',
      tenant_type: 'SUPPLIER',
      tenant_id: supplierId,
      target_id: warehouseId,
      payload_json: {
        resource_type: 'warehouse',
        destinationWarehouseId,
        transferredProducts: hasStock ? stock.length : 0,
      },
    },
    { client, required: true }
  )
  return rows[0]
}
