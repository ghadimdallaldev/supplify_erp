import type { DispatchOrderCard } from '../../types'

export type DispatchBoardData = {
  pending: DispatchOrderCard[]
  assigned: DispatchOrderCard[]
  out_for_delivery: DispatchOrderCard[]
  delivered_today: DispatchOrderCard[]
  stats: {
    pending: number
    assigned: number
    outForDelivery: number
    deliveredToday: number
  }
}

export type DeliveryBoardOrder = {
  orderId: string
  restaurantName: string
  deliveryArea?: string
  deliveryStatus: string
  driverId?: string | null
  driverName?: string | null
  scheduledAt?: string
  hasPod?: boolean
}

export type DispatchFilters = {
  date: string
  status: string
  driverId: string
  area: string
}

export const DISPATCH_FILTER_ALL = '__all__'

export function hasActiveDispatchFilters(filters: DispatchFilters): boolean {
  return Boolean(
    filters.date ||
      (filters.status && filters.status !== DISPATCH_FILTER_ALL) ||
      (filters.driverId && filters.driverId !== DISPATCH_FILTER_ALL) ||
      filters.area.trim()
  )
}

export function flattenDispatchOrders(data: DispatchBoardData): DispatchOrderCard[] {
  return [...data.pending, ...data.assigned, ...data.out_for_delivery, ...data.delivered_today]
}

export function enrichOrderFromBoard(
  order: DispatchOrderCard,
  boardById: Map<string, DeliveryBoardOrder>
): DispatchOrderCard {
  const meta = boardById.get(order.id)
  if (!meta) return order
  return {
    ...order,
    delivery_area: meta.deliveryArea ?? order.delivery_area,
    scheduled_at: meta.scheduledAt ?? order.scheduled_at,
    delivery_status: meta.deliveryStatus ?? order.delivery_status,
  }
}

export function filterDispatchBoard(
  data: DispatchBoardData,
  allowedOrderIds: Set<string> | null
): DispatchBoardData {
  if (!allowedOrderIds) return data
  const filterList = (list: DispatchOrderCard[]) => list.filter((o) => allowedOrderIds.has(o.id))

  const pending = filterList(data.pending)
  const assigned = filterList(data.assigned)
  const out_for_delivery = filterList(data.out_for_delivery)
  const delivered_today = filterList(data.delivered_today)

  return {
    pending,
    assigned,
    out_for_delivery,
    delivered_today,
    stats: {
      pending: pending.length,
      assigned: assigned.length,
      outForDelivery: out_for_delivery.length,
      deliveredToday: delivered_today.length,
    },
  }
}

export type DispatchSummaryStats = {
  total: number
  pending: number
  outForDelivery: number
  delivered: number
  failed: number
  rescheduled: number
}

export function computeDispatchSummary(
  data: DispatchBoardData,
  boardStats?: Partial<DispatchSummaryStats> | null
): DispatchSummaryStats {
  if (boardStats && boardStats.total != null) {
    return {
      total: boardStats.total ?? 0,
      pending: boardStats.pending ?? 0,
      outForDelivery: boardStats.outForDelivery ?? 0,
      delivered: boardStats.delivered ?? 0,
      failed: boardStats.failed ?? 0,
      rescheduled: boardStats.rescheduled ?? 0,
    }
  }

  const all = flattenDispatchOrders(data)
  let failed = 0
  let rescheduled = 0
  for (const o of all) {
    const st = o.assignment?.status
    if (st === 'failed') failed += 1
    if (st === 'rescheduled') rescheduled += 1
  }

  return {
    total: all.length,
    pending: data.stats.pending,
    outForDelivery: data.stats.outForDelivery,
    delivered: data.stats.deliveredToday,
    failed,
    rescheduled,
  }
}

export function formatOrderRef(id: string): string {
  if (!id) return '—'
  return `#${id.slice(0, 8).toUpperCase()}`
}

export function canSelectOrderForRoute(order: {
  active_route_id?: string | null
  status?: string
}): { ok: boolean; reason?: string } {
  if (order.active_route_id) {
    return { ok: false, reason: 'Already on a route' }
  }
  const deliverable = ['ACKNOWLEDGED', 'PROCESSING', 'SHIPPED']
  if (order.status && !deliverable.includes(order.status)) {
    return { ok: false, reason: 'Not ready for routing' }
  }
  return { ok: true }
}

export function formatScheduledAt(value?: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
