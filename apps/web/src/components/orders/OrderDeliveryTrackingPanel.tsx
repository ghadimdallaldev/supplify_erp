import { useEffect, useState } from 'react'
import { Navigation } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { Skeleton } from '../ui/skeleton'
import { useGetOrderTrackingQuery } from '../../services/api'
import { formatDeliveryStatus } from '../../lib/deliveryStatusLabels'
import { getGpsStatusLabel } from '../../lib/deliveryTrackingLabels'
import {
  formatDistanceKm,
  getEtaUnavailableMessage,
  getSupplierEtaPrimaryText,
  shouldShowEtaConfidence,
} from '../../lib/deliveryEtaDisplay'
import { DeliveryTrackingMap } from '../maps/DeliveryTrackingMap'

type Props = {
  orderId: string
  pollIntervalMs?: number
}

const LIVE_TRACKING_ASSIGNMENT_STATUSES = new Set(['picked_up', 'out_for_delivery'])

const ACTIVE_ASSIGNMENT_STATUSES = LIVE_TRACKING_ASSIGNMENT_STATUSES

export function OrderDeliveryTrackingPanel({ orderId, pollIntervalMs = 15_000 }: Props) {
  const [pollMs, setPollMs] = useState(pollIntervalMs)
  const { data, isLoading, isError } = useGetOrderTrackingQuery(orderId, {
    pollingInterval: pollMs,
    skipPollingIfUnfocused: true,
    skip: !orderId,
  })

  useEffect(() => {
    const active =
      data?.assignment?.status && ACTIVE_ASSIGNMENT_STATUSES.has(data.assignment.status)
    setPollMs(active ? pollIntervalMs : 0)
  }, [data?.assignment?.status, pollIntervalMs])

  if (isLoading) {
    return (
      <Card data-testid="order-delivery-tracking-loading">
        <CardContent className="pt-6">
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (isError || !data) return null

  const tracking = data.tracking
  if (!data.trackingEnabled && !tracking?.enabled) {
    return (
      <Card data-testid="order-delivery-tracking-disabled">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Navigation className="h-4 w-4 text-[var(--brand-mid)]" />
            Delivery tracking
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--text-muted)]">Live tracking is not enabled.</p>
        </CardContent>
      </Card>
    )
  }

  const assignment = data.assignment
  if (!assignment || !ACTIVE_ASSIGNMENT_STATUSES.has(assignment.status)) {
    return null
  }

  const loc = tracking?.latestLocation ?? data.latestLocation

  return (
    <Card data-testid="order-delivery-tracking-panel">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Navigation className="h-4 w-4 text-[var(--brand-mid)]" />
          Delivery tracking
        </CardTitle>
        <CardDescription>
          {assignment.driverName
            ? `Driver en route — ${assignment.driverName}`
            : 'Order is on the way'}
          {assignment.driverPhone ? ` · ${assignment.driverPhone}` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{formatDeliveryStatus(assignment.status)}</Badge>
          <Badge
            variant={tracking?.isStale ? 'outline' : 'secondary'}
            data-testid="tracking-gps-badge"
          >
            {getGpsStatusLabel(tracking)}
          </Badge>
        </div>
        <DeliveryTrackingMap
          latitude={loc?.latitude}
          longitude={loc?.longitude}
          live={Boolean(tracking?.hasLocation && !tracking?.isStale)}
          recordedAt={loc?.recordedAt ?? null}
          heightClassName="h-64"
        />
        {(() => {
          const etaPrimary = getSupplierEtaPrimaryText(data)
          if (etaPrimary) {
            const distanceText = formatDistanceKm(data.distanceKm)
            return (
              <div className="space-y-1" data-testid="order-delivery-tracking-eta">
                <p
                  className="text-sm font-medium"
                  data-testid="order-delivery-tracking-eta-primary"
                >
                  {etaPrimary}
                  {distanceText ? ` · ${distanceText}` : ''}
                </p>
                {shouldShowEtaConfidence(data) ? (
                  <Badge
                    variant="outline"
                    className="text-xs"
                    data-testid="order-delivery-tracking-eta-confidence"
                  >
                    Low confidence
                  </Badge>
                ) : null}
              </div>
            )
          }
          const etaMessage = getEtaUnavailableMessage(data)
          return etaMessage ? (
            <p
              className={`text-xs ${
                etaMessage.includes('delivery location is not set')
                  ? 'text-amber-800 dark:text-amber-200'
                  : 'text-[var(--text-muted)]'
              }`}
              data-testid="order-delivery-tracking-eta"
            >
              {etaMessage}
            </p>
          ) : null
        })()}
      </CardContent>
    </Card>
  )
}
