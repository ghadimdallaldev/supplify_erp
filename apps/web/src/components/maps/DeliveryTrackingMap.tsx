import { useState } from 'react'
import { MapPin, ExternalLink } from 'lucide-react'
import { googleMapsApiKey, mapProvider } from '../../lib/env'

type Props = {
  latitude?: number | null
  longitude?: number | null
  className?: string
  heightClassName?: string
}

export function DeliveryTrackingMap({
  latitude,
  longitude,
  className = '',
  heightClassName = 'h-48',
}: Props) {
  const [embedFailed, setEmbedFailed] = useState(false)

  const hasCoords =
    latitude != null &&
    longitude != null &&
    Number.isFinite(Number(latitude)) &&
    Number.isFinite(Number(longitude))

  if (!hasCoords) {
    return (
      <p className="text-sm text-[var(--text-muted)]" data-testid="delivery-tracking-map-empty">
        No GPS location received yet
      </p>
    )
  }

  const lat = Number(latitude)
  const lng = Number(longitude)
  const mapsUrl = `https://maps.google.com/?q=${lat},${lng}`
  const canEmbed = mapProvider === 'google' && googleMapsApiKey && !embedFailed
  const embedUrl = canEmbed
    ? `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(googleMapsApiKey)}&q=${lat},${lng}&zoom=15`
    : null

  return (
    <div className={`space-y-2 ${className}`} data-testid="delivery-tracking-map">
      {embedUrl ? (
        <iframe
          title="Delivery location map"
          src={embedUrl}
          className={`w-full rounded-lg border border-[var(--app-border)] ${heightClassName}`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          onError={() => setEmbedFailed(true)}
        />
      ) : (
        <div
          className={`flex flex-col items-start justify-center gap-2 rounded-lg border border-dashed border-[var(--app-border)] bg-[var(--brand-ultra)] px-3 py-4 ${heightClassName}`}
          data-testid="delivery-tracking-map-fallback"
        >
          <p className="text-xs text-[var(--text-muted)] font-mono">
            {lat.toFixed(5)}, {lng.toFixed(5)}
          </p>
          <a
            href={mapsUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm text-[var(--brand-mid)] underline"
          >
            <MapPin className="h-4 w-4" aria-hidden />
            Open in Google Maps
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        </div>
      )}
      {embedUrl && (
        <a
          href={mapsUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-[var(--brand-mid)] underline"
        >
          Open in Google Maps
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      )}
    </div>
  )
}
