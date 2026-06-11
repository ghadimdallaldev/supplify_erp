import { useEffect, useMemo, useRef, useState } from 'react'
import {
  useGetConsumerOrdersQuery,
  useUpdateConsumerOrderStatusMutation,
  type ConsumerOrderSummary,
} from '../../services/consumerApi'
import { useGetMeQuery } from '../../services/api'
import { getAppSocket } from '../../lib/appSocket'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Skeleton } from '../../components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs'
import { RequirePermission } from '../../components/RequirePermission'
import { PageHeader } from '../../components/ui/page-header'
import { formatPrice } from '../../utils/format'
import {
  CONSUMER_ORDER_STATUS_LABELS,
  getNextConsumerOrderStatus,
  type ConsumerOrderLine,
  type ConsumerOrderTrackingStatus,
} from '../../lib/consumerOrderTracking'
import { playNotificationSound, unlockNotificationAudio } from '../../lib/notificationAlerts'
import { toast } from 'react-hot-toast'
import { Bell, BellOff } from 'lucide-react'

type StatusFilter = 'ALL' | 'RECEIVED' | 'PREPARING' | 'SHIPPED'

const KANBAN_COLUMNS: ConsumerOrderTrackingStatus[] = [
  'RECEIVED',
  'PREPARING',
  'SHIPPED',
  'DELIVERED',
]

function statusLabel(status: string): string {
  if (status in CONSUMER_ORDER_STATUS_LABELS) {
    return CONSUMER_ORDER_STATUS_LABELS[status as ConsumerOrderTrackingStatus]
  }
  return status.replace('_', ' ')
}

function formatModifiers(line: ConsumerOrderLine): string | null {
  const modifiers = line.modifiers ?? []
  if (!modifiers.length) return null
  if (typeof line.modifiers === 'string') {
    try {
      const parsed = JSON.parse(line.modifiers as unknown as string)
      if (Array.isArray(parsed)) {
        return parsed
          .map((m: { optionName?: string; groupName?: string }) => m.optionName || m.groupName)
          .filter(Boolean)
          .join(', ')
      }
    } catch {
      return null
    }
  }
  return modifiers
    .map((m) => m.optionName || m.groupName)
    .filter(Boolean)
    .join(', ')
}

