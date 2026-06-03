import { useState } from 'react'
import { Truck, Navigation } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Skeleton } from '../ui/skeleton'
import { useGetSupplierDeliveryBoardQuery } from '../../services/api'
import { formatDeliveryStatus } from '../../lib/deliveryStatusLabels'
import { getGpsStatusLabel } from '../../lib/deliveryTrackingLabels'
import { formatOrderRef, formatScheduledAt } from './fulfillmentDispatchUtils'
import { DeliveryTrackingDrawer } from './DeliveryTrackingDrawer'

export function FulfillmentTrackingTab() {
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(null)
  const { data, isLoading, isError, refetch } = useGetSupplierDeliveryBoardQuery(
    { status: 'out_for_delivery' },
    { pollingInterval: 30_000, skipPollingIfUnfocused: true }
  )

  const orders = data?.orders ?? []

  return (
    <>
      <Card data-testid="fulfillment-tracking-tab">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Delivery Tracking
          </CardTitle>
          <CardDescription>
            Active deliveries picked up or out for delivery (refreshes every 30s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3" data-testid="tracking-loading">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          ) : isError ? (
            <div className="py-10 text-center" data-testid="tracking-error" role="alert">
              <p className="text-sm text-[var(--text-muted)]">Could not load active deliveries.</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => refetch()}
              >
                Retry
              </Button>
            </div>
          ) : orders.length === 0 ? (
            <div
              className="py-10 text-center text-sm text-[var(--text-muted)]"
              data-testid="tracking-empty"
            >
              No deliveries currently in transit.
            </div>
          ) : (
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full min-w-[720px] text-sm" data-testid="tracking-table">
                <thead>
                  <tr className="border-b text-left text-[var(--text-muted)]">
                    <th className="p-2 font-medium">Order</th>
                    <th className="p-2 font-medium">Restaurant</th>
                    <th className="p-2 font-medium">Driver</th>
                    <th className="p-2 font-medium">Area</th>
                    <th className="p-2 font-medium">Scheduled</th>
                    <th className="p-2 font-medium">GPS</th>
                    <th className="p-2 font-medium">Status</th>
                    <th className="p-2 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr
                      key={o.orderId}
                      className="border-b border-[var(--app-border)] hover:bg-[var(--brand-ultra)]"
                    >
                      <td className="p-2 font-mono text-xs">{formatOrderRef(o.orderId)}</td>
                      <td className="p-2">{o.restaurantName}</td>
                      <td className="p-2">{o.driverName || 'Unassigned'}</td>
                      <td className="p-2 text-[var(--text-muted)]">
                        {o.deliveryArea?.trim() || 'Area not set'}
                      </td>
                      <td className="p-2 text-[var(--text-muted)]">
                        {formatScheduledAt(o.scheduledAt)}
                      </td>
                      <td
                        className="p-2 text-[var(--text-muted)]"
                        data-testid="tracking-gps-status"
                      >
                        <span
                          className={
                            o.tracking?.isStale ? 'text-amber-700 dark:text-amber-400' : ''
                          }
                        >
                          {getGpsStatusLabel(o.tracking)}
                        </span>
                      </td>
                      <td className="p-2">
                        <Badge variant="secondary">{formatDeliveryStatus(o.deliveryStatus)}</Badge>
                      </td>
                      <td className="p-2 text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          data-testid={`tracking-view-${o.orderId}`}
                          onClick={() => setTrackingOrderId(o.orderId)}
                        >
                          <Navigation className="h-3.5 w-3.5 mr-1" aria-hidden />
                          View tracking
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <DeliveryTrackingDrawer
        orderId={trackingOrderId}
        open={!!trackingOrderId}
        onOpenChange={(open) => {
          if (!open) setTrackingOrderId(null)
        }}
      />
    </>
  )
}
