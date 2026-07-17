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
  /** Additive AI context fields (optional; ignored by older clients) */
  leadTimeDays?: number
  moq?: number
  orderMultiple?: number
  avgDailyUsage30?: number
  lowStockThreshold?: number | null
  forecast?: {
    explanation?: string
    confidence?: number
    forecastReorderQty?: number
    reorderByDate?: string | null
  }
}

export type ReorderAiRecommendationSource = 'ai' | 'forecast' | 'rule_based'

export interface ReorderAiUsageLimitMetadata {
  meterType?: string
  periodType?: string
  current?: number
  limit?: number
  resetAt?: string
  trialPool?: boolean
}

export interface ReorderAiRecommendation {
  productId: string
  suggestionId?: string
  source: ReorderAiRecommendationSource
  action: 'order' | 'wait' | 'manual_review'
  recommendedQuantity?: number | null
  supplierId?: string | null
  supplierName?: string
  deliveryDate?: string | null
  priority: string
  confidence: number
  summary: string
  reasoning: string[]
  warnings: string[]
  alternatives?: Array<{
    recommendedQuantity?: number
    supplierId?: string
    rationale?: string
  }>
  dataQuality?: 'good' | 'fair' | 'poor'
  estimatedCost?: number | null
  aiMetadata?: {
    usedLlm?: boolean
    fallbackReason?: string
    normalized?: boolean
    cached?: boolean
  }
}

export interface ReorderAiRecommendResponse {
  recommendations: ReorderAiRecommendation[]
  usedLlm: boolean
  cached?: boolean
  usageLimited?: boolean
  resetAt?: string
  aiUsage?: ReorderAiUsageLimitMetadata
  ai?: ReorderAssistanceResponse['ai']
}

export interface ReorderForecast {
  productId: string
  branchId?: string | null
  productName?: string
  productUnit?: string
  confidence: number
  forecastReorderQty?: number | null
  reorderByDate?: string | null
  explanation?: string
  urgency?: string
}

export interface ReorderAiExplainResult {
  summary: string
  items: Array<{ productId: string; rationale: string }>
  source: 'heuristic' | 'llm'
  usedLlm: boolean
  usageLimited?: boolean
  resetAt?: string
  aiUsage?: ReorderAiUsageLimitMetadata
}

export interface ReorderAiAskResult {
  intent: string
  matchedProducts: Array<{
    productId: string
    qty: number
    confidence: number
    productName?: string
  }>
  clarifyingQuestion?: string
  source: 'heuristic' | 'llm'
  usedLlm: boolean
  usageLimited?: boolean
  resetAt?: string
  aiUsage?: ReorderAiUsageLimitMetadata
}

export interface ReorderAssistanceResponse {
  suggestions: ReorderAssistanceItem[]
  total: number
  smartReorder?: {
    tier: string
    capabilities: Record<string, boolean>
  }
  ai?: {
    envEnabled: boolean
    platformEnabled: boolean
    canExplainLlm: boolean
    canAskLlm: boolean
  }
  forecasts?: ReorderForecast[]
}
