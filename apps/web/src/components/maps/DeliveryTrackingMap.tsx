import { useMemo, type ReactNode } from 'react'
import { Crosshair, ExternalLink, MapPin, Radio } from 'lucide-react'
import { Button } from '../ui/button'
import { googleMapsApiKey, mapProvider } from '../../lib/env'
import { googleMapsSearchUrl, isValidCoord, toMapPoint } from '../../lib/deliveryMapUtils'
import { useDeliveryLeafletMap, type DeliveryMapMarker } from './useDeliveryLeafletMap'

type Props = {
  /** Driver latest GPS latitude */
  latitude?: number | null
  /** Driver latest GPS longitude */
  longitude?: number | null
  /** Destination latitude (supplier only — do not pass for restaurant) */
  destinationLatitude?: number | null
  /** Destination longitude (supplier only) */
  destinationLongitude?: number | null
  destinationLabel?: string | null
  /** When false, destination pin is hidden (restaurant privacy). Default true when coords exist. */
  showDestinationPin?: boolean
  className?: string
  heightClassName?: string
  live?: boolean
  gpsStale?: boolean
  recordedAt?: string | null
  beforeFooter?: ReactNode
  liveStatusLine?: string | null
  showCoordinateDetails?: boolean
}

export function DeliveryTrackingMap({
  latitude,
  longitude,
  destinationLatitude,
  destinationLongitude,
  destinationLabel,
  showDestinationPin = true,
  className = '',
  heightClassName = 'h-56',
  live = false,
  gpsStale = false,
  recordedAt,
  beforeFooter,
  liveStatusLine,
  showCoordinateDetails = false,
}: Props) {
  const driverPoint = toMapPoint(latitude, longitude)
  const destinationPoint =
    showDestinationPin && isValidCoord(destinationLatitude, destinationLongitude)
      ? toMapPoint(destinationLatitude, destinationLongitude)
      : null

  const markers = useMemo((): DeliveryMapMarker[] => {
    const list: DeliveryMapMarker[] = []
    if (driverPoint) {
      list.push({
        id: 'driver',
        point: driverPoint,
        kind: live ? 'driver-live' : gpsStale ? 'driver-stale' : 'driver-none',
        label: 'Driver',
        popupHtml: '<strong>Driver</strong><br/>Latest GPS',
      })
    }
    if (destinationPoint) {
      const label = destinationLabel?.trim() || 'Delivery location'
      list.push({
        id: 'destination',
        point: destinationPoint,
        kind: 'destination',
        label,
        popupHtml: `<strong>${label.replace(/</g, '&lt;')}</strong>`,
      })
    }
    return list
  }, [driverPoint, destinationPoint, destinationLabel, live, gpsStale])

  const { containerRef, fitToMarkers } = useDeliveryLeafletMap({ markers })

  const hasDriver = Boolean(driverPoint)
  const hasDestination = Boolean(destinationPoint)

  if (!hasDriver && !hasDestination) {
    return (
      <p className="text-sm text-[var(--text-muted)]" data-testid="delivery-tracking-map-empty">
        No GPS location received yet
      </p>
    )
  }

  const openMapsTarget = driverPoint ?? destinationPoint!
  const mapsUrl = googleMapsSearchUrl(openMapsTarget.lat, openMapsTarget.lng)
  const mapModeLabel =
    mapProvider === 'google' && googleMapsApiKey ? 'Google Maps' : 'OpenStreetMap'

  return (
    <div className={`space-y-2 ${className}`} data-testid="delivery-tracking-map">
      <div className="relative overflow-hidden rounded-lg border border-[var(--app-border)]">
        {live && (
          <span
            className="absolute left-2 top-2 z-[500] inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow"
            data-testid="delivery-tracking-map-live"
          >
            <Radio className="h-3 w-3" aria-hidden />
            Live now
          </span>
        )}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="absolute right-2 top-2 z-[500] min-h-[44px] gap-1.5 px-3 text-sm font-semibold shadow"
          data-testid="delivery-tracking-map-recenter"
          onClick={() => fitToMarkers()}
          aria-label="Recenter map"
        >
          <Crosshair className="h-4 w-4" aria-hidden />
          Recenter
        </Button>
        <div
          ref={containerRef}
          className={`block w-full ${heightClassName}`}
          data-testid="delivery-tracking-map-canvas"
          role="img"
          aria-label="Delivery map"
        />
        <div
          className="pointer-events-none absolute bottom-1 left-1 z-[500] flex flex-wrap gap-2 px-1 text-[10px]"
          data-testid="delivery-tracking-map-legend"
        >
          {hasDriver ? (
            <span className="rounded bg-white/90 px-1.5 py-0.5 shadow dark:bg-black/70">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 align-middle mr-1" />
              Driver
            </span>
          ) : null}
          {hasDestination ? (
            <span className="rounded bg-white/90 px-1.5 py-0.5 shadow dark:bg-black/70">
              <span className="inline-block h-2 w-2 rounded-full bg-orange-500 align-middle mr-1" />
              {destinationLabel?.trim() || 'Delivery location'}
            </span>
          ) : null}
        </div>
      </div>

      {!hasDriver && hasDestination ? (
        <p
          className="text-sm text-[var(--text-muted)]"
          data-testid="delivery-tracking-map-waiting-gps"
        >
          Waiting for driver location.
        </p>
      ) : null}

      {showDestinationPin && !hasDestination && hasDriver ? (
        <p
          className="text-sm text-[var(--text-muted)]"
          data-testid="delivery-tracking-map-no-destination"
        >
          Delivery location not set
        </p>
      ) : null}

      {beforeFooter ? (
        <div data-testid="delivery-tracking-map-before-footer">{beforeFooter}</div>
      ) : null}

      {(liveStatusLine || recordedAt) && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-muted)]"
          data-testid="delivery-tracking-map-status-row"
        >
          {liveStatusLine ? (
            <span
              className="font-medium text-[var(--text-primary)]"
              data-testid="delivery-tracking-map-status"
            >
              {liveStatusLine}
            </span>
          ) : (
            <span />
          )}
          {recordedAt ? (
            <span data-testid="delivery-tracking-map-updated">
              Updated {new Date(recordedAt).toLocaleTimeString()}
            </span>
          ) : null}
        </div>
      )}

      <a
        href={mapsUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-[var(--app-border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--brand-mid)] sm:w-auto sm:justify-start sm:border-0 sm:bg-transparent sm:px-0 sm:underline"
        data-testid="delivery-tracking-map-open"
        aria-label="Open in maps"
      >
        <MapPin className="h-4 w-4" aria-hidden />
        Open in maps
        <ExternalLink className="h-4 w-4" aria-hidden />
        <span className="sr-only">({mapModeLabel})</span>
      </a>

      {showCoordinateDetails ? (
        <details
          className="text-xs text-[var(--text-muted)]"
          data-testid="delivery-tracking-map-debug"
        >
          <summary className="cursor-pointer select-none font-medium">Debug details</summary>
          {driverPoint ? (
            <p className="mt-1 font-mono">
              Driver: {driverPoint.lat.toFixed(5)}, {driverPoint.lng.toFixed(5)}
            </p>
          ) : null}
          {destinationPoint ? (
            <p className="font-mono">
              Destination: {destinationPoint.lat.toFixed(5)}, {destinationPoint.lng.toFixed(5)}
            </p>
          ) : null}
        </details>
      ) : null}
    </div>
  )
}
