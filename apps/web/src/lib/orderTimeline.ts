export type TimelineEventState = 'completed' | 'current' | 'upcoming' | 'skipped'

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
  COMPLETED: 6,
  CANCELLED: -1,
}

function rank(status: string): number {
  return STATUS_RANK[status] ?? 0
}

function formatTs(value?: string | null): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
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
  amendments?: AmendmentLike[]
  invoices?: InvoiceLike[]
  disputes?: DisputeLike[]
  receivingReports?: ReceivingLike[]
  creditNotes?: CreditNoteLike[]
  approvalStatus?: string | null
}

export function buildOrderTimeline(input: BuildOrderTimelineInput): TimelineEvent[] {
  const {
    order,
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

  if (approvalPending && statusRank < rank('PLACED')) {
    events.push({
      id: 'approval',
      title: 'Awaiting approval',
      description: 'This order needs internal approval before it is sent to the supplier.',
      timestamp: formatTs(order.created_at),
      state: 'current',
      badge: 'Pending approval',
    })
  }

  events.push({
    id: 'placed',
    title: 'Order placed',
    description: `Order sent to ${supplierName}.`,
    timestamp: formatTs(order.placed_at || order.created_at),
    state: statusRank >= rank('PLACED') ? 'completed' : approvalPending ? 'upcoming' : 'current',
  })

  events.push({
    id: 'confirmed',
    title: 'Supplier confirmed',
    description:
      statusRank >= rank('ACKNOWLEDGED')
        ? `${supplierName} acknowledged the order.`
        : 'Waiting for the supplier to acknowledge this order.',
    timestamp: statusRank >= rank('ACKNOWLEDGED') ? formatTs(order.updated_at) : null,
    state:
      statusRank >= rank('ACKNOWLEDGED')
        ? 'completed'
        : statusRank >= rank('PLACED')
          ? 'current'
          : 'upcoming',
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

  events.push({
    id: 'processing',
    title: 'Order processing',
    description:
      statusRank >= rank('PROCESSING')
        ? 'The supplier is preparing and picking items for delivery.'
        : 'Supplier will start preparing items after confirmation.',
    timestamp: statusRank >= rank('PROCESSING') ? formatTs(order.updated_at) : null,
    state:
      statusRank >= rank('PROCESSING')
        ? 'completed'
        : statusRank >= rank('ACKNOWLEDGED')
          ? 'current'
          : 'upcoming',
  })

  events.push({
    id: 'shipped',
    title: 'Order shipped',
    description:
      statusRank >= rank('SHIPPED')
        ? 'Order has left the warehouse and is on its way.'
        : 'Delivery will begin once the order is marked as shipped.',
    timestamp: statusRank >= rank('SHIPPED') ? formatTs(order.updated_at) : null,
    state:
      statusRank >= rank('SHIPPED')
        ? 'completed'
        : statusRank >= rank('PROCESSING')
          ? 'current'
          : 'upcoming',
  })

  const receiving = receivingReports.find((r) => String(r.order_id ?? r.orderId) === order.id)

  if (receiving) {
    events.push({
      id: 'received',
      title: 'Goods received',
      description: `Receiving report recorded${receiving.status ? ` (${String(receiving.status).toLowerCase()})` : ''}.`,
      timestamp: formatTs(
        String(receiving.received_at ?? receiving.receivedAt ?? receiving.created_at ?? '')
      ),
      state: 'completed',
      link: { label: 'View receiving', href: `/app/receiving?order=${order.id}` },
    })
  } else {
    events.push({
      id: 'completed',
      title: statusRank >= rank('COMPLETED') ? 'Order completed' : 'Goods received',
      description:
        statusRank >= rank('COMPLETED')
          ? 'Supplier marked the order as completed. You can receive and inspect the delivery.'
          : 'Delivery completion and receiving will appear here.',
      timestamp: statusRank >= rank('COMPLETED') ? formatTs(order.updated_at) : null,
      state:
        statusRank >= rank('COMPLETED')
          ? 'completed'
          : statusRank >= rank('SHIPPED')
            ? 'current'
            : 'upcoming',
      link:
        statusRank >= rank('COMPLETED')
          ? { label: 'Receive order', href: `/app/receiving?order=${order.id}` }
          : undefined,
    })
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

  return events
}

export const ORDER_LIFECYCLE_LABELS = [
  'Order placed',
  'Supplier confirmed',
  'Substitutions',
  'Processing',
  'Shipped',
  'Goods received',
  'Dispute',
  'Credit note',
  'Invoice closed',
] as const
