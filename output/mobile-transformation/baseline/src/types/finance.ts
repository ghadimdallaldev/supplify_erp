export type SupplierStatementSummary = {
  openingBalance: number
  totalCharges: number
  totalPayments: number
  totalAdjustments: number
  closingBalance: number
  invoiceCount?: number
}

export type RestaurantInvoice = {
  id: string
  invoice_number?: string
  invoice_date?: string
  due_date?: string
  total_amount?: number | string
  total_paid?: number | string
  balance_due?: number | string
  status?: string
  supplier_name?: string
  supplier_id?: string
  currency?: string
}

export type SupplierStatementResponse = {
  invoices: RestaurantInvoice[]
  summary: SupplierStatementSummary
}

export type SupplierReceivablesResponse = {
  summary?: { totalBalanceDue?: number; overdueCount?: number; count?: number }
  invoices?: RestaurantInvoice[]
}
