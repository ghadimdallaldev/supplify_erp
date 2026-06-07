import { useMemo } from 'react'
import { Crosshair } from 'lucide-react'
import { Button } from '../ui/button'
import { formatOrderRef } from '../fulfillment/fulfillmentDispatchUtils'
import { useDeliveryLeafletMap, type DeliveryMapMarker } from './useDeliveryLeafletMap'
import { isValidCoord } from '../../lib/deliveryMapUtils'

export type ActiveDeliveryMapOrder = {
  orderId: string
  restaurantName?: string | null
  deliveryStatus?: string
  destinationLatitude?: number | null
  destinationLongitude?: number | null
  destinationLabel?: string | null
  destinationCoordinatesAvailable?: boolean
  etaAvailable?: boolean
  tracking?: {
    hasLocation?: boolean
    isStale?: boolean
    latestLocation?: {
      latitude?: number | null
      longitude?: number | null
    } | null
  } | null
}

type Props = {
  orders: ActiveDeliveryMapOrder[]
  onSelectOrder: (orderId: string) => void
  heightClassName?: string
}

function driverMarkerKind(order: ActiveDeliveryMapOrder): DeliveryMapMarker['kind'] {
  const tracking = order.tracking
  if (!tracking?.hasLocation) return 'driver-none'
  if (tracking.isStale) return 'driver-stale'
  return 'driver-live'
}

export function ActiveDeliveriesMap({
  orders,
  onSelectOrder,
  heightClassName = 'h-[420px]',
}: Props) {
  const markers = useMemo((): DeliveryMapMarker[] => {
    const list: DeliveryMapMarker[] = []
    for (const order of orders) {
      const loc = order.tracking?.latestLocation
      const driverLat = loc?.latitude
      const driverLng = loc?.longitude
      if (isValidCoord(driverLat, driverLng)) {
        list.push({
          id: `driver-${order.orderId}`,
          point: { lat: Number(driverLat), lng: Number(driverLng) },
          kind: driverMarkerKind(order),
          label: order.restaurantName ?? formatOrderRef(order.orderId),
          popupHtml: `<strong>${(order.restaurantName || formatOrderRef(order.orderId)).replace(/</g, '&lt;')}</strong><br/>Driver GPS`,
          onClick: () => onSelectOrder(order.orderId),
        })
      }

      const destLat = order.destinationLatitude
      const destLng = order.destinationLongitude
      if (isValidCoord(destLat, destLng)) {
        const destLabel = order.destinationLabel?.trim() || 'Delivery location'
        list.push({
          id: `dest-${order.orderId}`,
          point: { lat: Number(destLat), lng: Number(destLng) },
          kind: 'destination',
          label: destLabel,
          popupHtml: `<strong>${destLabel.replace(/</g, '&lt;')}</strong><br/>${(order.restaurantName || '').replace(/</g, '&lt;')}`,
          onClick: () => onSelectOrder(order.orderId),
        })
      }
    }
    return list
  }, [orders, onSelectOrder])

  const { containerRef, fitToMarkers } = useDeliveryLeafletMap({ markers })

  const summary = useMemo(() => {
    let live = 0
    let stale = 0
    let noGps = 0
    let etaAvailable = 0
    for (const o of orders) {
      const t = o.tracking
      if (t?.hasLocation && !t.isStale) live += 1
      else if (t?.hasLocation && t.isStale) stale += 1
      else noGps += 1
      if (o.etaAvailable) etaAvailable += 1
    }
    return { live, stale, noGps, etaAvailable, total: orders.length }
  }, [orders])

  if (!orders.length) {
    return (
      <p
        className="py-8 text-center text-sm text-[var(--text-muted)]"
        data-testid="active-deliveries-map-empty"
      >
        No active deliveries to show on the map.
      </p>
    )
  }

  return (
    <div className="space-y-3" data-testid="active-deliveries-map">
      <div
        className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4"
        data-testid="active-deliveries-map-summary"
      >
        <div className="rounded-lg border border-[var(--app-border)] bg-[var(--brand-ultra)] px-3 py-2">
          <p className="text-[var(--text-muted)]">Live GPS</p>
          <p className="text-lg font-semibold">{summary.live}</p>
        </div>
        <div className="rounded-lg border border-[var(--app-border)] bg-[var(--brand-ultra)] px-3 py-2">
          <p className="text-[var(--text-muted)]">Stale GPS</p>
          <p className="text-lg font-semibold">{summary.stale}</p>
        </div>
        <div className="rounded-lg border border-[var(--app-border)] bg-[var(--brand-ultra)] px-3 py-2">
          <p className="text-[var(--text-muted)]">No GPS</p>
          <p className="text-lg font-semibold">{summary.noGps}</p>
        </div>
        <div className="rounded-lg border border-[var(--app-border)] bg-[var(--brand-ultra)] px-3 py-2">
          <p className="text-[var(--text-muted)]">ETA available</p>
          <p className="text-lg font-semibold">{summary.etaAvailable}</p>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-lg border border-[var(--app-border)]">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="absolute right-2 top-2 z-[500] h-8 gap-1 px-2 text-xs shadow"
          data-testid="active-deliveries-map-recenter"
          onClick={() => fitToMarkers()}
        >
          <Crosshair className="h-3.5 w-3.5" aria-hidden />
          Recenter
        </Button>
        <div
          ref={containerRef}
          className={`w-full ${heightClassName}`}
          data-testid="active-deliveries-map-canvas"
        />
        <div
          className="pointer-events-none absolute bottom-2 left-2 z-[500] flex flex-wrap gap-2 text-[10px]"
          data-testid="active-deliveries-map-legend"
        >
          <span className="rounded bg-white/90 px-1.5 py-0.5 shadow dark:bg-black/70">
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500 align-middle" />
            Live driver
          </span>
          <span className="rounded bg-white/90 px-1.5 py-0.5 shadow dark:bg-black/70">
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500 align-middle" />
            Stale driver
          </span>
          <span className="rounded bg-white/90 px-1.5 py-0.5 shadow dark:bg-black/70">
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-orange-500 align-middle" />
            Destination
          </span>
          <span className="rounded bg-white/90 px-1.5 py-0.5 shadow dark:bg-black/70">
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-gray-400 align-middle" />
            No GPS
          </span>
        </div>
      </div>

      <ul
        className="space-y-1 text-xs text-[var(--text-muted)]"
        data-testid="active-deliveries-map-list"
      >
        {orders.map((o) => (
          <li key={o.orderId}>
            <button
              type="button"
              className="w-full rounded-md px-2 py-1.5 text-left hover:bg-[var(--brand-ultra)]"
              data-testid={`active-delivery-map-item-${o.orderId}`}
              onClick={() => onSelectOrder(o.orderId)}
            >
              <span className="font-medium text-[var(--text-primary)]">
                {o.restaurantName || formatOrderRef(o.orderId)}
              </span>
              {' · '}
              {formatOrderRef(o.orderId)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
