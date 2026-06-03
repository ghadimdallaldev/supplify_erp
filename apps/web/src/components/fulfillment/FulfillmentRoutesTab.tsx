import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Skeleton } from '../ui/skeleton'
import { useGetFulfillmentRouteQuery, useGetFulfillmentRoutesQuery } from '../../services/api'
import { FulfillmentRouteDetailPanel } from './FulfillmentRouteDetailPanel'
import { DeliveryTrackingDrawer } from './DeliveryTrackingDrawer'

type Props = {
  warehouseId?: string
}

export function FulfillmentRoutesTab({ warehouseId: _warehouseId }: Props) {
  const { data, isLoading, isError, refetch } = useGetFulfillmentRoutesQuery()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(null)

  const {
    data: detailData,
    isLoading: detailLoading,
    isError: detailError,
    refetch: refetchDetail,
  } = useGetFulfillmentRouteQuery(selectedId ?? '', { skip: !selectedId })

  const routes = data?.routes ?? []

  return (
    <div className="space-y-4" data-testid="fulfillment-routes-tab">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Delivery Routes
          </CardTitle>
          <CardDescription>Planned delivery runs built from Driver Dispatch</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3" data-testid="routes-loading">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          ) : isError ? (
            <div className="py-10 text-center" data-testid="routes-error" role="alert">
              <p className="text-sm text-[var(--text-muted)]">Could not load routes.</p>
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
          ) : routes.length === 0 ? (
            <div
              className="rounded-lg border border-dashed border-[var(--app-border)] bg-[var(--brand-ultra)] py-12 px-4 text-center"
              data-testid="routes-empty"
            >
              <MapPin className="mx-auto mb-3 h-10 w-10 text-[var(--text-muted)]" />
              <p className="font-medium text-[var(--text)]">No routes planned yet</p>
              <p className="mt-2 text-sm text-[var(--text-muted)] max-w-md mx-auto">
                Create a route from{' '}
                <Link to="/app/fulfillment" className="text-[var(--brand-mid)] hover:underline">
                  Driver Dispatch
                </Link>{' '}
                by selecting orders and clicking Create route.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full min-w-[720px] text-sm" data-testid="routes-table">
                <thead>
                  <tr className="border-b text-left text-[var(--text-muted)]">
                    <th className="p-2 font-medium">Route</th>
                    <th className="p-2 font-medium">Driver</th>
                    <th className="p-2 font-medium">Date</th>
                    <th className="p-2 font-medium">Area</th>
                    <th className="p-2 font-medium">Stops</th>
                    <th className="p-2 font-medium">Progress</th>
                    <th className="p-2 font-medium">Status</th>
                    <th className="p-2 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {routes.map((route) => (
                    <tr
                      key={route.id}
                      className={`border-b border-[var(--app-border)] hover:bg-[var(--brand-ultra)] ${
                        selectedId === route.id ? 'bg-[var(--brand-ultra)]' : ''
                      }`}
                    >
                      <td className="p-2 font-medium">{route.routeLabel}</td>
                      <td className="p-2">{route.driverName}</td>
                      <td className="p-2 whitespace-nowrap">
                        {route.scheduledDate
                          ? new Date(route.scheduledDate).toLocaleDateString()
                          : '—'}
                      </td>
                      <td className="p-2 text-[var(--text-muted)]">{route.area || '—'}</td>
                      <td className="p-2 tabular-nums">{route.stops}</td>
                      <td className="p-2 text-xs text-[var(--text-muted)]">
                        {route.completedStops} done · {route.failedStops} failed
                        {route.rescheduledStops > 0 ? ` · ${route.rescheduledStops} resched` : ''}
                      </td>
                      <td className="p-2">
                        <Badge variant={route.status === 'IN_PROGRESS' ? 'default' : 'secondary'}>
                          {route.status}
                        </Badge>
                      </td>
                      <td className="p-2 text-right">
                        <Button size="sm" variant="outline" onClick={() => setSelectedId(route.id)}>
                          View
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

      {selectedId && detailLoading && (
        <Skeleton className="h-48 w-full rounded-xl" data-testid="routes-detail-loading" />
      )}
      {selectedId && detailError && !detailLoading && (
        <div
          className="rounded-xl border border-[var(--app-border)] py-8 text-center"
          data-testid="routes-detail-error"
          role="alert"
        >
          <p className="text-sm text-[var(--text-muted)]">Could not load route details.</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => refetchDetail()}
          >
            Retry
          </Button>
        </div>
      )}
      {selectedId && detailData?.route && !detailLoading && (
        <FulfillmentRouteDetailPanel
          route={detailData.route}
          onClose={() => setSelectedId(null)}
          onViewTracking={setTrackingOrderId}
        />
      )}

      <DeliveryTrackingDrawer
        orderId={trackingOrderId}
        open={!!trackingOrderId}
        onOpenChange={(open) => {
          if (!open) setTrackingOrderId(null)
        }}
      />
    </div>
  )
}
