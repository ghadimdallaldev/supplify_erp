import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQuery = vi.fn()
vi.mock('./db.js', () => ({ query: (...args) => mockQuery(...args) }))
vi.mock('./logger.js', () => ({ logger: { error: vi.fn(), debug: vi.fn(), warn: vi.fn() } }))
vi.mock('./cache.js', () => ({
  getCache: vi.fn().mockResolvedValue(null),
  setCache: vi.fn().mockResolvedValue(undefined),
  deleteCache: vi.fn().mockResolvedValue(undefined),
}))

describe('feature-flags', () => {
  beforeEach(() => {
    mockQuery.mockReset()
  })

  describe('evaluatePlanFeatureValue', () => {
    it('treats boolean and string plan values correctly', async () => {
      const { evaluatePlanFeatureValue } = await import('./feature-flags.js')
      expect(evaluatePlanFeatureValue(true)).toBe(true)
      expect(evaluatePlanFeatureValue(false)).toBe(false)
      expect(evaluatePlanFeatureValue('enabled')).toBe(true)
      expect(evaluatePlanFeatureValue('disabled')).toBe(false)
      expect(evaluatePlanFeatureValue(false)).toBe(false)
      expect(evaluatePlanFeatureValue(undefined)).toBe(false)
    })
  })

  describe('resolveAllFeaturesForTenant', () => {
    it('merges tenant overrides, global, and plan in one pass', async () => {
      const { resolveAllFeaturesForTenant } = await import('./feature-flags.js')
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ feature_key: 'reports', global_override: false }],
        })
        .mockResolvedValueOnce({
          rows: [{ feature_key: 'chat', is_enabled: true }],
        })

      const { features, featureSources } = await resolveAllFeaturesForTenant('t1', 'RESTAURANT', {
        chat: false,
        reports: true,
      })

      expect(features.chat).toBe(true)
      expect(featureSources.chat).toBe('tenant_override')
      expect(features.reports).toBe(false)
      expect(featureSources.reports).toBe('global')
    })

    it('preserves tier strings on enabled plan features (e.g. quick_lists)', async () => {
      const { resolveAllFeaturesForTenant } = await import('./feature-flags.js')
      mockQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] })

      const { features, featureSources } = await resolveAllFeaturesForTenant('t1', 'RESTAURANT', {
        quick_lists: 'full_schedule',
        reports: false,
      })

      expect(features.quick_lists).toBe('full_schedule')
      expect(featureSources.quick_lists).toBe('plan')
    })
  })

  describe('resolveFeatureEnabled', () => {
    it('prefers tenant override over global and plan', async () => {
      const { resolveFeatureEnabled } = await import('./feature-flags.js')
      mockQuery
        .mockResolvedValueOnce({ rows: [{ is_enabled: false }] })
        .mockResolvedValueOnce({ rows: [{ global_override: true }] })

      const result = await resolveFeatureEnabled('t1', 'RESTAURANT', 'reports', { reports: true })
      expect(result).toEqual({ enabled: false, source: 'tenant_override' })
    })

    it('uses global override when no tenant override', async () => {
      const { resolveFeatureEnabled } = await import('./feature-flags.js')
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ global_override: false }] })

      const result = await resolveFeatureEnabled('t1', 'RESTAURANT', 'reports', { reports: true })
      expect(result).toEqual({ enabled: false, source: 'global' })
    })

    it('falls back to plan features', async () => {
      const { resolveFeatureEnabled } = await import('./feature-flags.js')
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ global_override: null }] })

      const result = await resolveFeatureEnabled('t1', 'RESTAURANT', 'reports', { reports: true })
      expect(result).toEqual({ enabled: true, source: 'plan' })
    })
  })

  describe('shouldResolveFeatureAlias', () => {
    it('does not alias when primary key is explicitly false', async () => {
      const { shouldResolveFeatureAlias } = await import('./feature-flags.js')
      expect(
        shouldResolveFeatureAlias('driver_management', {
          driver_management: false,
          fulfillment_tools: 'manual_orders_invoices',
        })
      ).toBe(false)
      expect(shouldResolveFeatureAlias('fulfillment', { fulfillment: false })).toBe(false)
    })

    it('aliases when primary key is absent from plan JSON', async () => {
      const { shouldResolveFeatureAlias } = await import('./feature-flags.js')
      expect(
        shouldResolveFeatureAlias('driver_management', { fulfillment_tools: 'warehouse_pick_pack' })
      ).toBe(true)
      expect(shouldResolveFeatureAlias('fulfillment', {})).toBe(true)
    })
  })
})
