export interface WeeklyIntelligenceSummaryResponse {
  periodDays: number
  generatedAt: string
  evidenceWindows: {
    wasteDays: number
    supplierReliabilityDays: number
    overOrderingDays: number
    invoiceAnomaliesDays: number
    stockoutForecasts: 'current_non_stale'
  }
  summary: {
    wasteHotspots: number
    supplierExceptions: number
    overOrderedProducts: number
    invoicesWithAnomalies: number
    stockoutRisks: number
  }
}
