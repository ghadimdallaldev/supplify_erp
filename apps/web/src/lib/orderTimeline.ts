import i18n from 'i18next'

const NS = 'orders'

function ft(key: string, options?: Record<string, unknown>): string {
  return i18n.t(key, { ns: NS, ...options })
}

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
  cancelled_by?: string | null
  cancel_reason?: string | null
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
  RECEIVED_WITH_DISPUTE: 8,
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
        productNameById(orderItems, originalId) ||
        orderItem?.product_name ||
        ft('timeline.events.defaults.originalItem'),
      substituteName:
        productNameById(orderItems, substituteId) || ft('timeline.events.defaults.substituteItem'),
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

type ReplacementOrderLike = Record<string, unknown>

export type DeliveryAssignmentTimeline = {
  status: string
  driverName?: string | null
  assignedAt?: string | null
  pickedUpAt?: string | null
  deliveredAt?: string | null
}

export interface BuildOrderTimelineInput {
  order: OrderLike
  viewerRole?: TimelineViewerRole
  amendments?: AmendmentLike[]
  invoices?: InvoiceLike[]
  disputes?: DisputeLike[]
  receivingReports?: ReceivingLike[]
  creditNotes?: CreditNoteLike[]
  replacementOrders?: ReplacementOrderLike[]
  deliveryAssignment?: DeliveryAssignmentTimeline | null
}

const DRIVER_STATUS_RANK: Record<string, number> = {
  assigned: 1,
  picked_up: 2,
  out_for_delivery: 3,
  delivered: 4,
  failed: 4,
  rescheduled: 0,
}

function pushDriverDeliveryMilestones(
  events: TimelineEvent[],
  assignment: DeliveryAssignmentTimeline | null | undefined,
  statusRank: number
) {
  if (!assignment?.status) return
  const driverRank = DRIVER_STATUS_RANK[assignment.status] ?? 0
  if (driverRank < 1) return

  const driverLabel = assignment.driverName
    ? ft('timeline.events.driver.driverSuffix', { name: assignment.driverName })
    : ''

  const steps: Array<{
    id: string
    titleKey: string
    stepLabelKey: string
    minRank: number
    ts?: string | null
  }> = [
    {
      id: 'driver-assigned',
      titleKey: 'timeline.events.driver.assigned',
      stepLabelKey: 'timeline.events.driver.stepLabel.assigned',
      minRank: 1,
      ts: assignment.assignedAt,
    },
    {
      id: 'driver-picked-up',
      titleKey: 'timeline.events.driver.pickedUp',
      stepLabelKey: 'timeline.events.driver.stepLabel.pickedUp',
      minRank: 2,
      ts: assignment.pickedUpAt,
    },
    {
      id: 'driver-out-for-delivery',
      titleKey: 'timeline.events.driver.outForDelivery',
      stepLabelKey: 'timeline.events.driver.stepLabel.outForDelivery',
      minRank: 3,
    },
    {
      id: 'driver-delivered',
      titleKey: 'timeline.events.driver.delivered',
      stepLabelKey: 'timeline.events.driver.stepLabel.delivered',
      minRank: 4,
      ts: assignment.deliveredAt,
    },
  ]

  for (const step of steps) {
    const done = driverRank >= step.minRank
    const stepLabel = ft(step.stepLabelKey)
    events.push({
      id: step.id,
      title: ft(step.titleKey) + driverLabel,
      description: done
        ? ft('timeline.events.driver.milestoneDone', { step: stepLabel })
        : ft('timeline.events.driver.milestonePending', { step: stepLabel }),
      timestamp: done ? formatTs(step.ts ?? null) : null,
      state: done
        ? 'completed'
        : driverRank + 1 === step.minRank && statusRank >= MILESTONE.SHIPPED
          ? 'current'
          : 'upcoming',
    })
  }
}

