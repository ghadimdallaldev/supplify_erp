export type TimelineEventState = 'completed' | 'current' | 'upcoming' | 'skipped'

export type TimelineViewerRole = 'RESTAURANT' | 'SUPPLIER'

export interface SubstitutionDetail {
  originalName: string
  substituteName: string
  quantity?: number | string
}

export interface TimelineEvent {
  id: string
  title: string
  description?: string
  timestamp?: string | null
  state: TimelineEventState
  badge?: string
  link?: { label: string; href: string }
  substitutions?: SubstitutionDetail[]
}

type OrderLike = {
  id: string
  status: string
  placed_at?: string | null
  created_at: string
  updated_at?: string
  items?: Array<{
    id?: string
    product_id?: string
    product_name?: string
    supplier_name?: string
    quantity?: number
  }>
}

type AmendmentLike = Record<string, unknown>
type DisputeLike = Record<string, unknown>
type InvoiceLike = Record<string, unknown>
type ReceivingLike = Record<string, unknown>
type CreditNoteLike = Record<string, unknown>

const STATUS_RANK: Record<string, number> = {
  DRAFT: 0,
  PENDING_APPROVAL: 1,
  PLACED: 2,
  ACKNOWLEDGED: 3,
  PROCESSING: 4,
  SHIPPED: 5,
  DELIVERED: 6,
  COMPLETED: 6,
  RECEIVED_PARTIAL: 7,
  RECEIVED_FULL: 8,
  INVOICED: 9,
  CANCELLED: -1,
}

const MILESTONE = {
  PLACED: 2,
  ACKNOWLEDGED: 3,
  PROCESSING: 4,
  SHIPPED: 5,
  DELIVERED: 6,
  RECEIVED: 8,
} as const

function rank(status: string): number {
  return STATUS_RANK[status] ?? 0
}

function formatTs(value?: string | null): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function stepState(statusRank: number, milestoneRank: number): TimelineEventState {
  if (statusRank < milestoneRank) return 'upcoming'
  if (statusRank > milestoneRank) return 'completed'
  // At DELIVERED, the delivery milestone is done; receiving is the active step for restaurants.
  if (milestoneRank === MILESTONE.DELIVERED) return 'completed'
  return 'current'
}

function receivingState(statusRank: number, hasReport: boolean): TimelineEventState {
  if (hasReport || statusRank >= MILESTONE.RECEIVED) return 'completed'
  if (statusRank >= MILESTONE.DELIVERED) return 'current'
  return 'upcoming'
}

/** Timestamp for a milestone: placed uses placed_at; later milestones use updated_at when reached. */
function milestoneTimestamp(
  order: OrderLike,
  milestoneRank: number,
  statusRank: number
): string | null {
  if (statusRank < milestoneRank) return null
  if (milestoneRank <= MILESTONE.PLACED) {
    return formatTs(order.placed_at || order.created_at)
  }
  return formatTs(order.updated_at)
}

function productNameById(items: OrderLike['items'], productId?: string | null): string | undefined {
  if (!productId || !items?.length) return undefined
  return items.find((i) => i.product_id === productId)?.product_name
}

function amendmentField<T>(row: AmendmentLike, snake: string, camel: string): T | undefined {
  return (row[snake] ?? row[camel]) as T | undefined
}

function disputeOrderId(d: DisputeLike): string {
  return String(d.orderId ?? d.order_id ?? '')
}

function buildSubstitutionDetails(
  amendment: AmendmentLike,
  orderItems: OrderLike['items']
): SubstitutionDetail[] {
  const rawItems = amendment.items ?? amendmentItems(amendment)
  if (!Array.isArray(rawItems)) return []

  return rawItems.map((item) => {
    const row = item as Record<string, unknown>
    const originalId = String(
      row.originalProductId ?? row.original_product_id ?? row.orderItemId ?? ''
    )
    const substituteId = String(row.substituteProductId ?? row.substitute_product_id ?? '')
    const orderItem = orderItems?.find((i) => i.id === row.orderItemId)
    return {
      originalName:
        productNameById(orderItems, originalId) || orderItem?.product_name || 'Original item',
      substituteName: productNameById(orderItems, substituteId) || 'Substitute item',
      quantity:
        (row.requestedQuantity as number | string | undefined) ??
        (row.requested_quantity as number | string | undefined) ??
        orderItem?.quantity,
    }
  })
}

