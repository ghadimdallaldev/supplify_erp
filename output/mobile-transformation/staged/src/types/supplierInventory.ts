export type SupplierInventoryItem = {
  id: string
  product_id: string
  product_name?: string
  sku?: string
  available_qty: number
  reserved_qty?: number
  low_stock_threshold?: number
  isLowStock?: boolean
  isOutOfStock?: boolean
  isInStock?: boolean
  stockStatus?: string
  updated_at?: string
}

export type UpdateSupplierInventoryBody = {
  productId: string
  availableQty: number
}
