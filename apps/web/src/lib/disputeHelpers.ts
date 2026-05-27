/** Active dispute statuses (matches API `ACTIVE_STATUSES`). */
export const ACTIVE_DISPUTE_STATUSES = ['open', 'under_review', 'escalated'] as const

export type DisputeLike = Record<string, unknown>

export function disputeOrderId(dispute: DisputeLike): string {
  return String(dispute.orderId ?? dispute.order_id ?? '')
}

export function isActiveDisputeStatus(status: unknown): boolean {
  const s = String(status ?? '').toLowerCase()
  return (ACTIVE_DISPUTE_STATUSES as readonly string[]).includes(s)
}

export function getDisputesForOrder(disputes: DisputeLike[], orderId: string): DisputeLike[] {
  if (!orderId) return []
  return disputes.filter((d) => disputeOrderId(d) === orderId)
}

export function getActiveDisputeForOrder(
  disputes: DisputeLike[],
  orderId: string
): DisputeLike | undefined {
  return getDisputesForOrder(disputes, orderId).find((d) => isActiveDisputeStatus(d.status))
}

export function countActiveDisputes(disputes: DisputeLike[]): number {
  return disputes.filter((d) => isActiveDisputeStatus(d.status)).length
}

export type DisputeLineItemDraft = {
  orderItemId: string
  productName: string
  quantityOrdered: number
  quantityReceived: number
  unit?: string
  unitPrice: number
  issueDescription: string
  included: boolean
}

export function buildDisputeItemsPayload(items: DisputeLineItemDraft[]) {
  return items
    .filter((item) => item.included)
    .map((item) => ({
      orderItemId: item.orderItemId,
      productName: item.productName,
      quantityOrdered: item.quantityOrdered,
      quantityReceived: item.quantityReceived,
      unitPrice: item.unitPrice,
      issueDescription: item.issueDescription || undefined,
    }))
}

export function estimateDisputedAmount(items: DisputeLineItemDraft[]): number {
  return items
    .filter((item) => item.included)
    .reduce((sum, item) => {
      const short = Math.max(0, item.quantityOrdered - item.quantityReceived)
      return sum + short * item.unitPrice
    }, 0)
}

/** Line items with shorts or quality flags from the receiving form (pre-selected for dispute). */
export function disputeLineItemsFromReceiving(
  orderItems: Array<Record<string, unknown>>,
  formData: Record<string, unknown>
): DisputeLineItemDraft[] {
  const drafts: DisputeLineItemDraft[] = []
  for (const item of orderItems) {
    const id = String(item.id ?? '')
    const ordered = Number(item.ordered_quantity ?? 0)
    const received = Number(formData[`received_${id}`] ?? ordered)
    const quality = String(formData[`quality_${id}`] ?? 'ACCEPTED')
    const notes = String(formData[`notes_${id}`] ?? '').trim()
    const hasShort = received < ordered
    const hasQualityIssue = quality !== 'ACCEPTED'
    if (!hasShort && !hasQualityIssue) continue
    drafts.push({
      orderItemId: id,
      productName: String(item.product_name ?? 'Item'),
      quantityOrdered: ordered,
      quantityReceived: received,
      unit: String(item.unit ?? 'unit'),
      unitPrice: Number(item.unit_price ?? 0),
      issueDescription:
        notes ||
        (hasShort
          ? `Short by ${ordered - received} ${String(item.unit ?? 'units')}`
          : quality.replace(/_/g, ' ').toLowerCase()),
      included: true,
    })
  }
  return drafts
}

/** All lines with received qty from form — used when opening dispute during receive (user picks lines). */
export function receivingFormToDisputeDrafts(
  orderItems: Array<Record<string, unknown>>,
  formData: Record<string, unknown>
): DisputeLineItemDraft[] {
  const flagged = disputeLineItemsFromReceiving(orderItems, formData)
  if (flagged.length > 0) return flagged
  return orderItems.map((item) => {
    const id = String(item.id ?? '')
    const ordered = Number(item.ordered_quantity ?? 0)
    const received = Number(formData[`received_${id}`] ?? ordered)
    return {
      orderItemId: id,
      productName: String(item.product_name ?? 'Item'),
      quantityOrdered: ordered,
      quantityReceived: received,
      unit: String(item.unit ?? 'unit'),
      unitPrice: Number(item.unit_price ?? 0),
      issueDescription: String(formData[`notes_${id}`] ?? '').trim(),
      included: false,
    }
  })
}

export function supplierIdFromOrder(order: {
  supplier_id?: string
  items?: Array<{ supplier_id?: string }>
}): string {
  return order.supplier_id || order.items?.find((i) => i.supplier_id)?.supplier_id || ''
}

export function orderItemsToDisputeDrafts(
  orderItems: Array<Record<string, unknown>>
): DisputeLineItemDraft[] {
  return orderItems.map((item) => ({
    orderItemId: String(item.id ?? ''),
    productName: String(item.product_name ?? 'Item'),
    quantityOrdered: Number(item.ordered_quantity ?? 0),
    quantityReceived: Number(item.ordered_quantity ?? 0),
    unit: String(item.unit ?? 'unit'),
    unitPrice: Number(item.unit_price ?? 0),
    issueDescription: '',
    included: false,
  }))
}
