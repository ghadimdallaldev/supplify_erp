import type {
  DriverLocationProvider,
  StartTrackingInput,
  TrackingStatus,
  DriverLocationPoint,
} from './driverLocationProvider'

type NativeLocationPlugin = {
  startTracking: (input: {
    routeId?: string | null
    sessionId?: string | null
  }) => Promise<{ sessionId: string }>
  stopTracking: (input?: { reason?: string }) => Promise<void>
  getStatus: () => Promise<TrackingStatus>
  getPendingLocationCount: () => Promise<{ count: number }>
  getPendingLocations?: () => Promise<{ points: DriverLocationPoint[] }>
  acknowledgeLocation?: (input: { id: string }) => Promise<void>
  syncPendingLocations: () => Promise<{ count?: number } | void>
  addListener?: (
    event: string,
    listener: (point: DriverLocationPoint) => void
  ) => Promise<{ remove: () => void }>
}

function getPlugin(): NativeLocationPlugin | null {
  const plugins = (globalThis as { Capacitor?: { Plugins?: Record<string, NativeLocationPlugin> } })
    .Capacitor?.Plugins
  return plugins?.DriverLocation ?? null
}

export class NativeAndroidDriverLocationProvider implements DriverLocationProvider {
  private listener: { remove: () => void } | null = null

  async startTracking(input: StartTrackingInput): Promise<void> {
    const plugin = getPlugin()
    if (!plugin) throw new Error('Native Android location service is unavailable')
    this.listener =
      (await plugin.addListener?.('location', (point) => {
        void (async () => {
          try {
            await input.onPoint?.(point)
            await plugin.acknowledgeLocation?.({ id: point.id })
          } catch {
            // Keep the point persisted natively until the next sync attempt.
          }
        })()
      })) ?? null
    const result = await plugin.startTracking({
      routeId: input.routeId,
      sessionId: input.sessionId,
    })
    const pending = await plugin.getPendingLocations?.()
    for (const point of pending?.points ?? []) {
      try {
        await input.onPoint?.(point)
        await plugin.acknowledgeLocation?.({ id: point.id })
      } catch {
        break
      }
    }
    input.onStatus?.({
      ...(await plugin.getStatus()),
      active: true,
      sessionId: result.sessionId,
      provider: 'native-android',
    })
  }

  async stopTracking(): Promise<void> {
    const plugin = getPlugin()
    this.listener?.remove()
    this.listener = null
    await plugin?.stopTracking({ reason: 'driver_action' })
  }

  async getCurrentStatus(): Promise<TrackingStatus> {
    const plugin = getPlugin()
    if (!plugin)
      return {
        active: false,
        provider: 'native-android',
        sessionId: null,
        gpsState: 'APP_TERMINATED',
        networkState: 'offline',
        pendingLocationCount: 0,
        lastSyncedAt: null,
        error: 'Native plugin unavailable',
      }
    return plugin.getStatus()
  }

  async getPendingLocationCount(): Promise<number> {
    return (await getPlugin()?.getPendingLocationCount())?.count ?? 0
  }
  async syncPendingLocations(): Promise<void> {
    await getPlugin()?.syncPendingLocations()
  }
}
