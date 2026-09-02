import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../config/env.js', () => ({
  config: {
    GPS_TRACKING_ENABLED: true,
    GPS_TRACKING_SESSIONS_ENABLED: true,
    GPS_BATCH_MAX_SIZE: 2,
    GPS_MAX_ACCURACY_METERS: 250,
    GPS_MAX_SPEED_KPH: 160,
  },
}))
vi.mock('../lib/db.js', () => ({ query: vi.fn() }))
vi.mock('../lib/driver-location-redis.js', () => ({ setLatestDriverLocation: vi.fn() }))
vi.mock('../lib/socket.js', () => ({
  emitDriverLocationUpdated: vi.fn(),
  emitDriverTrackingStatus: vi.fn(),
}))

import { query } from '../lib/db.js'
import { ConflictError, ValidationError } from '../middlewares/errorHandler.js'
import {
  getActiveTrackingSession,
  ingestTrackingLocations,
  startTrackingSession,
} from './driver-tracking-session.service.js'

describe('driver tracking sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    query.mockReset()
  })

  it('prevents a second active session for the same driver', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { id: 'session-1', status: 'ACTIVE', driver_id: 'driver-1', supplier_id: 'supplier-1' },
      ],
    })
    await expect(
      startTrackingSession({ supplierId: 'supplier-1', driverId: 'driver-1' })
    ).rejects.toThrow(ConflictError)
  })

  it('enforces the configured batch size before loading the session', async () => {
    const points = Array.from({ length: 3 }, (_, index) => ({
      id: `00000000-0000-4000-8000-00000000000${index + 1}`,
      sequence: index + 1,
    }))
    await expect(
      ingestTrackingLocations({
        supplierId: 'supplier-1',
        driverId: 'driver-1',
        sessionId: 'session-1',
        points,
      })
    ).rejects.toThrow(ValidationError)
    expect(query).not.toHaveBeenCalled()
  })

  it('returns null when a driver has no active session', async () => {
    query.mockResolvedValueOnce({ rows: [] })
    await expect(
      getActiveTrackingSession({ supplierId: 'supplier-1', driverId: 'driver-1' })
    ).resolves.toBeNull()
  })
})
