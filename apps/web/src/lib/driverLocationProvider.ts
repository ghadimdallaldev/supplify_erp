export type DriverLocationPoint = {
  id: string
  sessionId?: string | null
  sequence: number
  recordedAt: string
  latitude: number
  longitude: number
  accuracyMeters?: number | null
  altitudeMeters?: number | null
  speedMps?: number | null
  headingDegrees?: number | null
  batteryPercent?: number | null
  isMocked?: boolean
  networkState?: 'online' | 'offline'
}

export type StartTrackingInput = {
  routeId?: string | null
  sessionId?: string | null
  deliveries: Array<{ orderId: string; deliveryStatus: string }>
  onPoint?: (point: DriverLocationPoint) => Promise<void>
  onStatus?: (status: TrackingStatus) => void
}

export type TrackingStatus = {
  active: boolean
  provider: 'web' | 'native-android'
  sessionId: string | null
  gpsState: string
  networkState: 'online' | 'offline'
  pendingLocationCount: number
  lastSyncedAt: string | null
  error: string | null
}

export interface DriverLocationProvider {
  startTracking(input: StartTrackingInput): Promise<void>
  stopTracking(): Promise<void>
  getCurrentStatus(): Promise<TrackingStatus>
  getPendingLocationCount(): Promise<number>
  syncPendingLocations(): Promise<void>
}
