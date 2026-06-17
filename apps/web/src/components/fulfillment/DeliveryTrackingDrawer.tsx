import { useEffect, useState } from 'react'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../ui/sheet'
import { Badge } from '../ui/badge'
import { Skeleton } from '../ui/skeleton'
import { useGetOrderTrackingQuery } from '../../services/api'
import { formatDeliveryStatus } from '../../lib/deliveryStatusLabels'
import { formatOrderRef } from './fulfillmentDispatchUtils'
import { getGpsStatusLabel, getLiveDeliveryStatusLine } from '../../lib/deliveryTrackingLabels'
import { LazyDeliveryTrackingMap } from '../maps/LazyDeliveryTrackingMap'
import {
  DeliveryTrackingEtaSection,
  getDestinationLabelText,
} from '../maps/DeliveryTrackingEtaSection'
import { cn } from '../../lib/utils'

type Props = {
  orderId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

const ACTIVE_ASSIGNMENT_STATUSES = new Set(['assigned', 'picked_up', 'out_for_delivery'])
const LIVE_MAP_STATUSES = new Set(['picked_up', 'out_for_delivery'])

export function DeliveryTrackingDrawer({ orderId, open, onOpenChange }: Props) {
  const isDesktop = useMediaQuery('(min-width: 640px)', true)
  const sheetSide = isDesktop ? 'right' : 'bottom'
  const [pollMs, setPollMs] = useState(0)
  const { data, isLoading, isError } = useGetOrderTrackingQuery(orderId ?? '', {
    skip: !orderId || !open,
    pollingInterval: pollMs,
    skipPollingIfUnfocused: true,
  })

  useEffect(() => {
    if (!open || !orderId) {
      setPollMs(0)
      return
    }
    const active =
      data?.assignment?.status && ACTIVE_ASSIGNMENT_STATUSES.has(data.assignment.status)
    setPollMs(active ? 15_000 : 0)
  }, [open, orderId, data?.assignment?.status])

  const assignmentStatus = data?.assignment?.status
  const destinationLabel = getDestinationLabelText(data, 'supplier')
  const liveStatusLine = getLiveDeliveryStatusLine(assignmentStatus)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={sheetSide}
        data-testid="delivery-tracking-drawer"
        className={cn(
          'flex w-full flex-col gap-4 overflow-hidden',
          sheetSide === 'bottom' && 'max-h-[92dvh] rounded-t-xl'
        )}
      >
        <SheetHeader className="shrink-0 text-left">
          <SheetTitle>Delivery tracking</SheetTitle>
          <SheetDescription>
            {orderId ? `Order ${formatOrderRef(orderId)}` : 'Select an order'}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
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
                {destinationLabel ? (
                  <p
                    className="text-sm text-[var(--text-primary)]"
                    data-testid="tracking-drawer-destination"
                  >
                    {destinationLabel}
                  </p>
                ) : null}
              </div>

              <LazyDeliveryTrackingMap
                latitude={data.tracking?.latestLocation?.latitude ?? data.latestLocation?.latitude}
                longitude={
                  data.tracking?.latestLocation?.longitude ?? data.latestLocation?.longitude
                }
                destinationLatitude={data.destination?.latitude}
                destinationLongitude={data.destination?.longitude}
                destinationLabel={data.destinationLabel ?? data.destination?.label}
                live={Boolean(
                  data.tracking?.hasLocation &&
                    !data.tracking?.isStale &&
                    assignmentStatus &&
                    LIVE_MAP_STATUSES.has(assignmentStatus)
                )}
                gpsStale={Boolean(data.tracking?.isStale)}
                recordedAt={
                  data.tracking?.latestLocation?.recordedAt ??
                  data.latestLocation?.recordedAt ??
                  null
                }
                heightClassName="h-64"
                liveStatusLine={liveStatusLine}
                showCoordinateDetails
                beforeFooter={
                  <DeliveryTrackingEtaSection
                    data={data}
                    audience="supplier"
                    testId="tracking-drawer-eta"
                  />
                }
              />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
