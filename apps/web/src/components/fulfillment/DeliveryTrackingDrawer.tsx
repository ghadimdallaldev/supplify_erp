import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'
import { Badge } from '../ui/badge'
import { Skeleton } from '../ui/skeleton'
import { useGetOrderTrackingQuery } from '../../services/api'
import { formatDeliveryStatus } from '../../lib/deliveryStatusLabels'
import { formatOrderRef } from './fulfillmentDispatchUtils'
import { getGpsStatusLabel } from '../../lib/deliveryTrackingLabels'
import { DeliveryTrackingMap } from '../maps/DeliveryTrackingMap'

type Props = {
  orderId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

const ACTIVE_ASSIGNMENT_STATUSES = new Set(['assigned', 'picked_up', 'out_for_delivery'])

export function DeliveryTrackingDrawer({ orderId, open, onOpenChange }: Props) {
  const [pollMs, setPollMs] = useState(0)
  const { data, isLoading, isError } = useGetOrderTrackingQuery(orderId ?? '', {
    skip: !orderId || !open,
    pollingInterval: pollMs,
  })

  useEffect(() => {
    if (!open || !orderId) {
      setPollMs(0)
      return
    }
    const active =
      data?.assignment?.status && ACTIVE_ASSIGNMENT_STATUSES.has(data.assignment.status)
    setPollMs(active ? 30_000 : 0)
  }, [open, orderId, data?.assignment?.status])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="delivery-tracking-drawer">
        <DialogHeader>
          <DialogTitle>Delivery tracking</DialogTitle>
          <DialogDescription>
            {orderId ? `Order ${formatOrderRef(orderId)}` : 'Select an order'}
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="space-y-3" data-testid="tracking-drawer-loading">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}

        {isError && (
          <p className="text-sm text-[var(--text-muted)]" role="alert">
            Could not load tracking for this order.
          </p>
        )}

        {!isLoading && !isError && data && (
          <div className="space-y-4">
            <div className="space-y-1 text-sm">
              <p>
                <span className="text-[var(--text-muted)]">Restaurant: </span>
                {data.restaurantName || '—'}
              </p>
              {data.assignment && (
                <>
                  <p>
                    <span className="text-[var(--text-muted)]">Driver: </span>
                    {data.assignment.driverName || '—'}
                    {data.assignment.driverPhone ? ` · ${data.assignment.driverPhone}` : ''}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Badge variant="secondary">
                      {formatDeliveryStatus(data.assignment.status)}
                    </Badge>
                    <Badge
                      variant={data.tracking?.isStale ? 'outline' : 'secondary'}
                      data-testid="tracking-drawer-gps-status"
                    >
                      {getGpsStatusLabel(data.tracking)}
                    </Badge>
                  </div>
                </>
              )}
              {data.routeNumber && (
                <p className="text-xs text-[var(--text-muted)]">Route {data.routeNumber}</p>
              )}
            </div>

            <DeliveryTrackingMap
              latitude={data.tracking?.latestLocation?.latitude ?? data.latestLocation?.latitude}
              longitude={data.tracking?.latestLocation?.longitude ?? data.latestLocation?.longitude}
            />

            <p className="text-xs text-[var(--text-muted)]" data-testid="tracking-drawer-eta">
              ETA not available yet
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
