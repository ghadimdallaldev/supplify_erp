import { useEffect, useRef, useState } from 'react'
import * as Location from 'expo-location'
import { gpsTrackingEnabled, gpsUpdateIntervalSeconds } from '../config/env'
import { isTrackableDeliveryStatus } from '../utils/driverGpsTracking'
import { useSendDriverLocation } from '../services/api/queries'

type ActiveDelivery = { orderId: string; deliveryStatus: string }

export function useDriverGpsTracking(activeDeliveries: ActiveDelivery[]) {
  const { mutateAsync: sendLocation } = useSendDriverLocation()
  const [trackingActive, setTrackingActive] = useState(false)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [gpsMessage, setGpsMessage] = useState('Waiting for location')
  const watchRef = useRef<Location.LocationSubscription | null>(null)
  const lastSent = useRef(0)

  const trackable = activeDeliveries.filter((d) => isTrackableDeliveryStatus(d.deliveryStatus))

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      if (!gpsTrackingEnabled || trackable.length === 0) {
        watchRef.current?.remove()
        watchRef.current = null
        setTrackingActive(false)
        setGpsMessage('Waiting for location')
        return
      }

      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        setPermissionDenied(true)
        setGpsMessage('Location permission needed')
        setTrackingActive(false)
        return
      }

      setPermissionDenied(false)
      const intervalMs = gpsUpdateIntervalSeconds * 1000

      watchRef.current?.remove()
      watchRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: intervalMs,
          distanceInterval: 10,
        },
        async (pos) => {
          if (cancelled) return
          const now = Date.now()
          if (now - lastSent.current < intervalMs - 500) return
          lastSent.current = now
          // Ping every active delivery, not just the first: the restaurants behind
          // the driver's other stops saw no location at all. One rejected order must
          // not discard the fix for the rest, so failures are counted, not thrown.
          const results = await Promise.allSettled(
            trackable.map((delivery) =>
              sendLocation({
                orderId: delivery.orderId,
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracyMeters: pos.coords.accuracy ?? undefined,
                recordedAt: new Date(pos.timestamp).toISOString(),
              })
            )
          )
          if (cancelled) return
          const delivered = results.filter((r) => r.status === 'fulfilled').length
          if (delivered > 0) {
            setTrackingActive(true)
            setGpsMessage('Location active')
          } else {
            setTrackingActive(false)
            setGpsMessage('Location not updating')
          }
        }
      )
    })()

    return () => {
      cancelled = true
      watchRef.current?.remove()
      watchRef.current = null
    }
  }, [trackable.map((t) => `${t.orderId}:${t.deliveryStatus}`).join(','), sendLocation])

  return { trackingActive, permissionDenied, gpsMessage, trackableCount: trackable.length }
}
