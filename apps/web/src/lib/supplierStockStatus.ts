export const DEFAULT_SUPPLIER_LOW_STOCK_THRESHOLD = 10

export type SupplierStockStatus = 'OUT_OF_STOCK' | 'LOW_STOCK' | 'IN_STOCK'

/**
 * Supplier inventory row status for UI badges.
 * Out of stock is determined from qty first; low stock uses API `isLowStock` when present.
 */
export function resolveSupplierInventoryStatus(item: {
  available_qty?: number | string | null
  isLowStock?: boolean
  low_stock_threshold?: number | string | null
}): { status: SupplierStockStatus; label: string } {
  const qty = parseFloat(String(item.available_qty ?? 0)) || 0
  if (qty <= 0) {
    return { status: 'OUT_OF_STOCK', label: 'Out of stock' }
  }

  const threshold =
    item.low_stock_threshold != null && item.low_stock_threshold !== ''
      ? parseFloat(String(item.low_stock_threshold))
      : DEFAULT_SUPPLIER_LOW_STOCK_THRESHOLD
  const isLowStock =
    item.isLowStock ??
    (Number.isFinite(threshold) ? qty <= threshold : qty <= DEFAULT_SUPPLIER_LOW_STOCK_THRESHOLD)

  if (isLowStock) {
    return { status: 'LOW_STOCK', label: 'Low stock' }
  }

  return { status: 'IN_STOCK', label: 'In stock' }
}

export function countSupplierLowStockItems(
  inventory: Array<{ available_qty?: number | string | null; isLowStock?: boolean }>
): number {
  return inventory.filter((item) => {
    const qty = parseFloat(String(item.available_qty ?? 0)) || 0
    return qty > 0 && Boolean(item.isLowStock)
  }).length
}
