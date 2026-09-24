import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  checkBranchLimit,
  checkWarehouseLimit,
  checkLinkedAccountLimit,
  countActiveBranchLocations,
  countActiveWarehouses,
} from './plan-enforcement.js'
import { isLimitKeyApplicable } from './limit-resolution.js'

vi.mock('./db.js', () => ({
  query: vi.fn(),
}))

vi.mock('./warehouse-helpers.js', () => ({
  getWarehouseSupplierColumn: vi.fn().mockResolvedValue('tenant_id'),
}))

vi.mock('./org-billing-tenant.js', () => ({
  resolveOrgBillingTenantId: vi.fn().mockImplementation((id) => Promise.resolve(id)),
}))

vi.mock('./subscription.js', () => ({
  getTenantSubscription: vi.fn(),
}))

vi.mock('./limit-resolution.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    resolveEffectiveLimit: vi.fn(),
  }
})

vi.mock('./subscription-addons.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getAddonQuantity: vi.fn().mockResolvedValue(0),
  }
})

import { query } from './db.js'
import { getTenantSubscription } from './subscription.js'
import { resolveEffectiveLimit } from './limit-resolution.js'
import { getAddonQuantity } from './subscription-addons.js'

function mockSubscription(planCode, planName, limits, planId = 'plan-1') {
  return {
    plan_id: planId,
    plan_code: planCode,
    plan_name: planName,
    limits,
  }
}

function mockResolvedLimit(effectiveLimit) {
  return {
    effectiveLimit,
    isUnlimited: effectiveLimit == null,
    baseLimit: effectiveLimit,
  }
}