function amendmentItems(amendment: AmendmentLike): unknown {
  if (typeof amendment.items === 'string') {
    try {
      return JSON.parse(amendment.items)
    } catch {
      return []
    }
  }
  return amendment.items
}

export interface BuildOrderTimelineInput {
  order: OrderLike
  viewerRole?: TimelineViewerRole
  amendments?: AmendmentLike[]
  invoices?: InvoiceLike[]
  disputes?: DisputeLike[]
  receivingReports?: ReceivingLike[]
  creditNotes?: CreditNoteLike[]
  approvalStatus?: string | null
}

function pushCoreFulfillmentSteps(
  events: TimelineEvent[],
  input: {
    order: OrderLike
    statusRank: number
    supplierName: string
    restaurantName?: string
    viewerRole: TimelineViewerRole
    approvalPending: boolean
  }
) {
  const { order, statusRank, supplierName, restaurantName, viewerRole, approvalPending } = input
  const isSupplier = viewerRole === 'SUPPLIER'

  if (approvalPending && statusRank < MILESTONE.PLACED) {
    events.push({
      id: 'approval',
      title: 'Awaiting approval',
      description: isSupplier
        ? 'This order is waiting for restaurant approval before fulfillment.'
        : 'This order needs internal approval before it is sent to the supplier.',
      timestamp: formatTs(order.created_at),
      state: 'current',
      badge: 'Pending approval',
    })
  }

  events.push({
    id: 'placed',
    title: isSupplier ? 'Order received' : 'Order placed',
    description: isSupplier
      ? `New order from ${restaurantName || 'restaurant'}.`
      : `Order sent to ${supplierName}.`,
    timestamp: milestoneTimestamp(order, MILESTONE.PLACED, statusRank),
    state: stepState(statusRank, MILESTONE.PLACED),
  })

  events.push({
    id: 'confirmed',
    title: isSupplier ? 'Order acknowledged' : 'Supplier confirmed',
    description:
      statusRank >= MILESTONE.ACKNOWLEDGED
        ? isSupplier
          ? 'You acknowledged this order.'
          : `${supplierName} acknowledged the order.`
        : isSupplier
          ? 'Acknowledge the order to start fulfillment.'
          : 'Waiting for the supplier to acknowledge this order.',
    timestamp: milestoneTimestamp(order, MILESTONE.ACKNOWLEDGED, statusRank),
    state: stepState(statusRank, MILESTONE.ACKNOWLEDGED),
  })

  events.push({
    id: 'processing',
    title: isSupplier ? 'Picking & processing' : 'Order processing',
    description:
      statusRank >= MILESTONE.PROCESSING
        ? isSupplier
          ? 'Items are being picked and prepared for dispatch.'
          : 'The supplier is preparing and picking items for delivery.'
        : isSupplier
          ? 'Pick and prepare items after acknowledgment.'
          : 'Supplier will start preparing items after confirmation.',
    timestamp: milestoneTimestamp(order, MILESTONE.PROCESSING, statusRank),
    state: stepState(statusRank, MILESTONE.PROCESSING),
  })

  events.push({
    id: 'shipped',
    title: 'Order shipped',
    description:
      statusRank >= MILESTONE.SHIPPED
        ? 'Order has left the warehouse and is on its way.'
        : 'Dispatch will begin once the order is marked as shipped.',
    timestamp: milestoneTimestamp(order, MILESTONE.SHIPPED, statusRank),
    state: stepState(statusRank, MILESTONE.SHIPPED),
  })

  if (isSupplier) {
    events.push({
      id: 'delivered',
      title: 'Marked delivered',
      description:
        statusRank >= MILESTONE.DELIVERED
          ? 'Delivery completed. The restaurant can confirm receipt.'
          : 'Mark delivered when the handoff or drop-off is complete.',
      timestamp: milestoneTimestamp(order, MILESTONE.DELIVERED, statusRank),
      state: stepState(statusRank, MILESTONE.DELIVERED),
    })

    if (statusRank >= MILESTONE.RECEIVED) {
      events.push({
        id: 'restaurant-received',
        title: 'Restaurant confirmed receipt',
        description: 'The restaurant recorded receiving this delivery.',
        timestamp: milestoneTimestamp(order, MILESTONE.RECEIVED, statusRank),
        state: 'completed',
      })
    }
    return
  }

  // Restaurant view
  events.push({
    id: 'delivered',
    title: 'Delivered by supplier',
    description:
      statusRank >= MILESTONE.DELIVERED
        ? `${supplierName} marked the order as delivered.`
        : 'Supplier delivery completion will appear here.',
    timestamp: milestoneTimestamp(order, MILESTONE.DELIVERED, statusRank),
    state: stepState(statusRank, MILESTONE.DELIVERED),
  })
}

