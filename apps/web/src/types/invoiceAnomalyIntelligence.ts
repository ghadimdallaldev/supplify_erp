export type InvoiceAnomalySignal =
  | 'quantity_exceeds_order'
  | 'price_above_order_snapshot'
  | 'price_above_active_contract'
  | 'price_movement_above_threshold'
  | 'duplicate_linked_invoice'

export interface InvoiceAnomalyResponse {
  windowDays: number
  minChangePct: number
  duplicateLinkedInvoiceProtection: string
  summary: { invoicesWithAnomalies: number; anomalyLines: number }
  invoices: Array<{
    invoiceId: string
    invoiceNumber: string
    invoiceDate: string
    invoiceTotal: number
    currency: string
    supplierId: string
    supplierName: string
    lines: Array<{
      invoiceLineId: string
      productId: string
      description: string
      invoiceQuantity: number
      orderedQuantity: number | null
      invoiceUnitPrice: number
      orderedUnitPrice: number | null
      activeContractPrice: number | null
      priorInvoiceUnitPrice: number | null
      priceMovementPct: number | null
      signals: InvoiceAnomalySignal[]
    }>
  }>
}
