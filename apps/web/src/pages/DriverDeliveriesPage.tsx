import { useState } from 'react'
import { Truck, RefreshCw, MapPin } from 'lucide-react'
import { RequirePermission } from '../components/RequirePermission'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import {
  useGetDriverActiveRouteQuery,
  useGetSupplierDeliveryBoardQuery,
  useUpdateFulfillmentRouteStopMutation,
  useUpdateOrderDeliveryStatusMutation,
} from '../services/api'
import { formatDeliveryStatus } from '../lib/deliveryStatusLabels'
import { formatOrderRef } from '../components/fulfillment/fulfillmentDispatchUtils'
import { toast } from 'sonner'

const DRIVER_STATUSES = [
  { value: 'out_for_delivery', label: 'Out for delivery' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'failed', label: 'Failed' },
  { value: 'rescheduled', label: 'Rescheduled' },
] as const

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

  const orders = data?.orders ?? []
  const activeRoute = routeData?.route ?? null

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

  return (
    <RequirePermission permission="DRIVER_DELIVERIES_VIEW" title="my deliveries">
      <div
        data-testid="driver-deliveries-page"
        className="mx-auto flex max-w-lg flex-col gap-4 p-4 pb-24"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Truck className="h-6 w-6 text-[var(--brand-mid)]" aria-hidden />
            <h1 className="text-xl font-semibold text-[var(--text)]">My deliveries</h1>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className="mr-1 h-4 w-4" />
            Refresh
          </Button>
        </div>

        {isLoading && (
          <p className="text-sm text-[var(--text-muted)]" data-testid="driver-deliveries-loading">
            Loading assignments…
          </p>
        )}
        {isError && (
          <Card data-testid="driver-deliveries-error">
            <CardContent className="pt-4 text-sm text-red-600">
              Could not load deliveries. Try again.
            </CardContent>
          </Card>
        )}
        {!isLoading && !isError && orders.length === 0 && !activeRoute && (
          <Card data-testid="driver-deliveries-empty">
            <CardContent className="pt-4 text-sm text-[var(--text-muted)]">
              No deliveries assigned to you right now.
            </CardContent>
          </Card>
        )}

        {routeLoading && (
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

        {activeRoute && !routeLoading && (
          <Card data-testid="driver-active-route">
            <CardHeader>
              <CardTitle className="text-base">{activeRoute.routeLabel}</CardTitle>
              <p className="text-sm text-[var(--text-muted)]">
                {activeRoute.stops.length} stops · {formatDeliveryStatus(activeRoute.status)}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {activeRoute.stops.map((stop) => (
                <div
                  key={stop.id}
                  className="rounded-lg border border-[var(--app-border)] p-3 space-y-2"
                >
                  <p className="font-medium text-sm">{stop.restaurantName}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    Stop {stop.sequenceNumber} · {formatOrderRef(stop.orderId)}
                  </p>
                  <Badge variant="outline">{formatDeliveryStatus(stop.status)}</Badge>
                  <textarea
                    className="min-h-[48px] w-full rounded-md border border-[var(--app-border)] bg-[var(--surface)] p-2 text-sm"
                    placeholder="Notes"
                    value={notes[stop.orderId] ?? ''}
                    onChange={(e) =>
                      setNotes((prev) => ({ ...prev, [stop.orderId]: e.target.value }))
                    }
                  />
                  <div className="grid grid-cols-2 gap-2">
                    {stop.status === 'PLANNED' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={updating}
                        onClick={() =>
                          handleRouteStopStatus(stop.id, stop.orderId, 'OUT_FOR_DELIVERY')
                        }
                      >
                        Out for delivery
                      </Button>
                    )}
                    {['PLANNED', 'OUT_FOR_DELIVERY'].includes(stop.status) && (
                      <Button
                        size="sm"
                        disabled={updating}
                        onClick={() => handleRouteStopStatus(stop.id, stop.orderId, 'DELIVERED')}
                      >
                        Delivered
                      </Button>
                    )}
                    {stop.status !== 'DELIVERED' && stop.status !== 'FAILED' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="col-span-2"
                        disabled={updating}
                        onClick={() => handleRouteStopStatus(stop.id, stop.orderId, 'FAILED')}
                      >
                        Failed
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {orders.map((order) => (
          <Card key={order.orderId} data-testid={`driver-delivery-${order.orderId}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{order.restaurantName}</CardTitle>
              <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-muted)]">
                <MapPin className="h-3.5 w-3.5" aria-hidden />
                {order.deliveryArea}
                <Badge variant="outline">{order.deliveryStatus}</Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <textarea
                className="min-h-[60px] w-full rounded-md border border-[var(--app-border)] bg-[var(--surface)] p-2 text-sm"
                placeholder="Delivery notes (optional)"
                value={notes[order.orderId] ?? ''}
                onChange={(e) => setNotes((prev) => ({ ...prev, [order.orderId]: e.target.value }))}
              />
              <div className="grid grid-cols-2 gap-2">
                {DRIVER_STATUSES.map((s) => (
                  <Button
                    key={s.value}
                    size="sm"
                    variant={s.value === 'delivered' ? 'default' : 'outline'}
                    disabled={updating}
                    onClick={() => handleStatus(order.orderId, s.value)}
                  >
                    {s.label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </RequirePermission>
  )
}