function pushReceivingStep(
  events: TimelineEvent[],
  input: {
    order: OrderLike
    statusRank: number
    receiving?: ReceivingLike
  }
) {
  const { order, statusRank, receiving } = input

  const state = receivingState(statusRank, Boolean(receiving))

  if (receiving) {
    events.push({
      id: 'received',
      title: 'Goods received',
      description: `Receiving report recorded${receiving.status ? ` (${String(receiving.status).toLowerCase()})` : ''}.`,
      timestamp: formatTs(
        String(receiving.received_at ?? receiving.receivedAt ?? receiving.created_at ?? '')
      ),
      state,
      link: { label: 'View receiving', href: `/app/receiving?order=${order.id}` },
    })
    return
  }

  events.push({
    id: 'received',
    title: statusRank >= MILESTONE.RECEIVED ? 'Goods received' : 'Confirm receipt',
    description:
      statusRank >= MILESTONE.RECEIVED
        ? 'Receiving has been recorded for this order.'
        : statusRank >= MILESTONE.DELIVERED
          ? 'Record receiving to confirm quantities and quality.'
          : 'Receiving will be available after delivery.',
    timestamp:
      state === 'completed' ? milestoneTimestamp(order, MILESTONE.RECEIVED, statusRank) : null,
    state,
    link:
      statusRank >= MILESTONE.DELIVERED
        ? { label: 'Receive order', href: `/app/receiving?order=${order.id}` }
        : undefined,
  })
}

