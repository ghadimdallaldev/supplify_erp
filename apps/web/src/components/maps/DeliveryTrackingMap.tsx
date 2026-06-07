import { useMemo, type ReactNode } from 'react'
import { MapPin, ExternalLink, Radio } from 'lucide-react'
import { googleMapsApiKey, mapProvider } from '../../lib/env'

type Props = {
  latitude?: number | null
  longitude?: number | null
  className?: string
  heightClassName?: string
  /** Show live indicator and prefer embedded map (Toters-style in-box tracking). */
  live?: boolean
  recordedAt?: string | null
  /** Rendered between map and footer (e.g. ETA card). */
  beforeFooter?: ReactNode
  /** e.g. "Picked up · Live now" */
  liveStatusLine?: string | null
  /** Supplier-only debug coordinates under a collapsible section. */
  showCoordinateDetails?: boolean
}

function buildOsmEmbedUrl(lat: number, lng: number) {
  const pad = 0.014
  const bbox = `${lng - pad},${lat - pad},${lng + pad},${lat + pad}`
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat}%2C${lng}`
}

export function DeliveryTrackingMap({
  latitude,
  longitude,
  className = '',
  heightClassName = 'h-56',
  live = false,
  recordedAt,
  beforeFooter,
  liveStatusLine,
  showCoordinateDetails = false,
}: Props) {
  const hasCoords =
    latitude != null &&
    longitude != null &&
    Number.isFinite(Number(latitude)) &&
    Number.isFinite(Number(longitude))

  const lat = hasCoords ? Number(latitude) : 0
  const lng = hasCoords ? Number(longitude) : 0
  const mapsUrl = `https://maps.google.com/?q=${lat},${lng}`

  const embedUrl = useMemo(() => {
    if (!hasCoords) return null
    if (mapProvider === 'google' && googleMapsApiKey) {
      return `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(googleMapsApiKey)}&q=${lat},${lng}&zoom=15`
    }
    return buildOsmEmbedUrl(lat, lng)
  }, [hasCoords, lat, lng])

  if (!hasCoords) {
    return (
      <p className="text-sm text-[var(--text-muted)]" data-testid="delivery-tracking-map-empty">
        No GPS location received yet
      </p>
    )
  }

  return (
    <div className={`space-y-2 ${className}`} data-testid="delivery-tracking-map">
      <div className="relative overflow-hidden rounded-lg border border-[var(--app-border)]">
        {live && (
          <span
            className="absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow"
            data-testid="delivery-tracking-map-live"
          >
            <Radio className="h-3 w-3" aria-hidden />
            Live
          </span>
        )}
        <iframe
          title="Live delivery map"
          src={embedUrl ?? buildOsmEmbedUrl(lat, lng)}
          className={`block w-full ${heightClassName}`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          data-testid="delivery-tracking-map-embed"
        />
      </div>

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
        className="inline-flex items-center gap-1 text-xs text-[var(--brand-mid)] underline"
        data-testid="delivery-tracking-map-open"
      >
        <MapPin className="h-3 w-3" aria-hidden />
        Open in maps
        <ExternalLink className="h-3 w-3" aria-hidden />
      </a>

      {showCoordinateDetails ? (
        <details
          className="text-xs text-[var(--text-muted)]"
          data-testid="delivery-tracking-map-debug"
        >
          <summary className="cursor-pointer select-none font-medium">Debug details</summary>
          <p className="mt-1 font-mono">
            {lat.toFixed(5)}, {lng.toFixed(5)}
          </p>
        </details>
      ) : null}
    </div>
  )
}
