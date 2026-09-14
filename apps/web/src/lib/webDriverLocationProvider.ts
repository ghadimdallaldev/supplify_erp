import type {
  DriverLocationProvider,
  StartTrackingInput,
  TrackingStatus,
} from './driverLocationProvider'

/**
 * Minimum gap between uploaded fixes. `watchPosition` fires as fast as the device
 * produces fixes; the API drops anything inside GPS_MIN_SEND_INTERVAL_SECONDS, so
 * sending every fix just burned requests and buried the ones that mattered.
 */
export function getWebGpsMinSendIntervalMs(): number {
  const seconds = Number(import.meta.env.VITE_GPS_UPDATE_INTERVAL_SECONDS ?? 15)
  return Math.max(5, Number.isFinite(seconds) ? seconds : 15) * 1000
}

const defaultStatus: TrackingStatus = {
  active: false,
  provider: 'web',
  sessionId: null,
  gpsState: 'GPS_PROVIDER_DISABLED',
  networkState: navigator.onLine ? 'online' : 'offline',
  pendingLocationCount: 0,
  lastSyncedAt: null,
  error: null,
}

export class WebDriverLocationProvider implements DriverLocationProvider {
  private watchId: number | null = null
  private sequence = 0
  private status: TrackingStatus = { ...defaultStatus }
  private input: StartTrackingInput | null = null
  private lastSentAtMs = 0
  private inFlight = false

  async startTracking(input: StartTrackingInput): Promise<void> {
    if (!navigator.geolocation) throw new Error('Location is not supported by this browser')
    await this.stopTracking()
    this.input = input
    this.lastSentAtMs = 0
    this.inFlight = false
    // Not TRACKING_ACTIVE yet: the watch is registered but no fix has arrived and
    // permission may still be refused. Claiming active here showed drivers
    // "Location active" while nothing was being shared.
    this.status = { ...defaultStatus, active: true, gpsState: 'GPS_PROVIDER_DISABLED' }
    this.emit()

    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        void this.handlePosition(position)
      },
      (error) => {
        this.status = {
          ...this.status,
          gpsState: error.code === 1 ? 'LOCATION_PERMISSION_DENIED' : 'GPS_PROVIDER_DISABLED',
          error: error.message,
        }
        this.emit()
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 }
    )
  }

  private emit(): void {
    this.input?.onStatus?.(this.status)
  }

  private async handlePosition(position: GeolocationPosition): Promise<void> {
    const input = this.input
    if (!input) return

    const now = Date.now()
    // Drop fixes inside the send interval, and never overlap uploads — otherwise a
    // slow request stacks up behind every new fix.
    if (this.inFlight) return
    if (this.lastSentAtMs && now - this.lastSentAtMs < getWebGpsMinSendIntervalMs()) return

    const point = {
      id: crypto.randomUUID(),
      sequence: ++this.sequence,
      recordedAt: new Date(position.timestamp).toISOString(),
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracyMeters: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
      altitudeMeters: position.coords.altitude,
      speedMps: position.coords.speed,
      headingDegrees: position.coords.heading,
      networkState: navigator.onLine ? ('online' as const) : ('offline' as const),
    }

    this.inFlight = true
    try {
      await input.onPoint?.(point)
      this.lastSentAtMs = now
      // Only now is location genuinely being shared.
      this.status = {
        ...this.status,
        gpsState: 'TRACKING_ACTIVE',
        networkState: navigator.onLine ? 'online' : 'offline',
        lastSyncedAt: new Date().toISOString(),
        error: null,
      }
    } catch (error) {
      // A failed upload used to be swallowed by `void onPoint(...)`, leaving the UI
      // reporting active tracking while nothing reached the server.
      this.status = {
        ...this.status,
        networkState: navigator.onLine ? 'online' : 'offline',
        error: error instanceof Error ? error.message : 'Location is not updating',
      }
    } finally {
      this.inFlight = false
      this.emit()
    }
  }

  async stopTracking(): Promise<void> {
    if (this.watchId != null && navigator.geolocation)
      navigator.geolocation.clearWatch(this.watchId)
    this.watchId = null
    this.input = null
    this.inFlight = false
    this.status = { ...this.status, active: false }
  }

  async getCurrentStatus(): Promise<TrackingStatus> {
    return this.status
  }
  async getPendingLocationCount(): Promise<number> {
    return 0
  }
  async syncPendingLocations(): Promise<void> {
    return undefined
  }
}
