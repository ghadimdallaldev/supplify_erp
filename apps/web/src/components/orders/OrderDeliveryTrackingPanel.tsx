import { useEffect, useState } from 'react'
import { Navigation } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { Skeleton } from '../ui/skeleton'
import { useGetOrderTrackingQuery } from '../../services/api'
import { formatDeliveryStatus } from '../../lib/deliveryStatusLabels'
import { getGpsStatusLabel } from '../../lib/deliveryTrackingLabels'
import { DeliveryTrackingMap } from '../maps/DeliveryTrackingMap'

type Props = {
  orderId: string
  pollIntervalMs?: number
}

const ACTIVE_ASSIGNMENT_STATUSES = LIVE_TRACKING_ASSIGNMENT_STATUSES

const LIVE_TRACKING_ASSIGNMENT_STATUSES = new Set(['picked_up', 'out_for_delivery'])

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
        <p className="text-xs text-[var(--text-muted)]">ETA not available yet</p>
      </CardContent>
    </Card>
  )
}
