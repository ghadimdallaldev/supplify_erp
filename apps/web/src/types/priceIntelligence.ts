/**
 * Restaurant price intelligence contracts.
 *
 * Mirrors apps/api/src/services/restaurant-price-intelligence.service.js. Every
 * numeric field is nullable because the service omits values it cannot derive
 * from observed data rather than estimating them.
 */

export type PriceEventSource = 'CATALOG' | 'CONTRACT' | 'RECEIVING' | 'INVOICE' | 'MANUAL'

export type PriceDirection = 'up' | 'down' | 'flat' | 'unknown'

export interface PriceEvent {
  id: string
  productId: string
  productName: string | null
  supplierId: string | null
  supplierName: string | null
  oldPrice: number | null
  newPrice: number | null
  changePct: number | null
  source: PriceEventSource
  currency: string | null
  detectedAt: string
}

export interface PriceHistorySummary {
  observations: number
  currentPrice: number | null
  lowestPrice: number | null
  highestPrice: number | null
  averagePrice: number | null
  firstObservedPrice: number | null
  changePct: number | null
  direction: PriceDirection
  lastChangedAt: string | null
  currency: string | null
}

export interface ProductPriceHistory {
  productId: string
  windowDays: number
  events: PriceEvent[]
  summary: PriceHistorySummary
}

export interface PriceChangeAlert extends PriceEvent {
  severity: 'medium' | 'high'
}

export interface PriceChangeAlertResponse {
  windowDays: number
  minChangePct: number
  direction: 'up' | 'down' | 'any'
  alerts: PriceChangeAlert[]
}

/** Only ever sourced from an agreed contract or a supplier-declared substitute. */
export type CheaperBuyKind = 'contract_price' | 'supplier_substitute'

export interface CheaperBuyAlternative {
  kind: CheaperBuyKind
  supplierId: string | null
  supplierName: string | null
  productId: string
  productName: string | null
  price: number
  currency: string | null
  savingPerUnit: number
  reason: string
}

export interface CheaperBuyOption {
  productId: string
  productName: string | null
  supplierId: string | null
  supplierName: string | null
  previousPrice: number | null
  currency: string | null
  currentPrice: number
  detectedAt: string
  alternatives: CheaperBuyAlternative[]
}

export interface CheaperBuyResponse {
  windowDays: number
  minChangePct: number
  options: CheaperBuyOption[]
}
