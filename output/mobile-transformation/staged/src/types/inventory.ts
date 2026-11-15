export type InventoryAdjustmentType = 'WASTAGE' | 'SPOILAGE' | 'COUNT_CORRECTION' | 'OTHER'

export type WasteCategory =
  | 'OVER_PRODUCTION'
  | 'SPOILAGE'
  | 'BREAKAGE'
  | 'EXPIRED'
  | 'OVERPORTIONING'
  | 'OTHER'

export type RestaurantInventoryItem = {
  id: string
  product_id: string
  product_name?: string
  sku?: string
  /** Canonical on-hand quantity from API `quantity`. */
  quantity?: number
  /** Legacy alias kept for older screens. */
  quantity_on_hand?: number
  unit?: string
  /** Canonical par from API `low_stock_threshold`. */
  low_stock_threshold?: number
  /** Legacy alias kept for older screens. */
  par_level?: number
  category?: string
  updated_at?: string
}

export type AdjustInventoryBody = {
  productId: string
  adjustmentType: InventoryAdjustmentType
  quantity: number
  reason?: string
  wasteCategory?: WasteCategory
  unitCost?: number
}

export type AddInventoryBody = {
  productId: string
  quantity: number
  reason?: string
}

export type PatchInventoryBody = {
  productId: string
  quantity?: number
  lowStockThreshold?: number
}

export type ExpirySummary = {
  expiringSoon?: number
  expired?: number
  totalLots?: number
  expiringSoonCount?: number
  expiredCount?: number
}

export function inventoryQuantity(item: RestaurantInventoryItem): number {
  return Number(item.quantity ?? item.quantity_on_hand ?? 0)
}

export function inventoryParLevel(item: RestaurantInventoryItem): number | undefined {
  const par = item.low_stock_threshold ?? item.par_level
  return par != null ? Number(par) : undefined
}
