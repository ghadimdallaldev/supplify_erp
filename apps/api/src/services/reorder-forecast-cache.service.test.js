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
  getResolvedFeatureValue: vi.fn(),
  // smart-reorder-tier.js imports this; keep the real semantics so the
  // capability check under test behaves exactly as it does in production.
  evaluatePlanFeatureValue: (value) => {
    if (value === undefined) return false
    if (typeof value === 'boolean') return value
    if (typeof value === 'string') {
      return value !== 'false' && value !== 'disabled' && value !== ''
    }
    return Boolean(value)
  },
}))

import { query } from '../lib/db.js'
import { computeRestaurantForecasts } from './reorder-forecast.service.js'
import { isFeatureEnabledForTenant, getResolvedFeatureValue } from '../lib/feature-flags.js'
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

  it('refreshes a forecast-tier tenant from the cron path', async () => {
    // Regression: the cron called refreshRestaurantForecasts without a feature
    // value, and the fallback read `.features` off an ARRAY, so featureValue
    // was always undefined and every scheduled refresh bailed out as
    // 'feature_disabled'. The job never produced a forecast.
    query
      .mockResolvedValueOnce({ rows: [{ restaurant_id: 'rest-scale' }] }) // dirty
      .mockResolvedValueOnce({ rows: [] }) // stale
      .mockResolvedValueOnce({ rows: [{ unlocked: true }] }) // background-write lock
      .mockResolvedValue({ rows: [] }) // saves
    getResolvedFeatureValue.mockResolvedValue('ai_forecast_seasonality')
    computeRestaurantForecasts.mockResolvedValue({
      forecasts: [{ productId: 'p1' }],
      skipped: null,
    })

    const result = await refreshAllDirtyForecasts()

    expect(getResolvedFeatureValue).toHaveBeenCalledWith(
      'rest-scale',
      'RESTAURANT',
      'smart_reorder'
    )
    expect(computeRestaurantForecasts).toHaveBeenCalled()
    expect(computeRestaurantForecasts.mock.calls[0][1].featureValue).toBe('ai_forecast_seasonality')
    expect(result.forecasts).toBe(1)
    expect(result.skippedNoForecastTier).toBe(0)
  })

  it('does not compute forecasts for a Growth tenant without the capability', async () => {
    // `suggestions_only` is truthy, so a plain feature check would have queued
    // work for a plan that cannot read the result.
    query
      .mockResolvedValueOnce({ rows: [{ restaurant_id: 'rest-growth' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ unlocked: true }] })
      .mockResolvedValue({ rows: [] })
    getResolvedFeatureValue.mockResolvedValue('suggestions_only')

    const result = await refreshAllDirtyForecasts()

    expect(computeRestaurantForecasts).not.toHaveBeenCalled()
    expect(result.forecasts).toBe(0)
    expect(result.skippedNoForecastTier).toBe(1)
  })

  it('filters nightly dirty and stale forecast candidates to unlocked restaurants', async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] })

    const result = await refreshAllDirtyForecasts()

    expect(result).toEqual({ restaurants: 0, forecasts: 0, skippedNoForecastTier: 0 })
    const dirtySql = String(query.mock.calls[0][0])
    const staleSql = String(query.mock.calls[1][0])
    expect(dirtySql).toContain('FROM subscription sub')
    expect(dirtySql).toContain('sub.account_locked_at IS NULL')
    expect(staleSql).toContain('FROM subscription sub')
    expect(staleSql).toContain('sub.account_locked_at IS NULL')
  })
})
