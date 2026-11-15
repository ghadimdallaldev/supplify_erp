export const DISPUTE_TYPES = [
  'short_delivery',
  'damaged_goods',
  'wrong_items',
  'quality_issue',
  'billing_error',
  'other',
] as const

export type DisputeType = (typeof DISPUTE_TYPES)[number]

export const RESOLUTION_TYPES = [
  'credit_note',
  'replacement',
  'refund',
  'no_action',
] as const

export type ResolutionType = (typeof RESOLUTION_TYPES)[number]

export type Dispute = {
  id: string
  orderId?: string
  order_id?: string
  restaurantId?: string
  restaurant_id?: string
  supplierId?: string
  supplier_id?: string
  restaurantName?: string
  restaurant_name?: string
  supplierName?: string
  supplier_name?: string
  status: string
  type?: string
  dispute_type?: string
  description?: string
  disputedAmount?: number | null
  disputed_amount?: number | null
  resolutionType?: string | null
  resolution_type?: string | null
  resolutionNotes?: string | null
  resolution_notes?: string | null
  orderStatus?: string | null
  order_status?: string | null
  replacementOrderId?: string | null
  replacement_order_id?: string | null
  createdAt?: string
  created_at?: string
}

export type DisputeItem = {
  id: string
  productName?: string
  product_name?: string
  quantityOrdered?: number | null
  quantity_ordered?: number | null
  quantityReceived?: number | null
  quantity_received?: number | null
  issueDescription?: string | null
  issue_description?: string | null
}

export type DisputeCreditNote = {
  id: string
  creditNoteNumber?: string
  credit_note_number?: string
  creditAmount?: number
  credit_amount?: number
}

export type DisputeDetailResponse = {
  dispute: Dispute
  items: DisputeItem[]
  attachments?: unknown[]
  creditNotes?: DisputeCreditNote[]
  replacementOrder?: { id?: string } | null
  resolutionEffect?: { effect_type?: string; effectType?: string; amount?: number | string | null; reference?: string | null; credit_note_id?: string | null; replacement_order_id?: string | null; effect_data?: Record<string, unknown> } | null
}

export type CreateDisputeBody = {
  order_id: string
  supplier_id: string
  dispute_type: string
  description: string
  line_items?: { order_item_id: string; disputed_quantity: number; notes?: string }[]
}

export type ResolveDisputeBody = {
  resolutionType: ResolutionType
  resolutionNotes?: string
  creditNoteAmount?: number
  refundAmount?: number
  refundReference?: string
}

export function disputeOrderId(dispute: Dispute): string {
  return dispute.orderId ?? dispute.order_id ?? ''
}

export function disputeType(dispute: Dispute): string {
  return dispute.type ?? dispute.dispute_type ?? ''
}

export function disputePartyName(dispute: Dispute, role: 'RESTAURANT' | 'SUPPLIER'): string {
  if (role === 'SUPPLIER') {
    return dispute.restaurantName ?? dispute.restaurant_name ?? 'Restaurant'
  }
  return dispute.supplierName ?? dispute.supplier_name ?? 'Supplier'
}

export function disputeCreatedAt(dispute: Dispute): string {
  return dispute.createdAt ?? dispute.created_at ?? ''
}

export function disputeDisputedAmount(dispute: Dispute): number | null {
  const value = dispute.disputedAmount ?? dispute.disputed_amount
  return value != null ? Number(value) : null
}

export function disputeResolutionNotes(dispute: Dispute): string | null {
  return dispute.resolutionNotes ?? dispute.resolution_notes ?? null
}

export function disputeItemProductName(item: DisputeItem): string {
  return item.productName ?? item.product_name ?? '—'
}

export function disputeItemQuantityOrdered(item: DisputeItem): string {
  const value = item.quantityOrdered ?? item.quantity_ordered
  return value != null ? String(value) : '—'
}

export function disputeItemQuantityReceived(item: DisputeItem): string {
  const value = item.quantityReceived ?? item.quantity_received
  return value != null ? String(value) : '—'
}

export function disputeItemIssue(item: DisputeItem): string {
  return item.issueDescription ?? item.issue_description ?? '—'
}

export function disputeCreditNoteLabel(note: DisputeCreditNote): string {
  return note.creditNoteNumber ?? note.credit_note_number ?? note.id
}

export function disputeCreditNoteAmount(note: DisputeCreditNote): number {
  return Number(note.creditAmount ?? note.credit_amount ?? 0)
}
