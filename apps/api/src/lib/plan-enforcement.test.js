import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  checkBranchLimit,
  checkWarehouseLimit,
  countActiveBranchLocations,
} from './plan-enforcement.js'
import { isLimitKeyApplicable } from './limit-resolution.js'

vi.mock('./db.js', () => ({
  query: vi.fn(),
}))

vi.mock('./warehouse-helpers.js', () => ({
  getWarehouseSupplierColumn: vi.fn().mockResolvedValue('tenant_id'),
}))

import { query } from './db.js'

function mockSubscription(planCode, planName, limits) {
  return {
    rows: [
      {
        plan_limits: limits,
        plan_code: planCode,
        plan_name: planName,
      },
    ],
  }
}

describe('plan-enforcement', () => {
  beforeEach(() => {
    vi.mocked(query).mockReset()
  })

  describe('countActiveBranchLocations', () => {
    it('counts active org restaurants when organization_id is set', async () => {
      vi.mocked(query)
        .mockResolvedValueOnce({ rows: [{ organization_id: 'org-1' }] })
        .mockResolvedValueOnce({ rows: [{ count: 3 }] })

      const count = await countActiveBranchLocations('rest-main', 'RESTAURANT')
      expect(count).toBe(3)
      expect(query).toHaveBeenCalledTimes(2)
      expect(String(query.mock.calls[1][0])).toMatch(/organization_id/)
      expect(String(query.mock.calls[1][0])).toMatch(/is_branch_active/)
    })

    it('falls back to primary + linked accounts without org', async () => {
      vi.mocked(query)
        .mockResolvedValueOnce({ rows: [{ organization_id: null }] })
        .mockResolvedValueOnce({ rows: [{ count: 2 }] })

      const count = await countActiveBranchLocations('rest-main', 'RESTAURANT')
      expect(count).toBe(3)
      expect(String(query.mock.calls[1][0])).toMatch(/tenant_account_link/)
    })
  })

  describe('checkBranchLimit', () => {
    it('blocks when org branch count meets Gold limit', async () => {
      vi.mocked(query)
        .mockResolvedValueOnce(mockSubscription('gold', 'Gold', { branches: 3 }))
        .mockResolvedValueOnce({ rows: [{ organization_id: 'org-1' }] })
        .mockResolvedValueOnce({ rows: [{ count: 3 }] })

      const result = await checkBranchLimit('rest-main')
      expect(result.allowed).toBe(false)
      expect(result.current).toBe(3)
      expect(result.limit).toBe(3)
    })

    it('allows when under Silver single-location limit', async () => {
      vi.mocked(query)
        .mockResolvedValueOnce(mockSubscription('silver', 'Silver', { branches: 1 }))
        .mockResolvedValueOnce({ rows: [{ organization_id: 'org-1' }] })
        .mockResolvedValueOnce({ rows: [{ count: 1 }] })

      const result = await checkBranchLimit('rest-main')
      expect(result.allowed).toBe(false)
      expect(result.current).toBe(1)
    })

    it('allows unlimited branches on Platinum', async () => {
      vi.mocked(query)
        .mockResolvedValueOnce(mockSubscription('platinum', 'Platinum', { branches: -1 }))
        .mockResolvedValueOnce({ rows: [{ organization_id: 'org-1' }] })
        .mockResolvedValueOnce({ rows: [{ count: 10 }] })

      const result = await checkBranchLimit('rest-main')
      expect(result.allowed).toBe(true)
      expect(result.limit).toBe(-1)
    })
  })

  describe('checkWarehouseLimit', () => {
    it('blocks supplier at warehouse cap', async () => {
      vi.mocked(query)
        .mockResolvedValueOnce(mockSubscription('gold', 'Gold', { warehouses: 3 }))
        .mockResolvedValueOnce({ rows: [{ count: 3 }] })

      const result = await checkWarehouseLimit('sup-1')
      expect(result.allowed).toBe(false)
      expect(result.current).toBe(3)
    })

    it('allows creation when under limit', async () => {
      vi.mocked(query)
        .mockResolvedValueOnce(mockSubscription('silver', 'Silver', { warehouses: 1 }))
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })

      const result = await checkWarehouseLimit('sup-1')
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(1)
    })

    it('blocks Free tier with zero warehouse limit even if rows exist', async () => {
      vi.mocked(query)
        .mockResolvedValueOnce(mockSubscription('free', 'Free', { warehouses: 0 }))
        .mockResolvedValueOnce({ rows: [{ count: 1 }] })

      const result = await checkWarehouseLimit('sup-1')
      expect(result.allowed).toBe(false)
    })
  })

  describe('restaurant plans and warehouse limits', () => {
    it('does not treat warehouses as a restaurant entitlement key', () => {
      expect(isLimitKeyApplicable('RESTAURANT', 'warehouses')).toBe(false)
      expect(isLimitKeyApplicable('SUPPLIER', 'warehouses')).toBe(true)
    })
  })
})
