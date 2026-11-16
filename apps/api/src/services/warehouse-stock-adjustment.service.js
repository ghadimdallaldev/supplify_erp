import Decimal from 'decimal.js'
import { getWarehouseSupplierColumn } from '../lib/warehouse-helpers.js'
import { NotFoundError, ValidationError } from '../middlewares/errorHandler.js'
import { syncLegacyMirrorFromWarehouse } from './supplier-order-stock.service.js'
import { writeAuditLog } from '../lib/audit.js'

/** Explicit counts must not rewrite the reservations owned by order workflows. */
export async function updateWarehouseStock(
  client,
  { supplierId, warehouseId, productId, patch, actorId = null, requestId = null }
) {
  const owner = await getWarehouseSupplierColumn((sql, params) => client.query(sql, params))
  const { rows: warehouses } = await client.query(
    `SELECT id FROM warehouse
    WHERE id = $1 AND ${owner} = $2 AND is_active = TRUE FOR SHARE`,
    [warehouseId, supplierId]
  )
  if (!warehouses.length) throw new NotFoundError('Active warehouse not found')
  const { rows: products } = await client.query(
    'SELECT id FROM product WHERE id = $1 AND supplier_id = $2',
    [productId, supplierId]
  )
  if (!products.length) throw new NotFoundError('Product not found')
  const { rows } = await client.query(
    'SELECT * FROM warehouse_inventory WHERE warehouse_id = $1 AND product_id = $2 FOR UPDATE',
    [warehouseId, productId]
  )
  const current = rows[0]
  const quantities = {}
  for (const field of ['reorder_point', 'reorder_quantity']) {
    if (patch[field] == null) continue
    if (
      typeof patch[field] !== 'number' ||
      !Number.isFinite(patch[field]) ||
      patch[field] < 0 ||
      new Decimal(patch[field]).decimalPlaces() > 3
    ) {
      throw new ValidationError(
        `${field} must be a non-negative number with at most three decimal places`
      )
    }
  }
  for (const field of ['quantity_available', 'quantity_reserved', 'quantity_on_hand']) {
    const value = patch[field] ?? Number(current?.[field] ?? 0)
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
      throw new ValidationError(`${field} must be a non-negative number`)
    if (new Decimal(value).decimalPlaces() > 3)
      throw new ValidationError(`${field} supports at most three decimal places`)
    quantities[field] = value
  }
  if (quantities.quantity_reserved !== Number(current?.quantity_reserved ?? 0))
    throw new ValidationError('Reserved quantity is managed by orders and cannot be overwritten')
  if (!current && patch.quantity_on_hand == null)
    quantities.quantity_on_hand = quantities.quantity_available
  if (
    new Decimal(quantities.quantity_available)
      .plus(quantities.quantity_reserved)
      .gt(quantities.quantity_on_hand)
  ) {
    throw new ValidationError('Available plus reserved quantity must not exceed on-hand quantity')
  }
  const result = await client.query(
    `INSERT INTO warehouse_inventory (
    warehouse_id, product_id, quantity_available, quantity_reserved, quantity_on_hand, reorder_point, reorder_quantity
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (warehouse_id, product_id) DO UPDATE SET quantity_available = EXCLUDED.quantity_available,
      quantity_reserved = EXCLUDED.quantity_reserved, quantity_on_hand = EXCLUDED.quantity_on_hand,
      reorder_point = COALESCE(EXCLUDED.reorder_point, warehouse_inventory.reorder_point),
      reorder_quantity = COALESCE(EXCLUDED.reorder_quantity, warehouse_inventory.reorder_quantity), updated_at = now()
    RETURNING *`,
    [
      warehouseId,
      productId,
      quantities.quantity_available,
      quantities.quantity_reserved,
      quantities.quantity_on_hand,
      patch.reorder_point ?? null,
      patch.reorder_quantity ?? null,
    ]
  )
  await syncLegacyMirrorFromWarehouse(client, { supplierId, productId })
  await writeAuditLog(
    { userData: { id: actorId }, requestId },
    {
      action_type: 'warehouse.stock_adjusted',
      tenant_type: 'SUPPLIER',
      tenant_id: supplierId,
      target_id: warehouseId,
      payload_json: { resource_type: 'warehouse_inventory', productId, quantities },
    },
    { client, required: true }
  )
  return result.rows[0]
}
