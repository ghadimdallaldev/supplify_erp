import { useState } from 'react'
import { Truck, RefreshCw, MapPin, Package, Navigation } from 'lucide-react'
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
import { formatPrice } from '../utils/format'
import toast from 'react-hot-toast'

const DRIVER_STATUSES = [
  { value: 'out_for_delivery', label: 'Out for delivery' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'failed', label: 'Failed' },
  { value: 'rescheduled', label: 'Rescheduled' },
] as const

const driverActionClass = 'min-h-[44px] w-full text-sm font-semibold sm:min-h-[40px]'

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
        className="mx-auto flex max-w-lg flex-col gap-4 overflow-x-hidden p-3 pb-28 sm:p-4 sm:pb-24"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Truck className="h-6 w-6 shrink-0 text-[var(--brand-mid)]" aria-hidden />
            <h1 className="truncate text-xl font-semibold text-[var(--text)]">My deliveries</h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => refetch()}
            disabled={isLoading}
          >
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
                  className="space-y-3 rounded-lg border border-[var(--app-border)] p-3"
                  data-testid={`driver-route-stop-${stop.id}`}
                >
                  <div className="space-y-1">
                    <p className="text-base font-semibold leading-snug">{stop.restaurantName}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Stop {stop.sequenceNumber} · {formatOrderRef(stop.orderId)}
                    </p>
                    {stop.deliveryArea ? (
                      <p className="flex items-start gap-1.5 text-sm text-[var(--text-mid)]">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                        <span>{stop.deliveryArea}</span>
                      </p>
                    ) : null}
                    {stop.addressLine ? (
                      <p className="text-sm text-[var(--text)]">{stop.addressLine}</p>
                    ) : null}
                    {(stop.itemCount > 0 || stop.totalAmount > 0) && (
                      <p className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                        <Package className="h-3.5 w-3.5" aria-hidden />
                        {stop.itemCount > 0 ? `${stop.itemCount} items` : null}
                        {stop.totalAmount > 0 ? formatPrice(stop.totalAmount) : null}
                      </p>
                    )}
                    <Badge variant="outline">{formatDeliveryStatus(stop.status)}</Badge>
                  </div>
                  {stop.addressLine ? (
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(stop.addressLine)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md border border-[var(--app-border)] px-3 text-sm font-medium text-[var(--brand-mid)]"
                    >
                      <Navigation className="h-4 w-4" aria-hidden />
                      Open in maps
                    </a>
                  ) : null}
                  <textarea
                    className="min-h-[52px] w-full rounded-md border border-[var(--app-border)] bg-[var(--surface)] p-3 text-base sm:text-sm"
                    placeholder="Delivery notes (optional)"
                    value={notes[stop.orderId] ?? ''}
                    onChange={(e) =>
                      setNotes((prev) => ({ ...prev, [stop.orderId]: e.target.value }))
                    }
                  />
                  <div className="grid grid-cols-1 gap-2 xs:grid-cols-2">
                    {stop.status === 'PLANNED' && (
                      <Button
                        size="lg"
                        variant="outline"
                        className={driverActionClass}
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
                        size="lg"
                        className={driverActionClass}
                        disabled={updating}
                        onClick={() => handleRouteStopStatus(stop.id, stop.orderId, 'DELIVERED')}
                      >
                        Delivered
                      </Button>
                    )}
                    {stop.status !== 'DELIVERED' && stop.status !== 'FAILED' && (
                      <Button
                        size="lg"
                        variant="outline"
                        className={`${driverActionClass} xs:col-span-2`}
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
              <CardTitle className="text-base leading-snug">{order.restaurantName}</CardTitle>
              <div className="flex flex-col gap-1 text-sm text-[var(--text-muted)]">
                <p className="flex items-start gap-1.5">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>{order.deliveryArea || 'Area not set'}</span>
                </p>
                <p className="text-xs">{formatOrderRef(order.orderId)}</p>
                <Badge variant="outline" className="w-fit">
                  {formatDeliveryStatus(order.deliveryStatus)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <textarea
                className="min-h-[52px] w-full rounded-md border border-[var(--app-border)] bg-[var(--surface)] p-3 text-base sm:text-sm"
                placeholder="Delivery notes (optional)"
                value={notes[order.orderId] ?? ''}
                onChange={(e) => setNotes((prev) => ({ ...prev, [order.orderId]: e.target.value }))}
              />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {DRIVER_STATUSES.map((s) => (
                  <Button
                    key={s.value}
                    size="lg"
                    variant={s.value === 'delivered' ? 'default' : 'outline'}
                    className={driverActionClass}
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
