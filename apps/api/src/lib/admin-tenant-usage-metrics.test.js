import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./db.js', () => ({ query: vi.fn() }))

import { buildTenantLimitOverviewCounts } from './admin-tenant-usage-metrics.js'

describe('admin-tenant-usage-metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('buildTenantLimitOverviewCounts', () => {
    it('returns over and near limit tenant counts from usage_meter', async () => {
      const safeOverviewQuery = vi
        .fn()
        .mockResolvedValueOnce([{ count: 3 }])
        .mockResolvedValueOnce([{ count: 7 }])

      const result = await buildTenantLimitOverviewCounts(safeOverviewQuery)
      expect(result).toEqual({ tenantsOverLimit: 3, tenantsNearLimit: 7 })
      expect(safeOverviewQuery).toHaveBeenCalledTimes(2)
    })

    it('falls back to zero when queries fail', async () => {
      const safeOverviewQuery = vi.fn(async (_name, _sql, fallback) => fallback)
      const result = await buildTenantLimitOverviewCounts(safeOverviewQuery)
      expect(result).toEqual({ tenantsOverLimit: 0, tenantsNearLimit: 0 })
    })
  })
})