function pushCoreFulfillmentSteps(
  events: TimelineEvent[],
  input: {
    order: OrderLike
    statusRank: number
    supplierName: string
    restaurantName?: string
    viewerRole: TimelineViewerRole
  }
) {
  const { order, statusRank, supplierName, restaurantName, viewerRole } = input
  const isSupplier = viewerRole === 'SUPPLIER'

  events.push({
    id: 'placed',
    title: isSupplier
      ? ft('timeline.events.placed.titleSupplier')
      : ft('timeline.events.placed.titleRestaurant'),
    description: isSupplier
      ? ft('timeline.events.placed.descSupplier', {
          name: restaurantName || ft('timeline.events.defaults.restaurant'),
        })
      : ft('timeline.events.placed.descRestaurant', { name: supplierName }),
    timestamp: milestoneTimestamp(order, MILESTONE.PLACED, statusRank),
    state: stepState(statusRank, MILESTONE.PLACED),
  })

  events.push({
    id: 'confirmed',
    title: isSupplier
      ? ft('timeline.events.confirmed.titleSupplier')
      : ft('timeline.events.confirmed.titleRestaurant'),
    description:
      statusRank >= MILESTONE.ACKNOWLEDGED
        ? isSupplier
          ? ft('timeline.events.confirmed.descDoneSupplier')
          : ft('timeline.events.confirmed.descDoneRestaurant', { name: supplierName })
        : isSupplier
          ? ft('timeline.events.confirmed.descPendingSupplier')
          : ft('timeline.events.confirmed.descPendingRestaurant'),
    timestamp: milestoneTimestamp(order, MILESTONE.ACKNOWLEDGED, statusRank),
    state: stepState(statusRank, MILESTONE.ACKNOWLEDGED),
  })

  events.push({
    id: 'processing',
    title: isSupplier
      ? ft('timeline.events.processing.titleSupplier')
      : ft('timeline.events.processing.titleRestaurant'),
    description:
      statusRank >= MILESTONE.PROCESSING
        ? isSupplier
          ? ft('timeline.events.processing.descDoneSupplier')
          : ft('timeline.events.processing.descDoneRestaurant')
        : isSupplier
          ? ft('timeline.events.processing.descPendingSupplier')
          : ft('timeline.events.processing.descPendingRestaurant'),
    timestamp: milestoneTimestamp(order, MILESTONE.PROCESSING, statusRank),
    state: stepState(statusRank, MILESTONE.PROCESSING),
  })

  events.push({
    id: 'shipped',
    title: ft('timeline.events.shipped.title'),
    description:
      statusRank >= MILESTONE.SHIPPED
        ? ft('timeline.events.shipped.descDone')
        : ft('timeline.events.shipped.descPending'),
    timestamp: milestoneTimestamp(order, MILESTONE.SHIPPED, statusRank),
    state: stepState(statusRank, MILESTONE.SHIPPED),
  })
}

