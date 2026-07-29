import type {
  DriverLocationProvider,
  StartTrackingInput,
  TrackingStatus,
} from './driverLocationProvider'

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

  async startTracking(input: StartTrackingInput): Promise<void> {
    if (!navigator.geolocation) throw new Error('Location is not supported by this browser')
    await this.stopTracking()
    this.input = input
    this.status = { ...defaultStatus, active: true, gpsState: 'TRACKING_ACTIVE' }
    input.onStatus?.(this.status)
    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        const point = {
          id: crypto.randomUUID(),
          sequence: ++this.sequence,
          recordedAt: new Date(position.timestamp).toISOString(),
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: Number.isFinite(position.coords.accuracy)
            ? position.coords.accuracy
            : null,
          altitudeMeters: position.coords.altitude,
          speedMps: position.coords.speed,
          headingDegrees: position.coords.heading,
          networkState: navigator.onLine ? ('online' as const) : ('offline' as const),
        }
        void input.onPoint?.(point)
      },
      (error) => {
        this.status = {
          ...this.status,
          gpsState: error.code === 1 ? 'LOCATION_PERMISSION_DENIED' : 'GPS_PROVIDER_DISABLED',
          error: error.message,
        }
        input.onStatus?.(this.status)
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 }
    )
  }

  async stopTracking(): Promise<void> {
    if (this.watchId != null && navigator.geolocation)
      navigator.geolocation.clearWatch(this.watchId)
    this.watchId = null
    this.input = null
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