function OrderCard({
  order,
  updating,
  onAdvance,
}: {
  order: ConsumerOrderSummary
  updating: boolean
  onAdvance: (id: string, current: string) => void
}) {
  const nextStatus = getNextConsumerOrderStatus(order.status)
  const lines = order.lines ?? []

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="min-w-0">
          <CardTitle className="truncate text-sm">{order.order_number}</CardTitle>
          <p className="truncate text-xs text-muted-foreground">
            {order.guest_name} · {order.fulfillment_type.replace('_', ' ')}
          </p>
        </div>
        <Badge
          variant={order.status === 'CANCELLED' ? 'destructive' : 'secondary'}
          className="shrink-0 text-[10px]"
        >
          {statusLabel(order.status)}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {lines.length > 0 && (
          <ul className="space-y-1.5 border-t pt-2 text-xs">
            {lines.map((line) => {
              const modifierText = formatModifiers(line as ConsumerOrderLine)
              return (
                <li key={line.id} className="space-y-0.5">
                  <div className="flex justify-between gap-2">
                    <span className="min-w-0">
                      {line.quantity}× {line.item_name}
                    </span>
                    <span className="shrink-0">{formatPrice(Number(line.line_total))}</span>
                  </div>
                  {modifierText && <p className="text-muted-foreground">+ {modifierText}</p>}
                  {line.notes && <p className="italic text-muted-foreground">{line.notes}</p>}
                </li>
              )
            })}
          </ul>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
          <div className="text-xs">
            <p className="font-medium">{formatPrice(Number(order.total_amount))}</p>
            <p className="text-muted-foreground">
              {new Date(order.created_at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
          {nextStatus && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={updating}
              onClick={() => onAdvance(order.id, order.status)}
            >
              → {statusLabel(nextStatus)}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function ConsumerOrdersPage() {
  const { data: meData } = useGetMeQuery()
  const user = meData?.user
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [soundEnabled, setSoundEnabled] = useState(true)
  const seenIdsRef = useRef<Set<string>>(new Set())
  const initializedRef = useRef(false)

  const queryArgs = useMemo(
    () => (statusFilter === 'ALL' ? undefined : { status: statusFilter }),
    [statusFilter]
  )

  const { data, isLoading, refetch } = useGetConsumerOrdersQuery(queryArgs, {
    pollingInterval: 5000,
    skipPollingIfUnfocused: true,
  })
  const [updateStatus, { isLoading: updating }] = useUpdateConsumerOrderStatusMutation()

  const orders = data?.orders ?? []

  useEffect(() => {
    const unlock = () => unlockNotificationAudio()
    window.addEventListener('click', unlock, { once: true })
    return () => window.removeEventListener('click', unlock)
  }, [])

  useEffect(() => {
    if (!user?.id) return

    const socket = getAppSocket(user.id)
    const onNewOrder = (payload: { orderNumber?: string }) => {
      refetch()
      if (soundEnabled) {
        playNotificationSound()
        toast.success(
          payload.orderNumber ? `New order ${payload.orderNumber}` : 'New guest order received'
        )
      }
    }

    socket.on('consumer_order_new', onNewOrder)
    return () => {
      socket.off('consumer_order_new', onNewOrder)
    }
  }, [user?.id, refetch, soundEnabled])

  useEffect(() => {
    if (!orders.length) {
      if (!initializedRef.current) initializedRef.current = true
      return
    }

    const currentIds = new Set(orders.map((o) => o.id))

    if (!initializedRef.current) {
      seenIdsRef.current = currentIds
      initializedRef.current = true
      return
    }

    const newReceived = orders.filter(
      (o) => o.status === 'RECEIVED' && !seenIdsRef.current.has(o.id)
    )

    if (newReceived.length && soundEnabled) {
      playNotificationSound()
      toast.success(
        newReceived.length === 1
          ? `New order ${newReceived[0].order_number}`
          : `${newReceived.length} new orders`
      )
    }

    seenIdsRef.current = currentIds
  }, [orders, soundEnabled])

  const advanceStatus = async (id: string, current: string) => {
    const next = getNextConsumerOrderStatus(current)
    if (!next) return
    try {
      await updateStatus({ id, status: next }).unwrap()
      toast.success(`Order marked ${statusLabel(next).toLowerCase()}`)
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Unable to update order')
    }
  }

  const ordersByStatus = useMemo(() => {
    const grouped: Record<string, ConsumerOrderSummary[]> = {
      RECEIVED: [],
      PREPARING: [],
      SHIPPED: [],
      DELIVERED: [],
      CANCELLED: [],
    }
    for (const order of orders) {
      if (grouped[order.status]) {
        grouped[order.status].push(order)
      }
    }
    return grouped
  }, [orders])

  return (
    <RequirePermission permission="ORDERS_VIEW">
      <div className="space-y-6">
        <PageHeader
          title="Guest orders"
          description="Consumer orders placed through your online storefront."
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <TabsList>
              <TabsTrigger value="ALL">All</TabsTrigger>
              <TabsTrigger value="RECEIVED">Received</TabsTrigger>
              <TabsTrigger value="PREPARING">Preparing</TabsTrigger>
              <TabsTrigger value="SHIPPED">Shipped</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSoundEnabled((v) => !v)}
            aria-pressed={soundEnabled}
          >
            {soundEnabled ? (
              <>
                <Bell className="mr-2 h-4 w-4" />
                Sound on
              </>
            ) : (
              <>
                <BellOff className="mr-2 h-4 w-4" />
                Sound off
              </>
            )}
          </Button>
        </div>

        {isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}

        {!isLoading && !orders.length && (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              No guest orders yet.
            </CardContent>
          </Card>
        )}

        {!isLoading && statusFilter === 'ALL' && orders.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {KANBAN_COLUMNS.map((columnStatus) => (
              <section key={columnStatus} className="space-y-2">
                <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                  <h3 className="text-sm font-medium">{statusLabel(columnStatus)}</h3>
                  <Badge variant="secondary">{ordersByStatus[columnStatus]?.length ?? 0}</Badge>
                </div>
                <div className="space-y-2">
                  {(ordersByStatus[columnStatus] ?? []).map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      updating={updating}
                      onAdvance={advanceStatus}
                    />
                  ))}
                  {!ordersByStatus[columnStatus]?.length && (
                    <p className="py-4 text-center text-xs text-muted-foreground">No orders</p>
                  )}
                </div>
              </section>
            ))}
          </div>
        )}

        {!isLoading && statusFilter !== 'ALL' && orders.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {orders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                updating={updating}
                onAdvance={advanceStatus}
              />
            ))}
          </div>
        )}

        {!isLoading && statusFilter !== 'ALL' && !orders.length && (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              No {statusLabel(statusFilter).toLowerCase()} orders.
            </CardContent>
          </Card>
        )}

        {!isLoading && statusFilter === 'ALL' && orders.some((o) => o.status === 'CANCELLED') && (
          <section className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">Cancelled</h3>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {ordersByStatus.CANCELLED.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  updating={updating}
                  onAdvance={advanceStatus}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </RequirePermission>
  )
}

export default ConsumerOrdersPage
