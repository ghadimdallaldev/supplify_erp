import { useMemo, useState } from 'react'
import { Package } from 'lucide-react'
import { RequirePermission } from '../components/RequirePermission'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Skeleton } from '../components/ui/skeleton'
import { EmptyState } from '../components/ui/empty-state'
import { DriverDeliveriesHeader } from '../components/driver/DriverDeliveriesHeader'
import { DriverDeliveryCard } from '../components/driver/DriverDeliveryCard'
import { DriverRoutePanel } from '../components/driver/DriverRoutePanel'
import {
  useGetDriverActiveRouteQuery,
  useGetSupplierDeliveryBoardQuery,
  useUpdateFulfillmentRouteStopMutation,
  useUpdateOrderDeliveryStatusMutation,
} from '../services/api'
import toast from 'react-hot-toast'
import { useDriverLocationTracking } from '../hooks/useDriverLocationTracking'
import { isTrackableDeliveryStatus } from '../lib/driverGpsTracking'
import {
  isActiveDriverDeliveryStatus,
  isDoneDriverDeliveryStatus,
  isTerminalDriverDeliveryStatus,
} from '../lib/driverDeliveryUi'

export function DriverDeliveriesPage() {
  const { data, isLoading, isError, refetch } = useGetSupplierDeliveryBoardQuery({})
  const {
    data: routeData,
    isLoading: routeLoading,
    isError: routeError,
    refetch: refetchRoute,
  } = useGetDriverActiveRouteQuery()
  const [updateStatus, { isLoading: updating }] = useUpdateOrderDeliveryStatusMutation()
  const [updateRouteStop] = useUpdateFulfillmentRouteStopMutation()
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [showCompleted, setShowCompleted] = useState(false)

  const orders = data?.orders ?? []
  const activeRoute = routeData?.route ?? null

  const routeOrderIds = useMemo(
    () => new Set(activeRoute?.stops.map((stop) => stop.orderId) ?? []),
    [activeRoute]
  )

  const { activeOrders, completedOrders } = useMemo(() => {
    const active: typeof orders = []
    const completed: typeof orders = []
    for (const order of orders) {
      if (routeOrderIds.has(order.orderId)) continue
      if (isTerminalDriverDeliveryStatus(order.deliveryStatus)) {
        completed.push(order)
      } else {
        active.push(order)
      }
    }
    return { activeOrders: active, completedOrders: completed }
  }, [orders, routeOrderIds])

  const activeCount = useMemo(() => {
    const routeActive =
      activeRoute?.stops.filter((stop) => !['DELIVERED', 'FAILED'].includes(stop.status)).length ??
      0
    const standaloneActive = activeOrders.filter((o) =>
      isActiveDriverDeliveryStatus(o.deliveryStatus)
    ).length
    return routeActive + standaloneActive
  }, [activeRoute, activeOrders])

  const doneCount = useMemo(() => {
    const routeDone =
      activeRoute?.stops.filter((stop) => ['DELIVERED', 'FAILED'].includes(stop.status)).length ?? 0
    const standaloneDone = completedOrders.filter((o) =>
      isDoneDriverDeliveryStatus(o.deliveryStatus)
    ).length
    return routeDone + standaloneDone
  }, [activeRoute, completedOrders])

  const nextStandaloneOrderId = activeOrders[0]?.orderId

  const trackableDeliveries = orders
    .filter((o) => isTrackableDeliveryStatus(o.deliveryStatus))
    .map((o) => ({ orderId: o.orderId, deliveryStatus: o.deliveryStatus }))

  const { trackingActive, gpsError, permissionDenied, trackableCount } =
    useDriverLocationTracking(trackableDeliveries)

  const handleRefresh = () => {
    refetch()
    refetchRoute()
  }

  const handleRouteStopStatus = async (
    stopId: string,
    orderId: string,
    status: 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED'
  ) => {
    if (!activeRoute) return
    try {
      await updateRouteStop({
        routeId: activeRoute.id,
        stopId,
        status,
        failure_reason: status === 'FAILED' ? notes[orderId] || 'Delivery failed' : undefined,
        notes: notes[orderId] || undefined,
      }).unwrap()
      toast.success('Stop updated')
      refetch()
      refetchRoute()
    } catch (e: unknown) {
      const msg =
        (e as { data?: { error?: { message?: string } } })?.data?.error?.message ||
        'Failed to update stop'
      toast.error(msg)
    }
  }

  const handleStatus = async (orderId: string, status: string) => {
    try {
      await updateStatus({
        orderId,
        status: status as 'out_for_delivery' | 'delivered' | 'failed' | 'rescheduled',
        notes: notes[orderId] || undefined,
        failure_reason: status === 'failed' ? notes[orderId] || 'Delivery failed' : undefined,
      }).unwrap()
      toast.success('Delivery status updated')
      refetch()
      refetchRoute()
    } catch (e: unknown) {
      const msg =
        (e as { data?: { error?: { message?: string } } })?.data?.error?.message ||
        'Failed to update status'
      toast.error(msg)
    }
  }

  const hasWork =
    Boolean(activeRoute?.stops.length) || activeOrders.length > 0 || completedOrders.length > 0

  return (
    <RequirePermission permission="DRIVER_DELIVERIES_VIEW" title="my deliveries">
      <div
        data-testid="driver-deliveries-page"
        className="mx-auto flex max-w-lg flex-col gap-4 overflow-x-hidden p-3 pb-28 sm:p-4 sm:pb-24"
      >
        <DriverDeliveriesHeader
          activeCount={activeCount}
          doneCount={doneCount}
          trackingActive={trackingActive}
          trackableCount={trackableCount}
          isLoading={isLoading || routeLoading}
          onRefresh={handleRefresh}
        />

        {(gpsError || permissionDenied) && (
          <p
            className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
            data-testid="driver-gps-error"
            role="alert"
          >
            {gpsError || 'Location permission denied. Enable GPS to share live tracking.'}
          </p>
        )}

        {isLoading && (
          <div className="space-y-3" data-testid="driver-deliveries-loading" aria-busy="true">
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
          </div>
        )}

        {isError && (
          <Card data-testid="driver-deliveries-error">
            <CardContent className="pt-4 text-sm text-red-600">
              Could not load deliveries. Try again.
            </CardContent>
          </Card>
        )}

        {!isLoading && !isError && !hasWork && (
          <div data-testid="driver-deliveries-empty">
            <EmptyState
              title="No deliveries assigned"
              description="When dispatch assigns orders to you, they will appear here."
              icon={<Package className="h-6 w-6" aria-hidden />}
            />
          </div>
        )}

        {routeLoading && !activeRoute && (
          <p className="text-sm text-[var(--text-muted)]" data-testid="driver-route-loading">
            Loading your route…
          </p>
        )}

        {routeError && (
          <Card data-testid="driver-route-error">
            <CardContent className="pt-4 text-sm text-red-600">
              Could not load your route.{' '}
              <button type="button" className="underline" onClick={() => refetchRoute()}>
                Retry
              </button>
            </CardContent>
          </Card>
        )}

        {activeRoute && !routeLoading ? (
          <DriverRoutePanel
            route={activeRoute}
            notes={notes}
            onNotesChange={(orderId, value) => setNotes((prev) => ({ ...prev, [orderId]: value }))}
            onStopStatus={handleRouteStopStatus}
            disabled={updating}
          />
        ) : null}

        {activeOrders.length > 0 ? (
          <section className="space-y-3" data-testid="driver-standalone-deliveries">
            {activeRoute ? (
              <h2 className="text-sm font-semibold text-[var(--text-muted)]">Other deliveries</h2>
            ) : null}
            {activeOrders.map((order) => (
              <DriverDeliveryCard
                key={order.orderId}
                order={order}
                notes={notes[order.orderId] ?? ''}
                onNotesChange={(value) => setNotes((prev) => ({ ...prev, [order.orderId]: value }))}
                onStatus={(status) => handleStatus(order.orderId, status)}
                disabled={updating}
                isNext={!activeRoute && order.orderId === nextStandaloneOrderId}
              />
            ))}
          </section>
        ) : null}

        {completedOrders.length > 0 ? (
          <section className="space-y-3" data-testid="driver-completed-deliveries">
            <Button
              variant="ghost"
              className="h-auto w-full justify-between px-1 py-2 text-sm text-[var(--text-muted)]"
              onClick={() => setShowCompleted((open) => !open)}
            >
              <span>
                {showCompleted ? 'Hide' : 'Show'} completed ({completedOrders.length})
              </span>
            </Button>
            {showCompleted
              ? completedOrders.map((order) => (
                  <DriverDeliveryCard
                    key={order.orderId}
                    order={order}
                    notes={notes[order.orderId] ?? ''}
                    onNotesChange={(value) =>
                      setNotes((prev) => ({ ...prev, [order.orderId]: value }))
                    }
                    onStatus={(status) => handleStatus(order.orderId, status)}
                    disabled={updating}
                  />
                ))
              : null}
          </section>
        ) : null}
      </div>
    </RequirePermission>
  )
}
