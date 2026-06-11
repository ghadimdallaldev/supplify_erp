// Inventory types
export interface Inventory {
  product_id: string
  available_qty: number
  updated_at: string
  product_name?: string
  sku?: string
  supplier_name?: string
}

export interface UpdateInventoryRequest {
  availableQty: number
}
