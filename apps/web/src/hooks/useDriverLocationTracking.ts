import { useEffect, useRef, useState } from 'react'
import { useSendDriverLocationMutation } from '../services/api'
import { isTrackableDeliveryStatus } from '../lib/driverGpsTracking'
import { createDriverLocationProvider } from '../lib/driverLocationPlatform'
import { enqueueDriverLocation } from '../lib/driverLocationQueue'
import type { DriverLocationPoint, TrackingStatus } from '../lib/driverLocationProvider'

export function getGpsUpdateIntervalMs() {
  const sec = Number(import.meta.env.VITE_GPS_UPDATE_INTERVAL_SECONDS ?? 15)
  return Math.max(5, sec) * 1000
}

export function isGpsTrackingEnabledClient() {
  const raw = import.meta.env.VITE_GPS_TRACKING_ENABLED
  if (raw === 'false' || raw === '0') return false
  return true
}

function isSessionTrackingEnabledClient() {
  const raw = import.meta.env.VITE_GPS_TRACKING_SESSIONS_ENABLED
  return raw === 'true' || raw === '1'
}

type ActiveDelivery = {
  orderId: string
  deliveryStatus: string
  routeId?: string | null
}

type SessionResponse = { ok: boolean; data?: { session?: { id: string } } }

export function useDriverLocationTracking(activeDeliveries: ActiveDelivery[]) {
  const [sendLocation] = useSendDriverLocationMutation()
  const providerRef = useRef(createDriverLocationProvider())
  const sessionIdRef = useRef<string | null>(null)
  const [trackingActive, setTrackingActive] = useState(false)
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [trackingStatus, setTrackingStatus] = useState<TrackingStatus | null>(null)
  const [trackingRestartToken, setTrackingRestartToken] = useState(0)

  const trackable = activeDeliveries.filter((d) => isTrackableDeliveryStatus(d.deliveryStatus))
  const trackableKey = trackable.map((t) => `${t.orderId}:${t.deliveryStatus}`).join('|')
  const trackableRef = useRef(trackable)
  trackableRef.current = trackable

  useEffect(() => {
    let cancelled = false
    const provider = providerRef.current

    async function sendPoint(point: DriverLocationPoint) {
      const sessionId = sessionIdRef.current
      if (sessionId) {
        const response = await fetch(`/api/driver/tracking-sessions/${sessionId}/locations`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(point),
        })
        if (!response.ok) {
          enqueueDriverLocation({ ...point, sessionId })
          setTrackingStatus((prev) =>
            prev
              ? {
                  ...prev,
                  pendingLocationCount: prev.pendingLocationCount + 1,
                  networkState: 'offline',
                  error: 'Locations are stored locally until synchronization resumes',
                }
              : prev
          )
          throw new Error('Location upload failed; point queued for synchronization')
        }
        setTrackingStatus((prev) =>
          prev
            ? {
                ...prev,
                lastSyncedAt: new Date().toISOString(),
                error: null,
                networkState: 'online',
              }
            : prev
        )
        return
      }
      await Promise.all(
        trackableRef.current.map((delivery) =>
          sendLocation({
            orderId: delivery.orderId,
            latitude: point.latitude,
            longitude: point.longitude,
            accuracyMeters: point.accuracyMeters,
            speedMps: point.speedMps,
            headingDegrees: point.headingDegrees,
            recordedAt: point.recordedAt,
            route_id: null,
            route_stop_id: null,
          }).unwrap()
        )
      )
      setTrackingStatus((prev) =>
        prev ? { ...prev, lastSyncedAt: new Date().toISOString(), error: null } : prev
      )
    }

    async function start() {
      if (!isGpsTrackingEnabledClient() || trackableRef.current.length === 0) {
        await provider.stopTracking()
        setTrackingActive(false)
        return
      }
      try {
        if (isSessionTrackingEnabledClient()) {
          const response = await fetch('/api/driver/tracking-sessions', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ routeId: trackableRef.current[0]?.routeId ?? null }),
          })
          const payload = (await response.json()) as SessionResponse
          if (!response.ok || !payload.data?.session?.id)
            throw new Error('Unable to start the tracking session')
          sessionIdRef.current = payload.data.session.id
        }
        await provider.startTracking({
          routeId: trackableRef.current[0]?.routeId ?? null,
          sessionId: sessionIdRef.current,
          deliveries: trackableRef.current,
          onPoint: sendPoint,
          onStatus: (status) => {
            if (cancelled) return
            setTrackingStatus(status)
            setGpsError(status.error)
            setPermissionDenied(status.gpsState === 'LOCATION_PERMISSION_DENIED')
          },
        })
        if (!cancelled) setTrackingActive(true)
      } catch (error) {
        if (cancelled) return
        setTrackingActive(false)
        setGpsError(error instanceof Error ? error.message : 'Location is not updating')
      }
    }

    void start()
    return () => {
      cancelled = true
      void provider.stopTracking()
      const sessionId = sessionIdRef.current
      sessionIdRef.current = null
      if (sessionId) {
        void fetch(`/api/driver/tracking-sessions/${sessionId}/stop`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'active_assignment_changed' }),
        })
      }
    }
  }, [sendLocation, trackableKey, trackingRestartToken])

  const startTracking = () => {
    setGpsError(null)
    setTrackingRestartToken((value) => value + 1)
  }

  const stopTracking = async () => {
    await providerRef.current.stopTracking()
    const sessionId = sessionIdRef.current
    sessionIdRef.current = null
    setTrackingActive(false)
    if (sessionId) {
      await fetch(`/api/driver/tracking-sessions/${sessionId}/stop`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'driver_action' }),
      })
    }
  }

  return {
    trackingActive,
    gpsError,
    permissionDenied,
    trackableCount: trackable.length,
    trackingStatus,
    provider: trackingStatus?.provider ?? 'web',
    startTracking,
    stopTracking,
    pendingLocationCount: trackingStatus?.pendingLocationCount ?? 0,
    lastSyncedAt: trackingStatus?.lastSyncedAt ?? null,
  }
}
