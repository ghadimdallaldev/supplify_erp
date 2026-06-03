import { useEffect, useRef, useState } from 'react'
import { useSendDriverLocationMutation } from '../services/api'

const TRACKING_STATUSES = new Set(['assigned', 'picked_up', 'out_for_delivery'])

export function getGpsUpdateIntervalMs() {
  const sec = Number(import.meta.env.VITE_GPS_UPDATE_INTERVAL_SECONDS ?? 15)
  return Math.max(5, sec) * 1000
}

export function isGpsTrackingEnabledClient() {
  const raw = import.meta.env.VITE_GPS_TRACKING_ENABLED
  if (raw === 'false' || raw === '0') return false
  return true
}

type ActiveDelivery = {
  orderId: string
  deliveryStatus: string
}

export function useDriverLocationTracking(activeDeliveries: ActiveDelivery[]) {
  const [sendLocation] = useSendDriverLocationMutation()
  const watchIdRef = useRef<number | null>(null)
  const [trackingActive, setTrackingActive] = useState(false)
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [permissionDenied, setPermissionDenied] = useState(false)

  const trackable = activeDeliveries.filter((d) => TRACKING_STATUSES.has(d.deliveryStatus))

  useEffect(() => {
    if (!isGpsTrackingEnabledClient() || trackable.length === 0) {
      setTrackingActive(false)
      if (watchIdRef.current != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      return
    }

    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported on this device')
      setTrackingActive(false)
      return
    }

    const primary = trackable[0]
    const intervalMs = getGpsUpdateIntervalMs()
    let lastSent = 0

    const onPosition = (pos: GeolocationPosition) => {
      const now = Date.now()
      if (now - lastSent < intervalMs - 500) return
      lastSent = now
      setGpsError(null)
      setTrackingActive(true)
      sendLocation({
        orderId: primary.orderId,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracyMeters: pos.coords.accuracy,
        speedMps: pos.coords.speed ?? undefined,
        headingDegrees: pos.coords.heading ?? undefined,
        recordedAt: new Date(pos.timestamp).toISOString(),
      }).catch(() => {
        /* network errors surfaced elsewhere */
      })
    }

    const onError = (err: GeolocationPositionError) => {
      if (err.code === err.PERMISSION_DENIED) {
        setPermissionDenied(true)
        setGpsError('Location permission denied. Enable GPS to share live tracking.')
      } else {
        setGpsError(err.message || 'Unable to read GPS position')
      }
      setTrackingActive(false)
    }

    watchIdRef.current = navigator.geolocation.watchPosition(onPosition, onError, {
      enableHighAccuracy: true,
      maximumAge: intervalMs,
      timeout: 20_000,
    })

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      setTrackingActive(false)
    }
  }, [trackable.map((t) => `${t.orderId}:${t.deliveryStatus}`).join('|'), sendLocation])

  return { trackingActive, gpsError, permissionDenied, trackableCount: trackable.length }
}
