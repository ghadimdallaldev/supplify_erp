import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ArrowDown, ArrowUp, Loader2, XCircle } from 'lucide-react'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { formatDeliveryStatus } from '../../lib/deliveryStatusLabels'
import type { DeliveryRouteDetail } from '../../types'
import {
  useCancelFulfillmentRouteMutation,
  useReorderFulfillmentRouteStopsMutation,
  useUpdateFulfillmentRouteMutation,
  useUpdateFulfillmentRouteStopMutation,
} from '../../services/api'
import { usePermissions } from '../../hooks/usePermissions'
import { formatOrderRef } from './fulfillmentDispatchUtils'
import { getGpsStatusLabel } from '../../lib/deliveryTrackingLabels'

type Props = {
  route: DeliveryRouteDetail
  onClose: () => void
  onViewTracking?: (orderId: string) => void
}

export function FulfillmentRouteDetailPanel({ route, onClose, onViewTracking }: Props) {
  const { can } = usePermissions()
  const canManage = can('FULFILLMENT_MANAGE')

  const [reorderStops, { isLoading: reordering }] = useReorderFulfillmentRouteStopsMutation()
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

  const startRoute = async () => {
    try {
      await updateRoute({ id: route.id, status: 'IN_PROGRESS' }).unwrap()
      toast.success('Route started')
    } catch {
      toast.error('Could not start route')
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

  return (
    <div
      data-testid="fulfillment-route-detail"
      className="rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-4 space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-lg">{route.routeLabel}</h3>
          <p className="text-sm text-[var(--text-muted)]">
            {route.routeNumber} · {route.driverName}
            {route.area ? ` · ${route.area}` : ''}
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            {new Date(route.scheduledDate).toLocaleDateString()} · {route.stops.length} stops ·{' '}
            {route.completedStops} delivered · {route.failedStops} failed
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge>{route.status}</Badge>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      {canManage && route.status === 'PLANNED' && (
        <div className="space-y-2">
          <Button size="sm" onClick={startRoute} disabled={updatingRoute}>
            Activate route (start dispatch)
          </Button>
          <p className="text-xs text-[var(--text-muted)]">
            Assigns drivers to dispatch-ready stops only. Orders still being prepared stay planned
            on the route until they are ready.
          </p>
        </div>
      )}

      <ol className="space-y-3">
        {route.stops.map((stop, index) => (
          <li
            key={stop.id}
            className="rounded-lg border border-[var(--app-border)] p-3 flex flex-col gap-2 sm:flex-row sm:justify-between"
          >
            <div className="min-w-0">
              <p className="text-xs text-[var(--text-muted)]">Stop {stop.sequenceNumber}</p>
              <p className="font-medium">{stop.restaurantName}</p>
              <p className="text-xs text-[var(--text-muted)]">
                <Link
                  to={`/app/orders/${stop.orderId}`}
                  className="text-[var(--brand-mid)] hover:underline"
                >
                  {formatOrderRef(stop.orderId)}
                </Link>
                {stop.deliveryArea ? ` · ${stop.deliveryArea}` : ''}
              </p>
              {stop.addressLine && (
                <p className="text-xs text-[var(--text-muted)] mt-1">{stop.addressLine}</p>
              )}
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <Badge variant="outline">{formatDeliveryStatus(stop.status)}</Badge>
                {stop.tracking && (
                  <span className="text-[10px] text-[var(--text-muted)]">
                    {getGpsStatusLabel(stop.tracking)}
                  </span>
                )}
              </div>
              {onViewTracking && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 mt-1 text-xs"
                  onClick={() => onViewTracking(stop.orderId)}
                >
                  View tracking
                </Button>
              )}
            </div>
            {editable && (
              <div className="flex flex-wrap gap-1 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={index === 0 || reordering}
                  onClick={() => moveStop(index, -1)}
                  aria-label="Move up"
                >
                  <ArrowUp className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={index === route.stops.length - 1 || reordering}
                  onClick={() => moveStop(index, 1)}
                  aria-label="Move down"
                >
                  <ArrowDown className="h-3 w-3" />
                </Button>
                {stop.status === 'PLANNED' && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={updatingStop}
                    onClick={() => setStopStatus(stop.id, 'OUT_FOR_DELIVERY')}
                  >
                    Out
                  </Button>
                )}
                {['PLANNED', 'OUT_FOR_DELIVERY'].includes(stop.status) && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={updatingStop}
                    onClick={() => setStopStatus(stop.id, 'DELIVERED')}
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
                    onClick={() => setStopStatus(stop.id, 'FAILED')}
                  >
                    Failed
                  </Button>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>

      {canManage && route.status !== 'CANCELLED' && route.status !== 'COMPLETED' && (
        <Button variant="destructive" size="sm" onClick={handleCancel} disabled={cancelling}>
          {cancelling ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <XCircle className="mr-2 h-4 w-4" />
          )}
          Cancel route
        </Button>
      )}
    </div>
  )
}