function pushCoreDeliveryCompletionSteps(
  events: TimelineEvent[],
  input: {
    order: OrderLike
    statusRank: number
    supplierName: string
    viewerRole: TimelineViewerRole
  }
) {
  const { order, statusRank, supplierName, viewerRole } = input
  const isSupplier = viewerRole === 'SUPPLIER'

  if (isSupplier) {
    events.push({
      id: 'delivered',
      title: ft('timeline.events.delivered.titleSupplier'),
      description:
        statusRank >= MILESTONE.DELIVERED
          ? ft('timeline.events.delivered.descDoneSupplier')
          : ft('timeline.events.delivered.descPendingSupplier'),
      timestamp: milestoneTimestamp(order, MILESTONE.DELIVERED, statusRank),
      state: stepState(statusRank, MILESTONE.DELIVERED),
    })

    if (statusRank >= MILESTONE.RECEIVED) {
      events.push({
        id: 'restaurant-received',
        title: ft('timeline.events.restaurantReceived.title'),
        description: ft('timeline.events.restaurantReceived.desc'),
        timestamp: milestoneTimestamp(order, MILESTONE.RECEIVED, statusRank),
        state: 'completed',
      })
    }
    return
  }

  // Restaurant view
  events.push({
    id: 'delivered',
    title: ft('timeline.events.delivered.titleRestaurant'),
    description:
      statusRank >= MILESTONE.DELIVERED
        ? ft('timeline.events.delivered.descDoneRestaurant', { name: supplierName })
        : ft('timeline.events.delivered.descPendingRestaurant'),
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
  const disputeOpen = order.status === 'RECEIVED_WITH_DISPUTE'

  const state = receivingState(statusRank, Boolean(receiving))

  if (receiving) {
    const receivingStatus = receiving.status ? String(receiving.status).toLowerCase() : ''
    events.push({
      id: 'received',
      title: disputeOpen
        ? ft('timeline.events.receiving.titleDispute')
        : ft('timeline.events.receiving.title'),
      description: disputeOpen
        ? ft('timeline.events.receiving.descDispute')
        : receivingStatus
          ? ft('timeline.events.receiving.descRecordedWithStatus', { status: receivingStatus })
          : ft('timeline.events.receiving.descRecorded'),
      timestamp: formatTs(
        String(receiving.received_at ?? receiving.receivedAt ?? receiving.created_at ?? '')
      ),
      state: disputeOpen ? 'completed' : state,
      link: {
        label: ft('timeline.events.receiving.viewReceiving'),
        href: `/app/receiving?order=${order.id}`,
      },
    })
    return
  }

  events.push({
    id: 'received',
    title:
      disputeOpen || statusRank >= MILESTONE.RECEIVED
        ? disputeOpen
          ? ft('timeline.events.receiving.titleDispute')
          : ft('timeline.events.receiving.title')
        : ft('timeline.events.receiving.titleConfirm'),
    description: disputeOpen
      ? ft('timeline.events.receiving.descDisputeResolve')
      : statusRank >= MILESTONE.RECEIVED
        ? ft('timeline.events.receiving.descDone')
        : statusRank >= MILESTONE.DELIVERED
          ? ft('timeline.events.receiving.descAfterDelivery')
          : ft('timeline.events.receiving.descPending'),
    timestamp:
      state === 'completed' ? milestoneTimestamp(order, MILESTONE.RECEIVED, statusRank) : null,
    state,
    link:
      statusRank >= MILESTONE.DELIVERED
        ? {
            label: ft('timeline.events.receiving.receiveOrder'),
            href: `/app/receiving?order=${order.id}`,
          }
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
    replacementOrders = [],
    deliveryAssignment = null,
  } = input

  const orderDisputes = disputes.filter((d) => disputeOrderId(d) === order.id)
  const firstOpenDispute = orderDisputes.find((d) =>
    ['open', 'under_review'].includes(String(d.status ?? ''))
  )

  const events: TimelineEvent[] = []
  const status = order.status
  const supplierName =
    order.items?.find((i) => i.supplier_name)?.supplier_name ||
    ft('timeline.events.defaults.supplier')
  const restaurantName =
    (order as OrderLike & { restaurant_name?: string }).restaurant_name ||
    ft('timeline.events.defaults.restaurant')

  if (status === 'CANCELLED') {
    const supplierDeclined = order.cancelled_by === 'SUPPLIER' && viewerRole === 'RESTAURANT'
    const reason = order.cancel_reason?.trim()
    events.push({
      id: 'cancelled',
      title: supplierDeclined
        ? ft('timeline.events.cancelled.titleDeclined')
        : ft('timeline.events.cancelled.title'),
      description: supplierDeclined
        ? reason || ft('timeline.events.cancelled.descDeclined')
        : reason
          ? ft('timeline.events.cancelled.descWithReason', { reason })
          : ft('timeline.events.cancelled.desc'),
      timestamp: formatTs(order.updated_at),
      state: 'completed',
    })
    return events
  }

  // Legacy PENDING_APPROVAL orders are treated as placed in the timeline (product no longer gates orders).
  const effectiveStatus = status === 'PENDING_APPROVAL' ? 'PLACED' : status
  const effectiveRank = rank(effectiveStatus)

  pushCoreFulfillmentSteps(events, {
    order: { ...order, status: effectiveStatus },
    statusRank: effectiveRank,
    supplierName,
    restaurantName,
    viewerRole,
  })

  pushDriverDeliveryMilestones(events, deliveryAssignment, effectiveRank)

  pushCoreDeliveryCompletionSteps(events, {
    order: { ...order, status: effectiveStatus },
    statusRank: effectiveRank,
    supplierName,
    viewerRole,
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
      title: ft('timeline.events.substitution.title'),
      description: String(amendment.description || ft('timeline.events.substitution.descDefault')),
      timestamp: formatTs(respondedAt || String(amendment.updated_at ?? '')),
      state: 'completed',
      substitutions: buildSubstitutionDetails(amendment, order.items),
    })
  }

  if (viewerRole === 'RESTAURANT') {
    const receiving = receivingReports.find((r) => String(r.order_id ?? r.orderId) === order.id)
    pushReceivingStep(events, { order, statusRank: effectiveRank, receiving })
  } else if (
    viewerRole === 'SUPPLIER' &&
    (order.status === 'RECEIVED_WITH_DISPUTE' || effectiveRank >= MILESTONE.RECEIVED)
  ) {
    const disputeOpen = order.status === 'RECEIVED_WITH_DISPUTE'
    events.push({
      id: 'restaurant-received',
      title: disputeOpen
        ? ft('timeline.events.restaurantReceived.titleDispute')
        : ft('timeline.events.restaurantReceived.title'),
      description: disputeOpen
        ? ft('timeline.events.restaurantReceived.descDisputeSupplier', { name: restaurantName })
        : ft('timeline.events.restaurantReceived.descDoneSupplier', { name: restaurantName }),
      timestamp: formatTs(order.updated_at),
      state: disputeOpen ? 'current' : 'completed',
      link: disputeOpen
        ? {
            label: ft('timeline.events.dispute.manageDispute'),
            href: firstOpenDispute
              ? `/app/disputes/${String(firstOpenDispute.id)}`
              : '/app/disputes',
          }
        : undefined,
    })
  }

  for (const dispute of orderDisputes) {
    const type = String(dispute.type ?? 'issue').replace(/_/g, ' ')
    events.push({
      id: `dispute-${String(dispute.id)}`,
      title: ft('timeline.events.dispute.title'),
      description: String(
        dispute.description || ft('timeline.events.dispute.descDefault', { type })
      ),
      timestamp: formatTs(String(dispute.createdAt ?? dispute.created_at ?? '')),
      state: ['resolved', 'rejected', 'cancelled'].includes(String(dispute.status))
        ? 'completed'
        : 'current',
      badge: type,
      link: {
        label: ft('timeline.events.dispute.viewDispute'),
        href: `/app/disputes/${String(dispute.id)}`,
      },
    })
  }

  for (const replacement of replacementOrders) {
    const replacementId = String(replacement.id ?? '')
    const disputeId = String(replacement.source_dispute_id ?? replacement.sourceDisputeId ?? '')
    events.push({
      id: `replacement-${replacementId}`,
      title: ft('timeline.events.replacement.title'),
      description: disputeId
        ? ft('timeline.events.replacement.descFromDispute', {
            orderRef: replacementId.slice(0, 8).toUpperCase(),
            disputeRef: disputeId.slice(0, 8).toUpperCase(),
          })
        : ft('timeline.events.replacement.desc', {
            orderRef: replacementId.slice(0, 8).toUpperCase(),
          }),
      timestamp: formatTs(String(replacement.created_at ?? replacement.createdAt ?? '')),
      state: 'completed',
      badge: ft('timeline.events.replacement.badge'),
      link: {
        label: ft('timeline.events.replacement.viewOrder'),
        href: `/app/orders/${replacementId}`,
      },
    })
  }

  const disputeIds = new Set(orderDisputes.map((d) => String(d.id)))
  const orderCreditNotes = creditNotes.filter((cn) =>
    disputeIds.has(String(cn.dispute_id ?? cn.disputeId ?? ''))
  )

  for (const cn of orderCreditNotes) {
    events.push({
      id: `credit-${String(cn.id)}`,
      title: ft('timeline.events.creditNote.title'),
      description: ft('timeline.events.creditNote.desc', {
        amount: cn.credit_amount ?? cn.creditAmount ?? cn.remaining_amount ?? '-',
      }),
      timestamp: formatTs(String(cn.issue_date ?? cn.created_at ?? '')),
      state: 'completed',
      link: { label: ft('timeline.events.creditNote.viewInvoices'), href: '/app/invoices' },
    })
  }

  if (viewerRole === 'RESTAURANT') {
    for (const invoice of invoices) {
      const invoiceStatus = String(invoice.status ?? '').toUpperCase()
      const isPaid = invoiceStatus === 'PAID'
      const invoiceNumber = String(
        invoice.invoice_number ?? invoice.invoiceNumber ?? ft('timeline.events.defaults.invoice')
      )

      events.push({
        id: `invoice-${String(invoice.id)}`,
        title: isPaid
          ? ft('timeline.events.invoice.titleClosed')
          : ft('timeline.events.invoice.titleIssued'),
        description: isPaid
          ? ft('timeline.events.invoice.descPaid', { number: invoiceNumber })
          : ft('timeline.events.invoice.descOpen', {
              number: invoiceNumber,
              status: invoiceStatus.toLowerCase() || 'open',
            }),
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
        link: { label: ft('timeline.events.invoice.viewInvoice'), href: '/app/invoices' },
      })
    }
  }

  return events
}

const RESTAURANT_LIFECYCLE_KEYS = [
  'orderPlaced',
  'supplierConfirmed',
  'substitutions',
  'processing',
  'shipped',
  'delivered',
  'goodsReceived',
  'dispute',
  'creditNote',
  'invoiceClosed',
] as const

const SUPPLIER_LIFECYCLE_KEYS = [
  'orderReceived',
  'acknowledged',
  'substitutions',
  'picking',
  'shipped',
  'delivered',
  'restaurantReceipt',
  'dispute',
] as const

export function getRestaurantLifecycleLabels(): string[] {
  return RESTAURANT_LIFECYCLE_KEYS.map((key) => ft(`timeline.lifecycle.${key}`))
}

export function getSupplierLifecycleLabels(): string[] {
  return SUPPLIER_LIFECYCLE_KEYS.map((key) => ft(`timeline.lifecycle.${key}`))
}
