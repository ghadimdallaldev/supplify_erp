import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigation } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { Skeleton } from '../ui/skeleton'
import { useGetOrderTrackingQuery } from '../../services/api'
import { formatDeliveryStatus } from '../../lib/deliveryStatusLabels'
import { getGpsStatusLabel, getLiveDeliveryStatusLine } from '../../lib/deliveryTrackingLabels'
import { LazyDeliveryTrackingMap } from '../maps/LazyDeliveryTrackingMap'
import {
  DeliveryTrackingEtaSection,
  getDestinationLabelText,
} from '../maps/DeliveryTrackingEtaSection'
import { ensureNamespace } from '../../i18n'

type Props = {
  orderId: string
  pollIntervalMs?: number
}

const LIVE_TRACKING_ASSIGNMENT_STATUSES = new Set(['picked_up', 'out_for_delivery'])

const ACTIVE_ASSIGNMENT_STATUSES = LIVE_TRACKING_ASSIGNMENT_STATUSES

export function OrderDeliveryTrackingPanel({ orderId, pollIntervalMs = 15_000 }: Props) {
  const { t } = useTranslation('fulfillment')
  const [pollMs, setPollMs] = useState(pollIntervalMs)
  const { data, isLoading, isError } = useGetOrderTrackingQuery(orderId, {
    pollingInterval: pollMs,
    skipPollingIfUnfocused: true,
    skip: !orderId,
  })

  useEffect(() => {
    void ensureNamespace('fulfillment')
  }, [])

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
            {t('tracking.panel.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--text-muted)]">{t('tracking.panel.notEnabled')}</p>
        </CardContent>
      </Card>
    )
  }

  const assignment = data.assignment
  if (!assignment || !ACTIVE_ASSIGNMENT_STATUSES.has(assignment.status)) {
    return null
  }

  const loc = tracking?.latestLocation ?? data.latestLocation
  const destinationLabel = getDestinationLabelText(data, 'supplier')
  const liveStatusLine = getLiveDeliveryStatusLine(assignment.status)

  return (
    <Card data-testid="order-delivery-tracking-panel">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Navigation className="h-4 w-4 text-[var(--brand-mid)]" />
          {t('tracking.title')}
        </CardTitle>
        <CardDescription>
          {assignment.driverName
            ? t('tracking.panel.driverEnRoute', { name: assignment.driverName })
            : t('tracking.panel.onTheWay')}
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
        {destinationLabel ? (
          <p
            className="text-sm text-[var(--text-primary)]"
            data-testid="order-delivery-destination"
          >
            {destinationLabel}
          </p>
        ) : null}
        <LazyDeliveryTrackingMap
          latitude={loc?.latitude}
          longitude={loc?.longitude}
          destinationLatitude={data.destination?.latitude}
          destinationLongitude={data.destination?.longitude}
          destinationLabel={data.destinationLabel ?? data.destination?.label}
          live={Boolean(tracking?.hasLocation && !tracking?.isStale)}
          gpsStale={Boolean(tracking?.isStale)}
          recordedAt={loc?.recordedAt ?? null}
          heightClassName="h-64"
          liveStatusLine={liveStatusLine}
          showCoordinateDetails
          beforeFooter={
            <DeliveryTrackingEtaSection
              data={data}
              audience="supplier"
              testId="order-delivery-tracking-eta"
            />
          }
        />
      </CardContent>
    </Card>
  )
}
