/** Mirrors the deterministic advanced waste-intelligence API contract. */
export type WasteSignal = 'repeated_waste' | 'rising_waste_cost'

export interface WasteCostCoverage {
  costedIncidents: number
  uncostedIncidents: number
}

export interface WasteIntelligenceHotspot {
  productId: string
  productName: string
  productUnit: string | null
  supplierName: string | null
  currentIncidents: number
  previousIncidents: number
  currentWasteQuantity: number | null
  currentWasteCost: number | null
  previousWasteCost: number | null
  costChangePct: number | null
  costCoverage: WasteCostCoverage
  signals: WasteSignal[]
}

export interface WasteIntelligenceResponse {
  windowDays: number
  summary: {
    current: {
      incidents: number
      affectedProducts: number
      wasteCost: number | null
      costCoverage: WasteCostCoverage
    }
    previous: {
      incidents: number
      affectedProducts: number
      wasteCost: number | null
    }
    costChangePct: number | null
  }
  hotspots: WasteIntelligenceHotspot[]
}
