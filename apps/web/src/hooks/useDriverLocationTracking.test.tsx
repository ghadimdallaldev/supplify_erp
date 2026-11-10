import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { StartTrackingInput } from '../lib/driverLocationProvider'

const provider = vi.hoisted(() => ({
  startTracking: vi.fn(),
  stopTracking: vi.fn(async () => undefined),
}))
const sendLocationMock = vi.hoisted(() => vi.fn())

vi.mock('../lib/driverLocationPlatform', () => ({
  createDriverLocationProvider: () => provider,
}))
vi.mock('../lib/driverLocationQueue', () => ({ enqueueDriverLocation: vi.fn() }))
vi.mock('../services/api', () => ({
  useSendDriverLocationMutation: () => [sendLocationMock],
}))

import { useDriverLocationTracking } from './useDriverLocationTracking'

const deliveries = [{ orderId: 'o1', deliveryStatus: 'assigned', routeId: null }]

describe('useDriverLocationTracking CSRF header', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubEnv('VITE_GPS_TRACKING_SESSIONS_ENABLED', 'true')
    fetchMock.mockReset()
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true,
      json: async () =>
        String(url).endsWith('/tracking-sessions')
          ? { ok: true, data: { session: { id: 's1' } } }
          : {},
    }))
    vi.stubGlobal('fetch', fetchMock)
    provider.startTracking.mockReset()
    provider.startTracking.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('sends X-Requested-With on session start, location POST and stop', async () => {
    const { unmount } = renderHook(() => useDriverLocationTracking(deliveries))

    await waitFor(() => expect(provider.startTracking).toHaveBeenCalled())
    const input = provider.startTracking.mock.calls[0][0] as StartTrackingInput
    await input.onPoint({
      latitude: 1,
      longitude: 2,
      recordedAt: new Date().toISOString(),
    } as never)
    unmount()

    const writes = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(writes.map(([url]) => String(url))).toEqual([
      expect.stringContaining('/api/driver/tracking-sessions'),
      expect.stringContaining('/api/driver/tracking-sessions/s1/locations'),
      expect.stringContaining('/api/driver/tracking-sessions/s1/stop'),
    ])
    for (const [, init] of writes) {
      expect(init.headers['X-Requested-With']).toBe('Supplify')
      expect(init.credentials).toBe('include')
    }
  })
})
