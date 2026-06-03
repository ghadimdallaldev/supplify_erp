import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/db.js', () => ({
  query: vi.fn(),
}))

vi.mock('../config/env.js', () => ({
  config: { GPS_LOCATION_RETENTION_DAYS: 90 },
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import { query } from '../lib/db.js'
import { runDriverLocationRetentionJob } from './driver-location-retention.job.js'

describe('runDriverLocationRetentionJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deletes pings older than retention window', async () => {
    query.mockResolvedValueOnce({ rowCount: 42 })

    const result = await runDriverLocationRetentionJob()

    expect(result.deletedCount).toBe(42)
    expect(result.retentionDays).toBe(90)
    expect(query.mock.calls[0][0]).toMatch(/DELETE FROM driver_location_ping/)
  })
})
