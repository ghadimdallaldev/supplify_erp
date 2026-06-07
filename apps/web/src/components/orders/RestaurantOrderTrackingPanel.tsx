import { Link } from 'react-router-dom'
import { Navigation, Package } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Skeleton } from '../ui/skeleton'
import { useEffect, useState } from 'react'
import { useGetOrderTrackingQuery } from '../../services/api'
import { DeliveryTrackingMap } from '../maps/DeliveryTrackingMap'
import { getGpsStatusLabel, getLiveDeliveryStatusLine } from '../../lib/deliveryTrackingLabels'
import {
  canShowRestaurantReceiveCta,
  getRestaurantTrackingMessage,
  shouldPollRestaurantTracking,
} from '../../lib/restaurantTrackingMessages'
import {
  DeliveryTrackingEtaSection,
  getDestinationLabelText,
} from '../maps/DeliveryTrackingEtaSection'
import { isRestaurantOrderTracking } from '../../types'

type Props = {
  orderId: string
  orderStatus?: string
}

const ACTIVE_ORDER_POLL_STATUSES = new Set(['CANCELLED', 'COMPLETED'])

export function RestaurantOrderTrackingPanel({ orderId, orderStatus }: Props) {
  const [pollMs, setPollMs] = useState(() =>
    orderStatus && !ACTIVE_ORDER_POLL_STATUSES.has(orderStatus) ? 30_000 : 0
  )

  const {
    data: rawData,
    isLoading,
    isError,
  } = useGetOrderTrackingQuery(orderId, {
    skip: !orderId,
    pollingInterval: pollMs,
    skipPollingIfUnfocused: true,
  })

  const data = isRestaurantOrderTracking(rawData) ? rawData : undefined

  useEffect(() => {
    setPollMs(shouldPollRestaurantTracking(data, orderStatus) ? 30_000 : 0)
  }, [data, orderStatus])

  if (isLoading) {
    return (
      <Card data-testid="restaurant-order-tracking-loading">
        <CardContent className="pt-6">
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (isError) return null

  const showReceive = canShowRestaurantReceiveCta(data, orderStatus)
  const message = getRestaurantTrackingMessage(data)
  const loc = data?.tracking?.latestLocation
  const showMap =
    data?.trackingEnabled &&
    data?.delivery?.status &&
    !['pending', 'delivered', 'failed'].includes(data.delivery.status)
  const destinationLabel = getDestinationLabelText(data, 'restaurant')
  const liveStatusLine = getLiveDeliveryStatusLine(data?.delivery?.status)
  const showEta = Boolean(data?.trackingEnabled && data.delivery?.status !== 'delivered')

  return (
    <Card data-testid="restaurant-order-tracking-panel">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Navigation className="h-4 w-4 text-[var(--brand-mid)]" aria-hidden />
          Delivery tracking
        </CardTitle>
        {data?.delivery?.label && <CardDescription>{data.delivery.label}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {data?.delivery?.label && (
            <Badge variant="secondary" data-testid="restaurant-delivery-status">
              {data.delivery.label}
            </Badge>
          )}
          {data?.tracking && data.trackingEnabled && (
            <Badge
              variant={data.tracking.isStale ? 'outline' : 'secondary'}
              data-testid="restaurant-gps-status"
            >
              {getGpsStatusLabel(data.tracking)}
            </Badge>
          )}
        </div>

        <p className="text-sm text-[var(--text-muted)]" data-testid="restaurant-tracking-message">
          {message}
        </p>

        {destinationLabel ? (
          <p
            className="text-sm text-[var(--text-primary)]"
            data-testid="restaurant-tracking-destination"
          >
            {destinationLabel}
          </p>
        ) : null}

        {showMap && (
          <DeliveryTrackingMap
            latitude={loc?.latitude}
            longitude={loc?.longitude}
            live={Boolean(data.tracking?.hasLocation && !data.tracking?.isStale)}
            recordedAt={loc?.recordedAt ?? null}
            heightClassName="h-64"
            liveStatusLine={liveStatusLine}
            beforeFooter={
              <DeliveryTrackingEtaSection
                data={data}
                audience="restaurant"
                testId="restaurant-tracking-eta"
                show={showEta}
              />
            }
          />
        )}

        {showReceive && (
          <Button className="w-full sm:w-auto" asChild data-testid="restaurant-receive-order-cta">
            <Link to={`/app/receiving?order=${orderId}`}>
              <Package className="h-4 w-4 mr-2" aria-hidden />
              Receive order
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
