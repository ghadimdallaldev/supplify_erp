import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Package, Route } from 'lucide-react'
import { RequirePermission } from '../components/RequirePermission'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Skeleton } from '../components/ui/skeleton'
import { EmptyState } from '../components/ui/empty-state'
import { DriverDeliveriesHeader } from '../components/driver/DriverDeliveriesHeader'
import { PageShell } from '../components/ui/page-shell'
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
import { toast } from 'sonner'
import { useDriverLocationTracking } from '../hooks/useDriverLocationTracking'
import { isTrackableDeliveryStatus } from '../lib/driverGpsTracking'
import {
  getDriverActionsForStatus,
  isActiveDriverDeliveryStatus,
  isDoneDriverDeliveryStatus,
  isTerminalDriverDeliveryStatus,
  routeStopIsComplete,
} from '../lib/driverDeliveryUi'
import {
  driverStatusNeedsProofOfDelivery,
  type DriverDeliveryStatus,
} from '../lib/driverDeliveryActions'
import { ProofOfDeliveryDialog } from '../components/fulfillment/ProofOfDeliveryDialog'
import { ensureNamespace } from '../i18n'

export function DriverDeliveriesPage() {
  const { t } = useTranslation('fulfillment')

  useEffect(() => {
    void ensureNamespace('fulfillment')
  }, [])
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
  // Order awaiting proof-of-delivery capture before it is marked delivered.
  const [podOrderId, setPodOrderId] = useState<string | null>(null)
  const [podStop, setPodStop] = useState<{ stopId: string; orderId: string } | null>(null)

  const orders = useMemo(() => data?.orders ?? [], [data?.orders])
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
    // The board orders rows by COALESCE(da.id, o.id) — effectively UUID order — so
    // "next" has to be established here, or the sticky bar acts on an arbitrary
    // delivery rather than the one due soonest.
    active.sort((a, b) => {
      const at = a.scheduledAt ? new Date(a.scheduledAt).getTime() : Number.POSITIVE_INFINITY
      const bt = b.scheduledAt ? new Date(b.scheduledAt).getTime() : Number.POSITIVE_INFINITY
      if (at !== bt) return at - bt
      return a.orderId.localeCompare(b.orderId)
    })
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

  const {
    trackingActive,
    gpsError,
    permissionDenied,
    trackableCount,
    pendingLocationCount,
    lastSyncedAt,
    startTracking,
    stopTracking,
  } = useDriverLocationTracking(trackableDeliveries)

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
      toast.success(t('driverDeliveries.toast.stopOrderUpdated'))
      refetchRoute()
    } catch (e: unknown) {
      const msg =
        (e as { data?: { error?: { message?: string } } })?.data?.error?.message ||
        t('driverDeliveries.toast.reorderStopsFailed')
      toast.error(msg)
    }
  }

  const handleSetNext = async (orderId: string) => {
    if (!activeRoute) return
    try {
      await setNextStop({ routeId: activeRoute.id, orderId }).unwrap()
      toast.success(t('driverDeliveries.toast.nextStopUpdated'))
      refetchRoute()
    } catch (e: unknown) {
      const msg =
        (e as { data?: { error?: { message?: string } } })?.data?.error?.message ||
        t('driverDeliveries.toast.setNextStopFailed')
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
      toast.success(t('driverDeliveries.toast.routeReady'))
      refetchRoute()
      refetch()
    } catch (e: unknown) {
      const msg =
        (e as { data?: { error?: { message?: string } } })?.data?.error?.message ||
        t('driverDeliveries.toast.buildRouteFailed')
      toast.error(msg)
    }
  }

  const applyRouteStopStatus = async (
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
        failure_reason:
          status === 'FAILED'
            ? notes[orderId] || t('driverDeliveries.deliveryFailedDefault')
            : undefined,
        notes: notes[orderId] || undefined,
      }).unwrap()
      toast.success(t('driverDeliveries.toast.stopUpdated'))
      refetch()
      refetchRoute()
    } catch (e: unknown) {
      const msg =
        (e as { data?: { error?: { message?: string } } })?.data?.error?.message ||
        t('driverDeliveries.toast.updateStopFailed')
      toast.error(msg)
    }
  }

  const handleRouteStopStatus = async (
    stopId: string,
    orderId: string,
    status: 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED'
  ) => {
    // Route stops go through the same proof-of-delivery capture as standalone ones.
    if (status === 'DELIVERED') {
      setPodStop({ stopId, orderId })
      return
    }
    await applyRouteStopStatus(stopId, orderId, status)
  }

  const handleRouteStopPodSubmitted = async () => {
    const target = podStop
    setPodStop(null)
    if (!target) return
    await applyRouteStopStatus(target.stopId, target.orderId, 'DELIVERED')
  }

  const orderByIdRef = useMemo(() => {
    const map = new Map<string, (typeof orders)[number]>()
    for (const order of orders) map.set(order.orderId, order)
    return map
  }, [orders])

  const applyStatus = async (orderId: string, status: DriverDeliveryStatus) => {
    const order = orderByIdRef.get(orderId)
    try {
      await updateStatus({
        orderId,
        status,
        notes: notes[orderId] || undefined,
        failure_reason:
          status === 'failed'
            ? notes[orderId] || t('driverDeliveries.deliveryFailedDefault')
            : undefined,
        // Without these a multi-warehouse order has several active legs and the API
        // cannot tell which one to advance, so it rejects the update outright.
        driver_assignment_id: order?.assignmentId ?? undefined,
        warehouse_assignment_id: order?.warehouseAssignmentId ?? undefined,
      }).unwrap()
      toast.success(t('driverDeliveries.toast.statusUpdated'))
      refetch()
      refetchRoute()
    } catch (e: unknown) {
      const msg =
        (e as { data?: { error?: { message?: string } } })?.data?.error?.message ||
        t('driverDeliveries.toast.updateStatusFailed')
      toast.error(msg)
    }
  }

  const handleStatus = async (orderId: string, status: string) => {
    // Delivering is irreversible, and suppliers with pod_required have the API reject
    // `delivered` until proof exists. Capture proof first — that also stops a stray
    // second tap from delivering the order the instant the previous action resolves.
    if (driverStatusNeedsProofOfDelivery(status)) {
      setPodOrderId(orderId)
      return
    }
    await applyStatus(orderId, status as DriverDeliveryStatus)
  }

  const handlePodSubmitted = () => {
    // complete-delivery already advanced the driver assignment atomically.
    setPodOrderId(null)
    refetch()
    refetchRoute()
  }

  const hasWork =
    Boolean(activeRoute?.stops.length) || activeOrders.length > 0 || completedOrders.length > 0

  let stickyAction: {
    primaryLabel: string
    primarySuccess?: boolean
    onPrimary: () => void
    onProblem?: () => void
    targetLabel?: string | null
  } | null = null

  if (nextRouteStop) {
    if (nextRouteStop.status === 'PLANNED') {
      stickyAction = {
        primaryLabel: t('driverDeliveries.onTheWay'),
        targetLabel: nextRouteStop.restaurantName,
        onPrimary: () =>
          handleRouteStopStatus(nextRouteStop.id, nextRouteStop.orderId, 'OUT_FOR_DELIVERY'),
        onProblem: () => handleRouteStopStatus(nextRouteStop.id, nextRouteStop.orderId, 'FAILED'),
      }
    } else if (nextRouteStop.status === 'OUT_FOR_DELIVERY') {
      stickyAction = {
        primaryLabel: t('driverDeliveries.delivered'),
        primarySuccess: true,
        targetLabel: nextRouteStop.restaurantName,
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
        targetLabel: nextStandaloneOrder.restaurantName,
        onPrimary: () => handleStatus(nextStandaloneOrder.orderId, primary.value),
        onProblem: problem
          ? () => handleStatus(nextStandaloneOrder.orderId, problem.value)
          : undefined,
      }
    }
  }

  return (
    <RequirePermission
      permission="DRIVER_DELIVERIES_VIEW"
      title={t('driverDeliveries.permissionTitle')}
    >
      <PageShell
        data-testid="driver-deliveries-page"
        maxWidth="full"
        className="mx-auto flex max-w-lg flex-col gap-4 overflow-x-hidden p-3 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:p-4 sm:pb-8"
      >
        <DriverDeliveriesHeader
          activeCount={activeCount}
          doneCount={doneCount}
          trackingActive={trackingActive}
          trackableCount={trackableCount}
          permissionDenied={permissionDenied}
          gpsError={gpsError}
          pendingLocationCount={pendingLocationCount}
          lastSyncedAt={lastSyncedAt}
          isLoading={isLoading || routeLoading}
          onRefresh={handleRefresh}
          onStartTracking={startTracking}
          onStopTracking={() => {
            void stopTracking()
          }}
        />

        {(gpsError || permissionDenied) && (
          <p
            className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-base text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
            data-testid="driver-gps-error"
            role="alert"
          >
            {permissionDenied
              ? t('driverDeliveries.locationPermissionNeeded')
              : t('driverDeliveries.locationNotUpdating')}
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
              {t('driverDeliveries.loadFailed')}
            </CardContent>
          </Card>
        )}

        {!isLoading && !isError && !hasWork && (
          <div data-testid="driver-deliveries-empty">
            <EmptyState
              title={t('driverDeliveries.emptyTitle')}
              description={t('driverDeliveries.emptyDescription')}
              icon={<Package className="h-6 w-6" aria-hidden />}
            />
          </div>
        )}

        {routeLoading && !activeRoute && (
          <p className="text-sm text-[var(--text-muted)]" data-testid="driver-route-loading">
            {t('driverDeliveries.routeLoading')}
          </p>
        )}

        {routeError && (
          <Card data-testid="driver-route-error">
            <CardContent className="pt-4 text-sm text-red-600">
              {t('driverDeliveries.routeLoadFailed')}{' '}
              <button type="button" className="underline" onClick={() => refetchRoute()}>
                {t('common:actions.retry')}
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
                    {t('driverDeliveries.deliveriesToday', { count: standaloneEligibleCount })}
                  </p>
                  <p className="text-sm text-[var(--text-muted)]">
                    {t('driverDeliveries.buildRouteHint')}
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
                {t('driverDeliveries.buildMyRoute')}
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
              <h2 className="text-sm font-semibold text-[var(--text-muted)]">
                {t('driverDeliveries.otherDeliveries')}
              </h2>
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
                {showCompleted
                  ? t('driverDeliveries.hideCompleted', { count: completedOrders.length })
                  : t('driverDeliveries.showCompleted', { count: completedOrders.length })}
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
            problemLabel={t('driverDeliveries.actions.problem')}
            targetLabel={stickyAction.targetLabel}
            disabled={updating}
          />
        ) : null}

        <ProofOfDeliveryDialog
          open={podOrderId != null}
          orderId={podOrderId}
          onOpenChange={(open) => {
            if (!open) setPodOrderId(null)
          }}
          completion={{
            driverAssignmentId: podOrderId ? orderByIdRef.get(podOrderId)?.assignmentId : undefined,
            warehouseAssignmentId: podOrderId
              ? orderByIdRef.get(podOrderId)?.warehouseAssignmentId
              : undefined,
          }}
          onSubmitted={handlePodSubmitted}
        />
        <ProofOfDeliveryDialog
          open={podStop != null}
          orderId={podStop?.orderId ?? null}
          onOpenChange={(open) => {
            if (!open) setPodStop(null)
          }}
          completion={{
            driverAssignmentId: podStop
              ? orderByIdRef.get(podStop.orderId)?.assignmentId
              : undefined,
            warehouseAssignmentId: podStop
              ? orderByIdRef.get(podStop.orderId)?.warehouseAssignmentId
              : undefined,
          }}
          onSubmitted={() => {
            void handleRouteStopPodSubmitted()
          }}
        />
      </PageShell>
    </RequirePermission>
  )
}
