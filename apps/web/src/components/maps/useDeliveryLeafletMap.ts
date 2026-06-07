import { useCallback, useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  MAX_FIT_ZOOM,
  SINGLE_ZOOM,
  type MapPoint,
  osmTileUrl,
} from '../../lib/deliveryMapUtils'

export type DeliveryMapMarker = {
  id: string
  point: MapPoint
  kind: 'driver' | 'destination' | 'driver-live' | 'driver-stale' | 'driver-none'
  label?: string
  popupHtml?: string
  onClick?: () => void
}

type Options = {
  markers: DeliveryMapMarker[]
  heightClassName?: string
  interactive?: boolean
}

function markerClass(kind: DeliveryMapMarker['kind']): string {
  switch (kind) {
    case 'destination':
      return 'delivery-map-marker-destination'
    case 'driver-live':
      return 'delivery-map-marker-driver delivery-map-marker-driver-live'
    case 'driver-stale':
      return 'delivery-map-marker-driver delivery-map-marker-driver-stale'
    case 'driver-none':
      return 'delivery-map-marker-driver delivery-map-marker-driver-none'
    default:
      return 'delivery-map-marker-driver delivery-map-marker-driver-live'
  }
}

function createDivIcon(kind: DeliveryMapMarker['kind'], label?: string) {
  const title = label ? ` title="${label.replace(/"/g, '&quot;')}"` : ''
  return L.divIcon({
    className: 'delivery-map-marker-wrap',
    html: `<div class="delivery-map-marker ${markerClass(kind)}"${title} aria-hidden="true"></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

export function useDeliveryLeafletMap({ markers, interactive = true }: Options) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)

  const fitToMarkers = useCallback(() => {
    const map = mapRef.current
    if (!map || !markers.length) {
      map?.setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], DEFAULT_ZOOM)
      return
    }
    const latLngs = markers.map((m) => L.latLng(m.point.lat, m.point.lng))
    if (latLngs.length === 1) {
      map.setView(latLngs[0], SINGLE_ZOOM)
      return
    }
    map.fitBounds(L.latLngBounds(latLngs), {
      padding: [36, 36],
      maxZoom: MAX_FIT_ZOOM,
    })
  }, [markers])

  useEffect(() => {
    const el = containerRef.current
    if (!el || mapRef.current) return

    const map = L.map(el, {
      zoomControl: true,
      attributionControl: true,
      dragging: interactive,
      scrollWheelZoom: interactive,
      doubleClickZoom: interactive,
      touchZoom: interactive,
    }).setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], DEFAULT_ZOOM)

    L.tileLayer(osmTileUrl(), {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)

    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
      layerRef.current = null
    }
  }, [interactive])

  useEffect(() => {
    const map = mapRef.current
    const group = layerRef.current
    if (!map || !group) return

    group.clearLayers()

    for (const marker of markers) {
      const icon = createDivIcon(marker.kind, marker.label)
      const leafletMarker = L.marker([marker.point.lat, marker.point.lng], { icon })
      if (marker.popupHtml) {
        leafletMarker.bindPopup(marker.popupHtml)
      }
      if (marker.onClick) {
        leafletMarker.on('click', marker.onClick)
      }
      leafletMarker.addTo(group)
    }

    fitToMarkers()

    requestAnimationFrame(() => map.invalidateSize())
  }, [markers, fitToMarkers])

  return { containerRef, fitToMarkers }
}