export function buildOrderTimeline(input: BuildOrderTimelineInput): TimelineEvent[] {
  const {
    order,
    viewerRole = 'RESTAURANT',
    amendments = [],
    invoices = [],
    disputes = [],
    receivingReports = [],
    creditNotes = [],
    approvalStatus,
  } = input

  const events: TimelineEvent[] = []
  const status = order.status
  const statusRank = rank(status)
  const supplierName = order.items?.find((i) => i.supplier_name)?.supplier_name || 'Supplier'
  const restaurantName =
    (order as OrderLike & { restaurant_name?: string }).restaurant_name || 'Restaurant'

  if (status === 'CANCELLED') {
    events.push({
      id: 'cancelled',
      title: 'Order cancelled',
      description: 'This order was cancelled and will not be fulfilled.',
      timestamp: formatTs(order.updated_at),
      state: 'completed',
    })
    return events
  }

  const approvalPending =
    status === 'PENDING_APPROVAL' || approvalStatus === 'pending' || approvalStatus === 'PENDING'

  pushCoreFulfillmentSteps(events, {
    order,
    statusRank,
    supplierName,
    restaurantName,
    viewerRole,
    approvalPending,
  })

  const acceptedSubstitutions = amendments.filter((a) => {
    const changeType = String(amendmentField(a, 'change_type', 'changeType') ?? '')
    const amendStatus = String(a.status ?? '')
    return changeType === 'item_substitution' && amendStatus === 'accepted'
  })

  for (const amendment of acceptedSubstitutions) {
    const respondedAt = amendmentField<string>(amendment, 'responded_at', 'respondedAt')
    events.push({
      id: `substitution-${String(amendment.id)}`,
      title: 'Items substituted',
      description: String(amendment.description || 'Approved item substitutions.'),
      timestamp: formatTs(respondedAt || String(amendment.updated_at ?? '')),
      state: 'completed',
      substitutions: buildSubstitutionDetails(amendment, order.items),
    })
  }

  if (viewerRole === 'RESTAURANT') {
    const receiving = receivingReports.find((r) => String(r.order_id ?? r.orderId) === order.id)
    pushReceivingStep(events, { order, statusRank, receiving })
  }

  const orderDisputes = disputes.filter((d) => disputeOrderId(d) === order.id)
  for (const dispute of orderDisputes) {
    const type = String(dispute.type ?? 'issue').replace(/_/g, ' ')
    events.push({
      id: `dispute-${String(dispute.id)}`,
      title: 'Dispute opened',
      description: String(dispute.description || `Dispute raised: ${type}.`),
      timestamp: formatTs(String(dispute.createdAt ?? dispute.created_at ?? '')),
      state: ['resolved', 'rejected', 'cancelled'].includes(String(dispute.status))
        ? 'completed'
        : 'current',
      badge: type,
      link: { label: 'View dispute', href: `/app/disputes?orderId=${order.id}` },
    })
  }

  const disputeIds = new Set(orderDisputes.map((d) => String(d.id)))
  const orderCreditNotes = creditNotes.filter((cn) =>
    disputeIds.has(String(cn.dispute_id ?? cn.disputeId ?? ''))
  )

  for (const cn of orderCreditNotes) {
    events.push({
      id: `credit-${String(cn.id)}`,
      title: 'Credit note issued',
      description: `Credit of ${cn.credit_amount ?? cn.creditAmount ?? cn.remaining_amount ?? '—'} applied from dispute resolution.`,
      timestamp: formatTs(String(cn.issue_date ?? cn.created_at ?? '')),
      state: 'completed',
      link: { label: 'View invoices', href: '/app/invoices' },
    })
  }

  if (viewerRole === 'RESTAURANT') {
    for (const invoice of invoices) {
      const invoiceStatus = String(invoice.status ?? '').toUpperCase()
      const isPaid = invoiceStatus === 'PAID'
      const invoiceNumber = String(invoice.invoice_number ?? invoice.invoiceNumber ?? 'Invoice')

      events.push({
        id: `invoice-${String(invoice.id)}`,
        title: isPaid ? 'Invoice closed' : 'Invoice issued',
        description: isPaid
          ? `${invoiceNumber} has been paid in full.`
          : `${invoiceNumber} is ${invoiceStatus.toLowerCase() || 'open'}.`,
        timestamp: formatTs(
          String(
            invoice.payment_date ??
              invoice.paymentDate ??
              invoice.invoice_date ??
              invoice.invoiceDate ??
              invoice.created_at ??
              ''
          )
        ),
        state: isPaid ? 'completed' : invoiceStatus === 'ISSUED' ? 'current' : 'upcoming',
        link: { label: 'View invoice', href: '/app/invoices' },
      })
    }
  }

  return events
}

export const RESTAURANT_LIFECYCLE_LABELS = [
  'Order placed',
  'Supplier confirmed',
  'Substitutions',
  'Processing',
  'Shipped',
  'Delivered',
  'Goods received',
  'Dispute',
  'Credit note',
  'Invoice closed',
] as const

export const SUPPLIER_LIFECYCLE_LABELS = [
  'Order received',
  'Acknowledged',
  'Substitutions',
  'Picking',
  'Shipped',
  'Delivered',
  'Restaurant receipt',
  'Dispute',
] as const
