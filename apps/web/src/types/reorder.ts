// Reorder Suggestion types
export interface ReorderSuggestion {
  id: string
  restaurant_id: string
  product_id: string
  current_qty: number
  low_stock_threshold?: number
  branch_id?: string
  product_name: string
  product_sku: string
  product_unit?: string
  supplier_name: string
  supplier_id: string
  lead_time_days?: number
  moq?: number
  order_multiple?: number
  branch_name?: string
  usage_1day: number
  usage_3day: number
  usage_7day: number
  usage_10day: number
  usage_30day: number
  usage_60day: number
  usage_90day: number
  avg_daily_usage_30day: number
  avg_days_between_restocks: number
  last_order_qty: number
  days_since_last_restock: number
  restock_count_90day: number
  usage_trend: number
  last_order_item_qty: number
  days_of_stock_remaining?: number
  suggested_reorder_qty?: number
  urgency_level: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW'
  confidence_score: number
}

export interface ReorderSuggestionsResponse {
  suggestions: ReorderSuggestion[]
}

export interface ReorderAssistanceItem {
  id: string
  productId?: string | null
  productName: string
  productUnit?: string
  supplierId?: string
  supplierName?: string
  cadenceId?: string
  reasonCode: string
  reasonLabel: string
  urgency: string
  suggestedQty?: number | null
  currentQty?: number
  expiryDate?: string
  scopeType: 'product' | 'cadence' | 'supplier_product'
  scopeId: string
}
