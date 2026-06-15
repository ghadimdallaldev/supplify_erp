import { useState } from 'react'
import { LayoutGrid, Map, Truck, Navigation } from 'lucide-react'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Skeleton } from '../ui/skeleton'
import { useGetSupplierDeliveryBoardQuery } from '../../services/api'
import { formatDeliveryStatus } from '../../lib/deliveryStatusLabels'
import { getGpsStatusLabel } from '../../lib/deliveryTrackingLabels'
import { formatOrderRef, formatScheduledAt } from './fulfillmentDispatchUtils'
import { DeliveryTrackingDrawer } from './DeliveryTrackingDrawer'
import { ActiveDeliveriesMap } from '../maps/ActiveDeliveriesMap'

type ViewMode = 'board' | 'map'

export function FulfillmentTrackingTab() {
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('board')
  const { data, isLoading, isError, refetch } = useGetSupplierDeliveryBoardQuery(
    { status: 'active_delivery' },
    { pollingInterval: 30_000, skipPollingIfUnfocused: true }
  )

  const orders = data?.orders ?? []

  return (
    <>
      <section
        data-testid="fulfillment-tracking-tab"
        className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--surface)]"
      >
        <header className="border-b border-[var(--app-border)] px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                <Truck className="h-4 w-4 text-[var(--brand-mid)]" aria-hidden />
                Delivery Tracking
              </h2>
              <p className="mt-0.5 text-xs text-[var(--text-mid)]">
                Active deliveries — refreshes every 30s
              </p>
            </div>
            <div
              className="flex rounded-lg border border-[var(--app-border)] bg-[var(--bg)] p-0.5"
              data-testid="fulfillment-tracking-view-toggle"
            >
              <Button
                type="button"
                size="sm"
                variant={viewMode === 'board' ? 'default' : 'ghost'}
                className="h-8 gap-1"
                data-testid="fulfillment-tracking-board-view"
                onClick={() => setViewMode('board')}
              >
                <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
                Board
              </Button>
              <Button
                type="button"
                size="sm"
                variant={viewMode === 'map' ? 'default' : 'ghost'}
                className="h-8 gap-1"
                data-testid="fulfillment-tracking-map-view"
                onClick={() => setViewMode('map')}
              >
                <Map className="h-3.5 w-3.5" aria-hidden />
                Map
              </Button>
            </div>
          </div>
        </header>
        <div className="p-4 sm:p-5">
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
              className="rounded-xl border border-dashed border-[var(--app-border)] bg-[var(--brand-ultra)] py-12 text-center"
              data-testid="tracking-empty"
            >
              <Truck className="mx-auto mb-3 h-9 w-9 text-[var(--text-muted)]" aria-hidden />
              <p className="text-sm text-[var(--text-mid)]">No active deliveries right now.</p>
            </div>
          ) : viewMode === 'map' ? (
            <ActiveDeliveriesMap orders={orders} onSelectOrder={setTrackingOrderId} />
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
        </div>
      </section>

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
