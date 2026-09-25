import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQuery = vi.fn()
vi.mock('./db.js', () => ({ query: (...args) => mockQuery(...args) }))
vi.mock('./logger.js', () => ({ logger: { error: vi.fn(), debug: vi.fn(), warn: vi.fn() } }))
vi.mock('./cache.js', () => ({
  getCache: vi.fn().mockResolvedValue(null),
  setCache: vi.fn().mockResolvedValue(undefined),
  deleteCache: vi.fn().mockResolvedValue(undefined),
  deleteCacheByPrefix: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('./subscription.js', () => ({
  invalidateEntitlementsCache: vi.fn().mockResolvedValue(undefined),
}))

describe('feature-flags', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

    it('keeps the plan tier when an admin forces a feature on', async () => {
      const { resolveAllFeaturesForTenant } = await import('./feature-flags.js')
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ feature_key: 'notifications', global_override: true }],
        })
        .mockResolvedValueOnce({
          rows: [{ feature_key: 'intelligence', is_enabled: true }],
        })

      const { features, featureSources } = await resolveAllFeaturesForTenant('t1', 'RESTAURANT', {
        intelligence: 'scale',
        notifications: 'email_whatsapp_webhook',
        smart_reorder: false,
      })

      expect(features.intelligence).toBe('scale')
      expect(featureSources.intelligence).toBe('tenant_override')
      expect(features.notifications).toBe('email_whatsapp_webhook')
      expect(featureSources.notifications).toBe('global')
    })

    it('forces a missing plan feature on as boolean true', async () => {
      const { resolveAllFeaturesForTenant } = await import('./feature-flags.js')
      mockQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({
        rows: [{ feature_key: 'smart_reorder', is_enabled: true }],
      })

      const { features } = await resolveAllFeaturesForTenant('t1', 'RESTAURANT', {
        smart_reorder: false,
      })

      expect(features.smart_reorder).toBe(true)
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

    it('does not alias after an explicit admin off', async () => {
      const { shouldAliasAfterResolution } = await import('./feature-flags.js')
      expect(
        shouldAliasAfterResolution(
          { enabled: false, source: 'tenant_override' },
          'driver_management',
          { fulfillment_tools: true }
        )
      ).toBe(false)
      expect(
        shouldAliasAfterResolution({ enabled: false, source: 'global' }, 'fulfillment', {})
      ).toBe(false)
      expect(
        shouldAliasAfterResolution({ enabled: false, source: 'default' }, 'fulfillment', {})
      ).toBe(true)
    })

    it('aliases when primary key is absent from plan JSON', async () => {
      const { shouldResolveFeatureAlias } = await import('./feature-flags.js')
      expect(
        shouldResolveFeatureAlias('driver_management', { fulfillment_tools: 'warehouse_pick_pack' })
      ).toBe(true)
      expect(shouldResolveFeatureAlias('fulfillment', {})).toBe(true)
    })
  })

  describe('setGlobalFeatureOverride', () => {
    it('invalidates feature flag caches after global update', async () => {
      const { setGlobalFeatureOverride } = await import('./feature-flags.js')
      const { deleteCacheByPrefix } = await import('./cache.js')
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            feature_key: 'reports',
            feature_name: 'Reports & analytics',
            description: null,
            global_override: true,
            updated_at: new Date(),
          },
        ],
      })

      await setGlobalFeatureOverride('reports', 'on')

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (feature_key)'), [
        'reports',
        'Reports & analytics',
        true,
      ])
      expect(deleteCacheByPrefix).toHaveBeenCalledWith('ff:')
    })
  })
  describe('tenant override persistence', () => {
    it('upserts the override and invalidates both feature and entitlement caches', async () => {
      const { setTenantFeatureOverride } = await import('./feature-flags.js')
      const { deleteCache } = await import('./cache.js')
      const { invalidateEntitlementsCache } = await import('./subscription.js')
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            feature_key: 'reports',
            is_enabled: false,
            reason: 'maintenance',
            created_by: 'admin-1',
            updated_at: new Date(),
          },
        ],
      })

      const result = await setTenantFeatureOverride(
        'tenant-1',
        'RESTAURANT',
        'reports',
        false,
        'maintenance',
        'admin-1'
      )

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT'), [
        'tenant-1',
        'RESTAURANT',
        'reports',
        false,
        'maintenance',
        'admin-1',
      ])
      expect(result.enabled).toBe(false)
      expect(deleteCache).toHaveBeenCalledWith('ff:all:tenant-1:RESTAURANT')
      expect(deleteCache).toHaveBeenCalledWith('ff:tenant-1:RESTAURANT:reports')
      expect(invalidateEntitlementsCache).toHaveBeenCalledWith('tenant-1', 'RESTAURANT')
    })

    it('deletes the persisted override and invalidates caches', async () => {
      const { clearTenantFeatureOverride } = await import('./feature-flags.js')
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await clearTenantFeatureOverride('tenant-1', 'SUPPLIER', 'ai_assistant')

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM feature_flag_override'),
        ['tenant-1', 'SUPPLIER', 'ai_assistant']
      )
    })
  })
})
