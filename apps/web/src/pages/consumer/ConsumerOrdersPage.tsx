import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
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
import { PageShell } from '../../components/ui/page-shell'
import { formatPrice } from '../../utils/format'
import {
  getNextConsumerOrderStatus,
  type ConsumerOrderLine,
  type ConsumerOrderTrackingStatus,
} from '../../lib/consumerOrderTracking'
import { playNotificationSound, unlockNotificationAudio } from '../../lib/notificationAlerts'
import { toast } from 'sonner'
import { Bell, BellOff } from 'lucide-react'
import { ensureNamespace } from '../../i18n'
import { usePermissions } from '../../hooks/usePermissions'

type StatusFilter = 'ALL' | 'RECEIVED' | 'PREPARING' | 'SHIPPED'

const KANBAN_COLUMNS: ConsumerOrderTrackingStatus[] = [
  'RECEIVED',
  'PREPARING',
  'SHIPPED',
  'DELIVERED',
]

function statusLabel(status: string, t: TFunction<'consumer'>): string {
  return t(`orderStatus.${status}`, { defaultValue: status.replace('_', ' ') })
}

function fulfillmentLabel(type: string, t: TFunction<'consumer'>) {
  return t(`fulfillment.${type}`, { defaultValue: type.replace('_', ' ') })
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
  t,
  canManageOrders,
}: {
  order: ConsumerOrderSummary
  updating: boolean
  onAdvance: (id: string, current: string) => void
  t: TFunction<'consumer'>
  canManageOrders: boolean
}) {
  const nextStatus = getNextConsumerOrderStatus(order.status)
  const lines = order.lines ?? []

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="min-w-0">
          <CardTitle className="truncate text-sm">{order.order_number}</CardTitle>
          <p className="truncate text-xs text-muted-foreground">
            {order.guest_name} · {fulfillmentLabel(order.fulfillment_type, t)}
          </p>
        </div>
        <Badge
          variant={order.status === 'CANCELLED' ? 'destructive' : 'secondary'}
          className="shrink-0 text-[10px]"
        >
          {statusLabel(order.status, t)}
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
          {canManageOrders && nextStatus && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={updating}
              onClick={() => onAdvance(order.id, order.status)}
            >
              {t('orders.advanceTo', { status: statusLabel(nextStatus, t) })}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function ConsumerOrdersPage() {
  const { t } = useTranslation('consumer')
  const { can } = usePermissions()
  const canManageOrders = can('ORDERS_MANAGE')

  useEffect(() => {
    void ensureNamespace('consumer')
  }, [])

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
    pollingInterval: 15_000,
    skipPollingIfUnfocused: true,
  })
  const [updateStatus, { isLoading: updating }] = useUpdateConsumerOrderStatusMutation()

  const orders = useMemo(() => data?.orders ?? [], [data?.orders])

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
          payload.orderNumber
            ? t('orders.newOrder', { number: payload.orderNumber })
            : t('orders.newGuestOrder')
        )
      }
    }

    socket.on('consumer_order_new', onNewOrder)
    return () => {
      socket.off('consumer_order_new', onNewOrder)
    }
  }, [user?.id, refetch, soundEnabled, t])

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
          ? t('orders.newOrder', { number: newReceived[0].order_number })
          : t('orders.newOrdersCount', { count: newReceived.length })
      )
    }

    seenIdsRef.current = currentIds
  }, [orders, soundEnabled, t])

  const advanceStatus = async (id: string, current: string) => {
    const next = getNextConsumerOrderStatus(current)
    if (!next) return
    try {
      await updateStatus({ id, status: next }).unwrap()
      toast.success(t('orders.markedStatus', { status: statusLabel(next, t).toLowerCase() }))
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || t('orders.unableToUpdate'))
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
      <PageShell className="space-y-6">
        <PageHeader title={t('orders.title')} description={t('orders.description')} />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <TabsList>
              <TabsTrigger value="ALL">{t('orders.filterAll')}</TabsTrigger>
              <TabsTrigger value="RECEIVED">{t('orderStatus.RECEIVED')}</TabsTrigger>
              <TabsTrigger value="PREPARING">{t('orderStatus.PREPARING')}</TabsTrigger>
              <TabsTrigger value="SHIPPED">{t('orderStatus.SHIPPED')}</TabsTrigger>
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
                {t('orders.soundOn')}
              </>
            ) : (
              <>
                <BellOff className="mr-2 h-4 w-4" />
                {t('orders.soundOff')}
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
              {t('orders.noOrders')}
            </CardContent>
          </Card>
        )}

        {!isLoading && statusFilter === 'ALL' && orders.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {KANBAN_COLUMNS.map((columnStatus) => (
              <section key={columnStatus} className="space-y-2">
                <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                  <h3 className="text-sm font-medium">{statusLabel(columnStatus, t)}</h3>
                  <Badge variant="secondary">{ordersByStatus[columnStatus]?.length ?? 0}</Badge>
                </div>
                <div className="space-y-2">
                  {(ordersByStatus[columnStatus] ?? []).map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      updating={updating}
                      onAdvance={advanceStatus}
                      t={t}
                      canManageOrders={canManageOrders}
                    />
                  ))}
                  {!ordersByStatus[columnStatus]?.length && (
                    <p className="py-4 text-center text-xs text-muted-foreground">
                      {t('orders.noOrdersInColumn')}
                    </p>
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
                t={t}
                canManageOrders={canManageOrders}
              />
            ))}
          </div>
        )}

        {!isLoading && statusFilter !== 'ALL' && !orders.length && (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              {t('orders.noFilteredOrders', {
                status: statusLabel(statusFilter, t).toLowerCase(),
              })}
            </CardContent>
          </Card>
        )}

        {!isLoading && statusFilter === 'ALL' && orders.some((o) => o.status === 'CANCELLED') && (
          <section className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">{t('orders.cancelled')}</h3>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {ordersByStatus.CANCELLED.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  updating={updating}
                  onAdvance={advanceStatus}
                  t={t}
                  canManageOrders={canManageOrders}
                />
              ))}
            </div>
          </section>
        )}
      </PageShell>
    </RequirePermission>
  )
}

export default ConsumerOrdersPage
