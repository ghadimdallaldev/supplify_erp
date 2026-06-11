/**
 * Supplier inventory stock status (catalog on-hand qty vs reorder threshold).
 *
 * Boundary: inclusive upper bound (<=), aligned with restaurant inventory.
 * - Out of stock: available_qty <= 0
 * - Low stock: available_qty > 0 AND available_qty <= low_stock_threshold
 * - In stock: available_qty > low_stock_threshold
 *
 * Default threshold matches product_inventory_settings column default (migration 0002).
 */
export const DEFAULT_SUPPLIER_LOW_STOCK_THRESHOLD = 10

/**
 * @param {number|string|null|undefined} availableQty
 * @param {number|string|null|undefined} [lowStockThreshold]
 * @returns {{
 *   isOutOfStock: boolean,
 *   isLowStock: boolean,
 *   isInStock: boolean,
 *   lowStockThreshold: number,
 *   stockStatus: 'OUT_OF_STOCK' | 'LOW_STOCK' | 'IN_STOCK',
 * }}
 */
export function computeSupplierStockFlags(availableQty, lowStockThreshold) {
  const qty = Number(availableQty) || 0
  const parsedThreshold =
    lowStockThreshold != null && lowStockThreshold !== ''
      ? Number(lowStockThreshold)
      : DEFAULT_SUPPLIER_LOW_STOCK_THRESHOLD
  const threshold = Number.isFinite(parsedThreshold)
    ? parsedThreshold
    : DEFAULT_SUPPLIER_LOW_STOCK_THRESHOLD

  const isOutOfStock = qty <= 0
  const isLowStock = !isOutOfStock && qty <= threshold
  const isInStock = !isOutOfStock && !isLowStock

  return {
    isOutOfStock,
    isLowStock,
    isInStock,
    lowStockThreshold: threshold,
    stockStatus: isOutOfStock ? 'OUT_OF_STOCK' : isLowStock ? 'LOW_STOCK' : 'IN_STOCK',
  }
}
