import { useMemo, useState } from 'react'
import { Loader2, Package, Route } from 'lucide-react'
import { RequirePermission } from '../components/RequirePermission'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Skeleton } from '../components/ui/skeleton'
import { EmptyState } from '../components/ui/empty-state'
import { DriverDeliveriesHeader } from '../components/driver/DriverDeliveriesHeader'
import { DriverDeliveryCard } from '../components/driver/DriverDeliveryCard'
import { DriverRoutePanel } from '../components/driver/DriverRoutePanel'
import { DriverStickyActionBar } from '../components/driver/DriverStickyActionBar'
import {
  useBuildDriverRouteFromAssignmentsMutation,
  useGetDriverActiveRouteQuery,
  useGetSupplierDeliveryBoardQuery,
  useReorderFulfillmentRouteStopsMutation,
  useSetNextFulfillmentRouteStopMutation,
  useUpdateFulfillmentRouteStopMutation,
  useUpdateOrderDeliveryStatusMutation,
} from '../services/api'
import toast from 'react-hot-toast'
import { useDriverLocationTracking } from '../hooks/useDriverLocationTracking'
import { isTrackableDeliveryStatus } from '../lib/driverGpsTracking'
import {
  getDriverActionsForStatus,
  isActiveDriverDeliveryStatus,
  isDoneDriverDeliveryStatus,
  isTerminalDriverDeliveryStatus,
  routeStopIsComplete,
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
  const [reorderStops, { isLoading: reordering }] = useReorderFulfillmentRouteStopsMutation()
  const [setNextStop] = useSetNextFulfillmentRouteStopMutation()
  const [buildRoute, { isLoading: buildingRoute }] = useBuildDriverRouteFromAssignmentsMutation()
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

  const nextStandaloneOrder = activeOrders[0] ?? null
  const nextStandaloneOrderId = nextStandaloneOrder?.orderId
  const nextRouteStop = activeRoute?.stops.find((stop) => !routeStopIsComplete(stop.status)) ?? null

  const trackableDeliveries = orders
    .filter((o) => isTrackableDeliveryStatus(o.deliveryStatus))
    .map((o) => ({ orderId: o.orderId, deliveryStatus: o.deliveryStatus }))

  const { trackingActive, gpsError, permissionDenied, trackableCount } =
    useDriverLocationTracking(trackableDeliveries)

  const handleRefresh = () => {
    refetch()
    refetchRoute()
  }

  const handleMoveStop = async (index: number, direction: -1 | 1) => {
    if (!activeRoute) return
    const next = index + direction
    if (next < 0 || next >= activeRoute.stops.length) return
    const ids = activeRoute.stops.map((s) => s.id)
    const tmp = ids[index]
    ids[index] = ids[next]
    ids[next] = tmp
    try {
      await reorderStops({ routeId: activeRoute.id, stop_ids: ids }).unwrap()
      toast.success('Stop order updated')
      refetchRoute()
    } catch (e: unknown) {
      const msg =
        (e as { data?: { error?: { message?: string } } })?.data?.error?.message ||
        'Could not reorder stops'
      toast.error(msg)
    }
  }

  const handleSetNext = async (orderId: string) => {
    if (!activeRoute) return
    try {
      await setNextStop({ routeId: activeRoute.id, orderId }).unwrap()
      toast.success('Next stop updated')
      refetchRoute()
    } catch (e: unknown) {
      const msg =
        (e as { data?: { error?: { message?: string } } })?.data?.error?.message ||
        'Could not set next stop'
      toast.error(msg)
    }
  }

  const standaloneEligibleCount = useMemo(
    () => activeOrders.filter((o) => isActiveDriverDeliveryStatus(o.deliveryStatus)).length,
    [activeOrders]
  )

  const showBuildRouteCard = !activeRoute && !routeLoading && standaloneEligibleCount >= 2

  const handleBuildRoute = async () => {
    try {
      await buildRoute({}).unwrap()
      toast.success('Your route is ready')
      refetchRoute()
      refetch()
    } catch (e: unknown) {
      const msg =
        (e as { data?: { error?: { message?: string } } })?.data?.error?.message ||
        'Could not build route'
      toast.error(msg)
    }
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

  let stickyAction: {
    primaryLabel: string
    primarySuccess?: boolean
    onPrimary: () => void
    onProblem?: () => void
  } | null = null

  if (nextRouteStop) {
    if (nextRouteStop.status === 'PLANNED') {
      stickyAction = {
        primaryLabel: "I'm on the way",
        onPrimary: () =>
          handleRouteStopStatus(nextRouteStop.id, nextRouteStop.orderId, 'OUT_FOR_DELIVERY'),
        onProblem: () => handleRouteStopStatus(nextRouteStop.id, nextRouteStop.orderId, 'FAILED'),
      }
    } else if (nextRouteStop.status === 'OUT_FOR_DELIVERY') {
      stickyAction = {
        primaryLabel: 'Delivered',
        primarySuccess: true,
        onPrimary: () =>
          handleRouteStopStatus(nextRouteStop.id, nextRouteStop.orderId, 'DELIVERED'),
        onProblem: () => handleRouteStopStatus(nextRouteStop.id, nextRouteStop.orderId, 'FAILED'),
      }
    }
  } else if (nextStandaloneOrder) {
    const actions = getDriverActionsForStatus(nextStandaloneOrder.deliveryStatus)
    const primary = actions[0]
    const problem = actions.find((a) => a.value === 'failed')
    if (primary) {
      stickyAction = {
        primaryLabel: primary.label,
        primarySuccess: primary.value === 'delivered',
        onPrimary: () => handleStatus(nextStandaloneOrder.orderId, primary.value),
        onProblem: problem
          ? () => handleStatus(nextStandaloneOrder.orderId, problem.value)
          : undefined,
      }
    }
  }

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
          permissionDenied={permissionDenied}
          gpsError={gpsError}
          isLoading={isLoading || routeLoading}
          onRefresh={handleRefresh}
        />

        {(gpsError || permissionDenied) && (
          <p
            className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-base text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
            data-testid="driver-gps-error"
            role="alert"
          >
            {permissionDenied
              ? 'Location permission needed. Turn on location in your phone settings so restaurants can see your progress.'
              : 'Location not updating. Check your signal or try refreshing.'}
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
              title="No deliveries today"
              description="When dispatch assigns orders to you, they will show up here with Open Maps and one-tap actions."
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

        {showBuildRouteCard ? (
          <Card data-testid="driver-build-route-card">
            <CardContent className="space-y-3 pt-4">
              <div className="flex items-start gap-3">
                <Route className="mt-0.5 h-5 w-5 shrink-0 text-[var(--brand-mid)]" aria-hidden />
                <div className="space-y-1">
                  <p className="font-semibold text-[var(--text-primary)]">
                    You have {standaloneEligibleCount} deliveries today
                  </p>
                  <p className="text-sm text-[var(--text-muted)]">
                    Build a route to choose the delivery order.
                  </p>
                </div>
              </div>
              <Button
                className="w-full"
                size="lg"
                data-testid="driver-build-route-button"
                disabled={buildingRoute}
                onClick={handleBuildRoute}
              >
                {buildingRoute ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                ) : null}
                Build my route
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {activeRoute && !routeLoading ? (
          <DriverRoutePanel
            route={activeRoute}
            notes={notes}
            onNotesChange={(orderId, value) => setNotes((prev) => ({ ...prev, [orderId]: value }))}
            onStopStatus={handleRouteStopStatus}
            onMoveStop={handleMoveStop}
            onSetNext={handleSetNext}
            reordering={reordering}
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

        {stickyAction && !isLoading && !isError ? (
          <DriverStickyActionBar
            primaryLabel={stickyAction.primaryLabel}
            primarySuccess={stickyAction.primarySuccess}
            onPrimary={stickyAction.onPrimary}
            onProblem={stickyAction.onProblem}
            disabled={updating}
          />
        ) : null}
      </div>
    </RequirePermission>
  )
}
