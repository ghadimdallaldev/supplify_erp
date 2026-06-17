import { useEffect, useState } from 'react'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, ChevronDown, Loader2, Star, XCircle } from 'lucide-react'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../ui/sheet'
import type { DeliveryRouteDetail, DeliveryRouteStop } from '../../types'
import {
  useCancelFulfillmentRouteMutation,
  useReorderFulfillmentRouteStopsMutation,
  useOptimizeFulfillmentRouteMutation,
  useSetNextFulfillmentRouteStopMutation,
  useUpdateFulfillmentRouteMutation,
  useUpdateFulfillmentRouteStopMutation,
} from '../../services/api'
import { usePermissions } from '../../hooks/usePermissions'
import { formatOrderRef } from './fulfillmentDispatchUtils'
import { getGpsStatusLabel } from '../../lib/deliveryTrackingLabels'
import {
  formatFulfillmentRouteStatus,
  formatFulfillmentStopStatus,
  getFulfillmentStopPrimaryAction,
  getStopEtaLabel,
} from '../../lib/fulfillmentRouteLabels'

type Props = {
  route: DeliveryRouteDetail
  onClose: () => void
  onViewTracking?: (orderId: string) => void
}

const mobileActionClass = 'min-h-[44px] w-full text-sm font-semibold'

