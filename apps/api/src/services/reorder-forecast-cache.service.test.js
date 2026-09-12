import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/db.js', () => ({
  query: vi.fn(),
}))

vi.mock('./reorder-forecast.service.js', () => ({
  computeRestaurantForecasts: vi.fn(),
}))

vi.mock('../lib/feature-flags.js', () => ({
  isFeatureEnabledForTenant: vi.fn(),
  getEffectiveFeaturesForTenant: vi.fn(),
}))

import { query } from '../lib/db.js'
import { computeRestaurantForecasts } from './reorder-forecast.service.js'
import { isFeatureEnabledForTenant } from '../lib/feature-flags.js'
import {
  refreshAllDirtyForecasts,
  refreshRestaurantForecasts,
} from './reorder-forecast-cache.service.js'

describe('reorder-forecast-cache.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    query.mockReset()
  })

  it('skips forecast writes when the restaurant subscription is locked', async () => {
    query.mockResolvedValueOnce({ rows: [] })

    const result = await refreshRestaurantForecasts('rest-locked')

    expect(result).toEqual({ refreshed: 0, skipped: 'tenant_locked' })
    expect(computeRestaurantForecasts).not.toHaveBeenCalled()
    expect(isFeatureEnabledForTenant).not.toHaveBeenCalled()
    expect(String(query.mock.calls[0][0])).toContain('FROM subscription')
    expect(String(query.mock.calls[0][0])).toContain('account_locked_at IS NULL')
    expect(query.mock.calls[0][1]).toEqual(['rest-locked', 'RESTAURANT'])
  })

  it('filters nightly dirty and stale forecast candidates to unlocked restaurants', async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] })

    const result = await refreshAllDirtyForecasts()

    expect(result).toEqual({ restaurants: 0, forecasts: 0 })
    const dirtySql = String(query.mock.calls[0][0])
    const staleSql = String(query.mock.calls[1][0])
    expect(dirtySql).toContain('FROM subscription sub')
    expect(dirtySql).toContain('sub.account_locked_at IS NULL')
    expect(staleSql).toContain('FROM subscription sub')
    expect(staleSql).toContain('sub.account_locked_at IS NULL')
  })
})