describe('plan-enforcement', () => {
  beforeEach(() => {
    vi.mocked(query).mockReset()
    vi.mocked(getTenantSubscription).mockReset()
    vi.mocked(resolveEffectiveLimit).mockReset()
    vi.mocked(getAddonQuantity).mockReset()
    vi.mocked(getAddonQuantity).mockResolvedValue(0)
  })

  describe('countActiveBranchLocations', () => {
    it('counts active org restaurants when organization_id is set', async () => {
      vi.mocked(query)
        .mockResolvedValueOnce({ rows: [{ organization_id: 'org-1' }] })
        .mockResolvedValueOnce({ rows: [{ count: 3 }] })

      const count = await countActiveBranchLocations('rest-main', 'RESTAURANT')
      expect(count).toBe(3)
    })
  })

  describe('checkBranchLimit — Restaurant Intelligence', () => {
    beforeEach(() => {
      vi.mocked(getTenantSubscription).mockResolvedValue(
        mockSubscription('gold', 'Restaurant Intelligence', { branches: 1 })
      )
      vi.mocked(resolveEffectiveLimit).mockResolvedValue(mockResolvedLimit(1))
    })

    it('blocks a second branch and requires Scale when there is no grandfathered add-on', async () => {
      vi.mocked(query)
        .mockResolvedValueOnce({ rows: [{ organization_id: 'org-1' }] })
        .mockResolvedValueOnce({ rows: [{ count: 1 }] })

      const result = await checkBranchLimit('rest-main')
      expect(result.allowed).toBe(false)
      expect(result.current).toBe(1)
      expect(result.includedLimit).toBe(1)
      expect(result.action).toBe('UPGRADE_PLAN')
    })

    it('honors an already-active legacy branch add-on without offering a new one', async () => {
      vi.mocked(getAddonQuantity).mockResolvedValue(1)
      vi.mocked(query)
        .mockResolvedValueOnce({ rows: [{ organization_id: 'org-1' }] })
        .mockResolvedValueOnce({ rows: [{ count: 1 }] })

      const result = await checkBranchLimit('rest-main')
      expect(result.allowed).toBe(true)
      expect(result.effectiveLimit).toBe(2)
    })
  })

  describe('checkBranchLimit — Restaurant Scale', () => {
    beforeEach(() => {
      vi.mocked(getTenantSubscription).mockResolvedValue(
        mockSubscription('platinum', 'Restaurant Scale', { branches: -1 })
      )
      vi.mocked(resolveEffectiveLimit).mockResolvedValue(mockResolvedLimit(null))
    })

    it('allows branches below the contact-sales safeguard without an add-on', async () => {
      vi.mocked(query)
        .mockResolvedValueOnce({ rows: [{ organization_id: 'org-1' }] })
        .mockResolvedValueOnce({ rows: [{ count: 5 }] })

      const result = await checkBranchLimit('rest-main')
      expect(result.allowed).toBe(true)
      expect(result.effectiveLimit).toBe(null)
    })

    it('uses the six-account contact-sales safeguard', async () => {
      vi.mocked(query)
        .mockResolvedValueOnce({ rows: [{ organization_id: 'org-1' }] })
        .mockResolvedValueOnce({ rows: [{ count: 6 }] })

      const result = await checkBranchLimit('rest-main')
      expect(result.allowed).toBe(false)
      expect(result.action).toBe('CONTACT_ENTERPRISE')
    })
  })

  describe('checkLinkedAccountLimit — Supplier Growth', () => {
    beforeEach(() => {
      vi.mocked(getTenantSubscription).mockResolvedValue(
        mockSubscription('gold', 'Supplier Growth', { branches: 1, warehouses: 1 })
      )
      vi.mocked(resolveEffectiveLimit).mockImplementation(({ limitKey }) => {
        if (limitKey === 'branches') return Promise.resolve(mockResolvedLimit(1))
        return Promise.resolve(mockResolvedLimit(1))
      })
    })

    it('blocks a second supplier branch without an add-on', async () => {
      vi.mocked(query)
        .mockResolvedValueOnce({ rows: [{ organization_id: 'org-s' }] })
        .mockResolvedValueOnce({ rows: [{ count: 1 }] })

      const result = await checkLinkedAccountLimit('sup-main', 'SUPPLIER')
      expect(result.allowed).toBe(false)
      expect(result.includedLimit).toBe(1)
      expect(result.action).toBe('UPGRADE_PLAN')
    })
  })

  describe('checkWarehouseLimit — Supplier Growth', () => {
    beforeEach(() => {
      vi.mocked(getTenantSubscription).mockResolvedValue(
        mockSubscription('gold', 'Supplier Growth', { warehouses: 1 })
      )
      vi.mocked(resolveEffectiveLimit).mockResolvedValue(mockResolvedLimit(1))
    })

    it('blocks a second warehouse and requires Supplier Scale', async () => {
      vi.mocked(query)
        .mockResolvedValueOnce({ rows: [{ organization_id: null }] })
        .mockResolvedValueOnce({ rows: [{ count: 1 }] })

      const result = await checkWarehouseLimit('sup-1')
      expect(result.allowed).toBe(false)
      expect(result.action).toBe('UPGRADE_PLAN')
    })

    it('honors an already-active legacy warehouse add-on', async () => {
      vi.mocked(getAddonQuantity).mockResolvedValue(1)
      vi.mocked(query)
        .mockResolvedValueOnce({ rows: [{ organization_id: null }] })
        .mockResolvedValueOnce({ rows: [{ count: 1 }] })

      const result = await checkWarehouseLimit('sup-1')
      expect(result.allowed).toBe(true)
      expect(result.effectiveLimit).toBe(2)
    })
  })

  describe('checkWarehouseLimit — Supplier Scale', () => {
    beforeEach(() => {
      vi.mocked(getTenantSubscription).mockResolvedValue(
        mockSubscription('platinum', 'Supplier Scale', { warehouses: 3 })
      )
      vi.mocked(resolveEffectiveLimit).mockResolvedValue(mockResolvedLimit(3))
    })

    it('offers an add-on when the included three warehouses are used', async () => {
      vi.mocked(query)
        .mockResolvedValueOnce({ rows: [{ organization_id: null }] })
        .mockResolvedValueOnce({ rows: [{ count: 3 }] })

      const result = await checkWarehouseLimit('sup-1')
      expect(result.allowed).toBe(false)
      expect(result.action).toBe('ADDON_OR_UPGRADE')
    })
  })

  describe('Growth and Free Trial', () => {
    it('Growth cannot use add-on path - upgrade plan', async () => {
      vi.mocked(getTenantSubscription).mockResolvedValue(
        mockSubscription('silver', 'Silver', { branches: 1 })
      )
      vi.mocked(resolveEffectiveLimit).mockResolvedValue(mockResolvedLimit(1))
      vi.mocked(query)
        .mockResolvedValueOnce({ rows: [{ organization_id: 'org-1' }] })
        .mockResolvedValueOnce({ rows: [{ count: 1 }] })

      const result = await checkBranchLimit('rest-main')
      expect(result.allowed).toBe(false)
      expect(result.action).toBe('UPGRADE_PLAN')
    })

    it('Free Trial cannot use branch add-ons', async () => {
      vi.mocked(getTenantSubscription).mockResolvedValue(
        mockSubscription('free', 'Free Trial', { branches: 1 })
      )
      vi.mocked(resolveEffectiveLimit).mockResolvedValue(mockResolvedLimit(1))
      vi.mocked(query)
        .mockResolvedValueOnce({ rows: [{ organization_id: 'org-1' }] })
        .mockResolvedValueOnce({ rows: [{ count: 1 }] })

      const result = await checkBranchLimit('rest-main')
      expect(result.allowed).toBe(false)
      expect(result.action).toBe('UPGRADE_PLAN')
    })

    it('Free Trial blocks warehouse creation', async () => {
      vi.mocked(getTenantSubscription).mockResolvedValue(
        mockSubscription('free', 'Free', { warehouses: 0 })
      )
      vi.mocked(resolveEffectiveLimit).mockResolvedValue(mockResolvedLimit(0))
      vi.mocked(query)
        .mockResolvedValueOnce({ rows: [{ organization_id: null }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })

      const result = await checkWarehouseLimit('sup-1')
      expect(result.allowed).toBe(false)
      expect(result.action).toBe('UPGRADE_PLAN')
    })
  })

  describe('Enterprise branch threshold', () => {
    it('returns CONTACT_ENTERPRISE at 6 branches', async () => {
      vi.mocked(getTenantSubscription).mockResolvedValue(
        mockSubscription('platinum', 'Platinum', { branches: 3 })
      )
      vi.mocked(resolveEffectiveLimit).mockResolvedValue(mockResolvedLimit(3))
      vi.mocked(getAddonQuantity).mockResolvedValue(5)
      vi.mocked(query)
        .mockResolvedValueOnce({ rows: [{ organization_id: 'org-1' }] })
        .mockResolvedValueOnce({ rows: [{ count: 6 }] })

      const result = await checkBranchLimit('rest-main')
      expect(result.allowed).toBe(false)
      expect(result.action).toBe('CONTACT_ENTERPRISE')
    })
  })

  describe('restaurant plans and warehouse limits', () => {
    it('does not treat warehouses as a restaurant entitlement key', () => {
      expect(isLimitKeyApplicable('RESTAURANT', 'warehouses')).toBe(false)
      expect(isLimitKeyApplicable('SUPPLIER', 'warehouses')).toBe(true)
    })
  })
})
