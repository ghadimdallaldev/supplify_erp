/** Mirrors the advanced restaurant over-ordering intelligence API contract. */
export type OverOrderingSignal = 'excess_stock_coverage' | 'waste_with_excess_stock'

export interface OverOrderingProduct {
  productId: string
  productName: string
  productUnit: string | null
  supplierName: string | null
  orders: { count: number; quantity: number }
  receiving: { quantity: number; matchingLines: number; mismatchedLines: number }
  usage: { quantity: number }
  waste: { quantity: number; sharePct: number | null }
  stock: { currentQuantity: number; coverageDays: number | null }
  comparisons: { receiptToDepletionRatio: number | null; completeComparableData: boolean }
  signals: OverOrderingSignal[]
}

export interface OverOrderingIntelligenceResponse {
  windowDays: number
  summary: {
    productsObserved: number
    productsWithCompleteComparableData: number
    flaggedProducts: number
    productsWithReceiptUnitMismatch: number
  }
  products: OverOrderingProduct[]
}