function RouteStopCard({
  stop,
  index,
  route,
  editable,
  nextStopId,
  expanded,
  onToggleDetails,
  onSetNext,
  onMoveStop,
  onSetStatus,
  onViewTracking,
  reordering,
  settingNext,
  updatingStop,
}: {
  stop: DeliveryRouteStop
  index: number
  route: DeliveryRouteDetail
  editable: boolean
  nextStopId?: string
  expanded: boolean
  onToggleDetails: () => void
  onSetNext: (orderId: string) => void
  onMoveStop: (index: number, direction: -1 | 1) => void
  onSetStatus: (stopId: string, status: 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED') => void
  onViewTracking?: (orderId: string) => void
  reordering: boolean
  settingNext: boolean
  updatingStop: boolean
}) {
  const badge = formatFulfillmentStopStatus(stop, route.status)
  const etaLabel = getStopEtaLabel(stop)
  const gpsLabel = stop.tracking ? getGpsStatusLabel(stop.tracking) : null
  const primaryAction = editable ? getFulfillmentStopPrimaryAction(stop) : null
  const orderRef = stop.orderNumber ?? formatOrderRef(stop.orderId)
  const isNext = stop.id === nextStopId && stop.status !== 'DELIVERED' && stop.status !== 'FAILED'
  const hasSecondaryDetails = Boolean(
    stop.deliveryArea || stop.addressLine || stop.itemCount > 0 || stop.totalAmount > 0
  )
  const showSecondaryActions = editable && !['DELIVERED', 'FAILED'].includes(stop.status)

  const secondaryActionRow = editable ? (
    <div className="flex flex-wrap gap-1">
      {!['DELIVERED', 'FAILED'].includes(stop.status) && stop.id !== nextStopId ? (
        <Button
          size="sm"
          variant="outline"
          disabled={settingNext}
          onClick={() => onSetNext(stop.orderId)}
          title="Set as next"
        >
          <Star className="h-3 w-3" />
        </Button>
      ) : null}
      {!['DELIVERED', 'FAILED'].includes(stop.status) ? (
        <>
          <Button
            size="sm"
            variant="outline"
            disabled={index === 0 || reordering}
            onClick={() => onMoveStop(index, -1)}
            aria-label="Move up"
          >
            <ArrowUp className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={index === route.stops.length - 1 || reordering}
            onClick={() => onMoveStop(index, 1)}
            aria-label="Move down"
          >
            <ArrowDown className="h-3 w-3" />
          </Button>
        </>
      ) : null}
      {stop.status === 'PLANNED' && (
        <Button
          size="sm"
          variant="outline"
          disabled={updatingStop}
          onClick={() => onSetStatus(stop.id, 'OUT_FOR_DELIVERY')}
        >
          Out
        </Button>
      )}
      {['PLANNED', 'OUT_FOR_DELIVERY'].includes(stop.status) && (
        <Button
          size="sm"
          variant="outline"
          disabled={updatingStop}
          onClick={() => onSetStatus(stop.id, 'DELIVERED')}
        >
          Delivered
        </Button>
      )}
      {stop.status !== 'DELIVERED' && stop.status !== 'FAILED' && (
        <Button
          size="sm"
          variant="ghost"
          className="text-[var(--red)]"
          disabled={updatingStop}
          onClick={() => onSetStatus(stop.id, 'FAILED')}
        >
          Problem
        </Button>
      )}
    </div>
  ) : null

  return (
    <li
      data-testid={`fulfillment-route-stop-${stop.id}`}
      className={`rounded-xl border border-[var(--app-border)] p-4 sm:flex sm:flex-row sm:justify-between sm:gap-3 sm:p-3 ${
        isNext
          ? 'ring-1 ring-[var(--brand-mid)]/30 bg-[var(--brand-ultra)]/30'
          : 'bg-[var(--surface)]'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold sm:h-8 sm:w-8 sm:text-xs ${
              stop.status === 'DELIVERED'
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                : isNext
                  ? 'bg-[var(--brand-mid)] text-white'
                  : 'bg-[var(--brand-ultra)] text-[var(--text-muted)]'
            }`}
          >
            {stop.sequenceNumber}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            {isNext ? (
              <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--brand-mid)]">
                Next stop
              </p>
            ) : null}
            <p className="font-semibold leading-snug">{stop.restaurantName}</p>
            <p className="text-sm text-[var(--text-muted)]">
              <Link
                to={`/app/orders/${stop.orderId}`}
                className="text-[var(--brand-mid)] hover:underline"
              >
                {orderRef}
              </Link>
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Badge variant={badge.variant}>{badge.label}</Badge>
            </div>
            {etaLabel ? (
              <p className="text-sm font-medium text-[var(--text)]" data-testid="stop-eta">
                {etaLabel}
              </p>
            ) : null}
            {gpsLabel ? (
              <p className="text-xs text-[var(--text-muted)]" data-testid="stop-gps">
                {gpsLabel}
              </p>
            ) : null}
          </div>
        </div>

        {hasSecondaryDetails ? (
          <div className="mt-3 sm:mt-2">
            <button
              type="button"
              className="inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-[var(--brand-mid)] sm:min-h-0 sm:text-xs"
              onClick={onToggleDetails}
              aria-expanded={expanded}
              data-testid={`stop-details-toggle-${stop.id}`}
            >
              {expanded ? 'Hide details' : 'Show details'}
              <ChevronDown
                className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </button>
            {expanded ? (
              <div
                className="mt-2 space-y-1 text-sm text-[var(--text-muted)]"
                data-testid={`stop-details-${stop.id}`}
              >
                {stop.deliveryArea ? <p>{stop.deliveryArea}</p> : null}
                {stop.addressLine ? <p>{stop.addressLine}</p> : null}
                {stop.itemCount > 0 || stop.totalAmount > 0 ? (
                  <p>
                    {stop.itemCount > 0 ? `${stop.itemCount} items` : null}
                    {stop.itemCount > 0 && stop.totalAmount > 0 ? ' · ' : null}
                    {stop.totalAmount > 0 ? `$${stop.totalAmount.toFixed(2)}` : null}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {onViewTracking ? (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="mt-2 h-auto min-h-[44px] p-0 text-sm sm:min-h-0 sm:text-xs"
            onClick={() => onViewTracking(stop.orderId)}
          >
            View tracking
          </Button>
        ) : null}
      </div>

      {editable ? (
        <>
          <div className="mt-3 space-y-2 sm:hidden">
            {primaryAction ? (
              <Button
                size="lg"
                className={mobileActionClass}
                disabled={updatingStop}
                data-testid={`stop-primary-action-${stop.id}`}
                onClick={() => onSetStatus(stop.id, primaryAction.status)}
              >
                {primaryAction.label}
              </Button>
            ) : null}
            {showSecondaryActions && stop.status !== 'DELIVERED' && stop.status !== 'FAILED' ? (
              <Button
                size="lg"
                variant="outline"
                className={`${mobileActionClass} border-red-200 text-red-700`}
                disabled={updatingStop}
                onClick={() => onSetStatus(stop.id, 'FAILED')}
              >
                Problem
              </Button>
            ) : null}
            {expanded && showSecondaryActions ? (
              <div className="grid grid-cols-3 gap-2 pt-1">
                {stop.id !== nextStopId ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-[44px] text-xs"
                    disabled={settingNext}
                    onClick={() => onSetNext(stop.orderId)}
                  >
                    <Star className="mr-1 h-4 w-4" aria-hidden />
                    Next
                  </Button>
                ) : (
                  <span />
                )}
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-[44px] text-xs"
                  disabled={index === 0 || reordering}
                  onClick={() => onMoveStop(index, -1)}
                  aria-label="Move up"
                >
                  <ArrowUp className="mr-1 h-4 w-4" aria-hidden />
                  Up
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-[44px] text-xs"
                  disabled={index === route.stops.length - 1 || reordering}
                  onClick={() => onMoveStop(index, 1)}
                  aria-label="Move down"
                >
                  <ArrowDown className="mr-1 h-4 w-4" aria-hidden />
                  Down
                </Button>
              </div>
            ) : null}
          </div>
          <div className="hidden shrink-0 sm:block">{secondaryActionRow}</div>
        </>
      ) : null}
    </li>
  )
}

export function FulfillmentRouteDetailPanel({ route, onClose, onViewTracking }: Props) {
  const { can } = usePermissions()
  const canManage = can('FULFILLMENT_MANAGE')
  const [expandedStops, setExpandedStops] = useState<Record<string, boolean>>({})
  const isDesktop = useMediaQuery('(min-width: 640px)', false)

  const [reorderStops, { isLoading: reordering }] = useReorderFulfillmentRouteStopsMutation()
  const [optimizeRoute, { isLoading: optimizing }] = useOptimizeFulfillmentRouteMutation()
  const [setNextStop, { isLoading: settingNext }] = useSetNextFulfillmentRouteStopMutation()
  const [updateRoute, { isLoading: updatingRoute }] = useUpdateFulfillmentRouteMutation()
  const [updateStop, { isLoading: updatingStop }] = useUpdateFulfillmentRouteStopMutation()
  const [cancelRoute, { isLoading: cancelling }] = useCancelFulfillmentRouteMutation()

  const moveStop = async (index: number, direction: -1 | 1) => {
    const next = index + direction
    if (next < 0 || next >= route.stops.length) return
    const ids = route.stops.map((s) => s.id)
    const tmp = ids[index]
    ids[index] = ids[next]
    ids[next] = tmp
    try {
      await reorderStops({ routeId: route.id, stop_ids: ids }).unwrap()
      toast.success('Stop order updated')
    } catch {
      toast.error('Could not reorder stops')
    }
  }

  const setStopStatus = async (
    stopId: string,
    status: 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED'
  ) => {
    try {
      await updateStop({ routeId: route.id, stopId, status }).unwrap()
      toast.success('Stop updated')
    } catch (e: unknown) {
      const msg = (e as { data?: { error?: { message?: string } } })?.data?.error?.message
      toast.error(msg || 'Update failed')
    }
  }

  const handleOptimize = async (apply: boolean) => {
    try {
      const result = await optimizeRoute({ routeId: route.id, apply }).unwrap()
      const km = result.preview?.estimatedDistanceKm
      if (apply) {
        toast.success(
          km != null ? `Route optimized (~${km} km estimated)` : 'Route stop order updated'
        )
      } else {
        const ok = window.confirm(
          `Optimize stop order? Estimated distance ~${km ?? '?'} km. Apply new order?`
        )
        if (ok) {
          await optimizeRoute({ routeId: route.id, apply: true }).unwrap()
          toast.success('Route optimized')
        }
      }
    } catch (e: unknown) {
      const msg = (e as { data?: { error?: { message?: string } } })?.data?.error?.message
      toast.error(msg || 'Could not optimize route')
    }
  }

  const startRoute = async () => {
    try {
      await updateRoute({ id: route.id, status: 'IN_PROGRESS' }).unwrap()
      toast.success('Route started')
    } catch (e: unknown) {
      const msg = (e as { data?: { error?: { message?: string } } })?.data?.error?.message
      toast.error(msg || 'Could not start route')
    }
  }

  const handleCancel = async () => {
    if (!confirm('Cancel this route? Stops will be released from the route.')) return
    try {
      await cancelRoute(route.id).unwrap()
      toast.success('Route cancelled')
      onClose()
    } catch {
      toast.error('Could not cancel route')
    }
  }

  const editable = canManage && ['PLANNED', 'IN_PROGRESS'].includes(route.status)
  const nextStopId = route.stops.find((s) => !['DELIVERED', 'FAILED'].includes(s.status))?.id

  const handleSetNext = async (orderId: string) => {
    try {
      await setNextStop({ routeId: route.id, orderId }).unwrap()
      toast.success('Next stop updated')
    } catch {
      toast.error('Could not set next stop')
    }
  }

  const toggleStopDetails = (stopId: string) => {
    setExpandedStops((prev) => ({ ...prev, [stopId]: !prev[stopId] }))
  }

  const detailContent = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {isDesktop ? (
            <>
              <SheetHeader className="space-y-1 p-0 text-left">
                <SheetTitle className="text-lg leading-snug">{route.routeLabel}</SheetTitle>
                <SheetDescription>
                  {route.routeNumber} · {route.driverName}
                  {route.area ? ` · ${route.area}` : ''}
                </SheetDescription>
              </SheetHeader>
              <p className="text-xs text-[var(--text-muted)] mt-2">
                {new Date(route.scheduledDate).toLocaleDateString()} · {route.stops.length} stops ·{' '}
                {route.completedStops} delivered · {route.failedStops} failed
              </p>
            </>
          ) : (
            <>
              <h3 className="font-semibold text-lg leading-snug">{route.routeLabel}</h3>
              <p className="text-sm text-[var(--text-muted)]">
                {route.routeNumber} · {route.driverName}
                {route.area ? ` · ${route.area}` : ''}
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                {new Date(route.scheduledDate).toLocaleDateString()} · {route.stops.length} stops ·{' '}
                {route.completedStops} delivered · {route.failedStops} failed
              </p>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Badge variant={route.status === 'IN_PROGRESS' ? 'default' : 'secondary'}>
            {formatFulfillmentRouteStatus(route.status)}
          </Badge>
          {!isDesktop ? (
            <Button variant="ghost" size="sm" className="min-h-[44px] sm:min-h-0" onClick={onClose}>
              Close
            </Button>
          ) : null}
        </div>
      </div>

      {canManage && editable && route.stops.length >= 2 && (
        <Button
          variant="outline"
          size="sm"
          className="min-h-[44px] w-full sm:min-h-0 sm:w-auto"
          onClick={() => handleOptimize(false)}
          disabled={optimizing}
        >
          {optimizing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Optimize stop order
        </Button>
      )}

      {canManage && route.status === 'PLANNED' && (
        <div className="space-y-2">
          <Button
            size="lg"
            className="min-h-[44px] w-full sm:min-h-0 sm:w-auto"
            onClick={startRoute}
            disabled={updatingRoute}
          >
            Activate ready orders
          </Button>
          <p className="text-xs text-[var(--text-muted)]">
            Starts dispatch for orders that are ready. Orders still waiting for preparation stay on
            the planned route until they are ready for dispatch.
          </p>
        </div>
      )}

      <ol className="space-y-3" data-testid="fulfillment-route-stops">
        {route.stops.map((stop, index) => (
          <RouteStopCard
            key={stop.id}
            stop={stop}
            index={index}
            route={route}
            editable={editable}
            nextStopId={nextStopId}
            expanded={Boolean(expandedStops[stop.id])}
            onToggleDetails={() => toggleStopDetails(stop.id)}
            onSetNext={handleSetNext}
            onMoveStop={moveStop}
            onSetStatus={setStopStatus}
            onViewTracking={onViewTracking}
            reordering={reordering}
            settingNext={settingNext}
            updatingStop={updatingStop}
          />
        ))}
      </ol>

      {canManage && route.status !== 'CANCELLED' && route.status !== 'COMPLETED' && (
        <Button
          variant="destructive"
          size="lg"
          className="min-h-[44px] w-full sm:min-h-0 sm:w-auto"
          onClick={handleCancel}
          disabled={cancelling}
        >
          {cancelling ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <XCircle className="mr-2 h-4 w-4" />
          )}
          Cancel route
        </Button>
      )}
    </>
  )

  if (isDesktop) {
    return (
      <Sheet open onOpenChange={(open) => !open && onClose()}>
        <SheetContent
          side="right"
          width="wide"
          className="flex h-full flex-col gap-4 overflow-hidden"
        >
          <div
            data-testid="fulfillment-route-detail"
            className="min-h-0 flex-1 space-y-4 overflow-y-auto"
          >
            {detailContent}
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <div
      data-testid="fulfillment-route-detail"
      className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-4 space-y-4"
    >
      {detailContent}
    </div>
  )
}
