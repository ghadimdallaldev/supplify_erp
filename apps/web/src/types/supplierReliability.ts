/** Mirrors the advanced restaurant supplier-reliability API contract. */
export type SupplierReliabilitySignal = 'short_receipt' | 'late_delivery' | 'open_dispute'

export interface SupplierReliability {
  supplierId: string
  supplierName: string
  orders: {
    placed: number
    completed: number
    completionRatePct: number | null
  }
  receiving: {
    reports: number
    fillRatePct: number | null
    averageQualityScore: number | null
    qualityScoredReports: number
  }
  delivery: {
    timedDeliveries: number
    onTimeDeliveries: number
    lateDeliveries: number
    deliveriesWithoutSchedule: number
    onTimeRatePct: number | null
  }
  disputes: {
    disputedOrders: number
    unresolvedDisputedOrders: number
  }
  signals: SupplierReliabilitySignal[]
}

export interface SupplierReliabilityResponse {
  windowDays: number
  suppliers: SupplierReliability[]
}
