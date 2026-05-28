import { Link } from 'react-router-dom'
import { Truck } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Skeleton } from '../ui/skeleton'
import { useGetSupplierDeliveryBoardQuery } from '../../services/api'
import { formatDeliveryStatus } from '../../lib/deliveryStatusLabels'
import { formatOrderRef, formatScheduledAt } from './fulfillmentDispatchUtils'

export function FulfillmentTrackingTab() {
  const { data, isLoading, isError, refetch } = useGetSupplierDeliveryBoardQuery({
    status: 'out_for_delivery',
  })

  const orders = data?.orders ?? []

  return (
    <Card data-testid="fulfillment-tracking-tab">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Truck className="h-5 w-5" />
          Delivery Tracking
        </CardTitle>
        <CardDescription>Active deliveries currently out for delivery</CardDescription>
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
            <table className="w-full min-w-[640px] text-sm" data-testid="tracking-table">
              <thead>
                <tr className="border-b text-left text-[var(--text-muted)]">
                  <th className="p-2 font-medium">Order</th>
                  <th className="p-2 font-medium">Restaurant</th>
                  <th className="p-2 font-medium">Driver</th>
                  <th className="p-2 font-medium">Area</th>
                  <th className="p-2 font-medium">ETA / scheduled</th>
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
                    <td className="p-2">
                      <Badge variant="secondary">{formatDeliveryStatus(o.deliveryStatus)}</Badge>
                    </td>
                    <td className="p-2 text-right">
                      <Button variant="outline" size="sm" asChild>
                        <Link to={`/app/orders/${o.orderId}`}>View</Link>
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
  )
}
