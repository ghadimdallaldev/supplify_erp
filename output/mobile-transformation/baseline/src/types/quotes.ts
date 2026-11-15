import type { Product } from './supplify'

export interface QuoteRequestSummary {
  id: string
  restaurantId: string
  status: 'open' | 'closed' | 'cancelled'
  note?: string | null
  neededBy?: string | null
  createdAt: string
  updatedAt?: string
  itemCount?: number
  supplierCount?: number
  responseCount?: number
}

export interface QuoteRequestItem {
  id: string
  productId: string
  productName: string
  productSku: string
  productUnit?: string
  quantity: number
  unit?: string | null
  notes?: string | null
}

export interface QuoteResponseItem {
  id?: string
  quoteRequestItemId: string
  isAvailable: boolean
  unitPrice?: number | null
  currency?: string
  quantity?: number | null
  deliveryDate?: string | null
  note?: string | null
  substituteProductName?: string | null
}

export interface QuoteRequestSupplierEntry {
  id: string
  supplierId: string
  supplierName: string
  status: 'pending' | 'responded' | 'declined'
  response?: {
    id: string
    note?: string | null
    submittedAt?: string
    items: QuoteResponseItem[]
  } | null
}

export interface QuoteRequestDetail {
  quoteRequest: QuoteRequestSummary
  items: QuoteRequestItem[]
  suppliers: QuoteRequestSupplierEntry[]
}

export type SupplierQuoteInboxStatus = 'pending' | 'responded' | 'declined'
export type SupplierQuoteInboxSort = 'newest' | 'oldest' | 'needed_by'

export interface SupplierQuoteInboxEntry {
  id: string
  quoteRequestId: string
  status: SupplierQuoteInboxStatus
  quoteRequestStatus: string
  note?: string | null
  neededBy?: string | null
  createdAt: string
  restaurantName: string
  itemCount: number
  declineReason?: string | null
  viewedAt?: string | null
  respondedAt?: string | null
}

export interface SupplierQuoteInboxCounts {
  total: number
  pending: number
  responded: number
  declined: number
  unread: number
  urgent: number
}

export interface SupplierQuoteInboxResponse {
  inbox: SupplierQuoteInboxEntry[]
  counts: SupplierQuoteInboxCounts
  pagination: { page: number; limit: number; total: number }
}

export interface SupplierQuoteRequestDetail {
  id: string
  quoteRequestId: string
  status: string
  restaurantId: string
  restaurantName: string
  quoteRequestNote?: string | null
  quoteRequestStatus?: string
  /** False once the restaurant closes/cancels the RFQ or the supplier declines it. */
  canRespond?: boolean
  /** Preferred currency for response lines (prior quote or catalog). */
  defaultCurrency?: string | null
  neededBy?: string | null
  createdAt?: string
  declineReason?: string | null
  viewedAt?: string | null
  items: QuoteRequestItem[]
  response?: {
    id: string
    note?: string | null
    submittedAt?: string
    items: QuoteResponseItem[]
  } | null
}

export interface QuoteCartPayload {
  supplierId: string
  quoteRequestSupplierId: string
  items: Array<{
    productId: string
    quantity: number
    quotedUnitPrice?: number | null
    quoteResponseItemId: string
    product: Product
  }>
}
