import { describe, expect, it } from 'vitest'
import {
  buildTierLadderWarnings,
  isValidLimitScalar,
  validateEnterprisePlanActivation,
  validateFreePlanTrialDays,
  validatePlanLimitsAndFeatures,
} from './plan-admin-validation.js'

const silverRestaurantLimits = {
  branches: 1,
  users: 3,
  orders_per_day: 20,
  storage_mb: 500,
}

const goldRestaurantLimits = {
  branches: 3,
  users: 15,
  orders_per_day: 100,
  storage_mb: 10240,
}

describe('plan-admin-validation', () => {
  describe('validatePlanLimitsAndFeatures', () => {
    it('rejects unknown limit keys', () => {
      const r = validatePlanLimitsAndFeatures({ bogus: 1 }, {}, 'RESTAURANT')
      expect(r.valid).toBe(false)
      expect(r.message).toMatch(/Unknown keys/)
    })

    it('rejects promotions limit on restaurant plans', () => {
      const r = validatePlanLimitsAndFeatures(
        { promotions: 5, branches: 1, users: 1, storage_mb: 50 },
        {},
        'RESTAURANT'
      )
      expect(r.valid).toBe(false)
      expect(r.message).toMatch(/promotions|Unknown/)
    })

    it('allows promotions limit on supplier plans', () => {
      const r = validatePlanLimitsAndFeatures(
        {
          branches: 1,
          warehouses: 1,
          users: 3,
          supplier_products_skus: 250,
          chats_per_day: 30,
          open_conversations: 5,
          storage_mb: 500,
          promotions: 3,
        },
        { promotions: true, chat: true },
        'SUPPLIER'
      )
      expect(r.valid).toBe(true)
    })

    it('rejects deal_redemptions_per_day on supplier plans', () => {
      const r = validatePlanLimitsAndFeatures(
        {
          branches: 1,
          warehouses: 1,
          users: 3,
          supplier_products_skus: 250,
          chats_per_day: 30,
          open_conversations: 5,
          storage_mb: 500,
          promotions: 3,
          deal_redemptions_per_day: 10,
        },
        {},
        'SUPPLIER'
      )
      expect(r.valid).toBe(false)
      expect(r.message).toMatch(/Unknown keys|restaurant-only/)
    })

    it('rejects null and string limit values', () => {
      const r = validatePlanLimitsAndFeatures(
        { ...silverRestaurantLimits, orders_per_day: null },
        {},
        'RESTAURANT'
      )
      expect(r.valid).toBe(false)
      expect(r.message).toMatch(/non-negative integer or -1/)
    })

    it('accepts -1 for unlimited operational limits', () => {
      const r = validatePlanLimitsAndFeatures(
        { ...goldRestaurantLimits, orders_per_day: -1, storage_mb: 30720 },
        {},
        'RESTAURANT'
      )
      expect(r.valid).toBe(true)
    })

    it('rejects unlimited storage', () => {
      const r = validatePlanLimitsAndFeatures(
        { ...goldRestaurantLimits, storage_mb: -1 },
        {},
        'RESTAURANT'
      )
      expect(r.valid).toBe(false)
      expect(r.message).toMatch(/storage/)
    })

    it('rejects storage below 1 MB', () => {
      const r = validatePlanLimitsAndFeatures(
        { ...silverRestaurantLimits, storage_mb: 0 },
        {},
        'RESTAURANT'
      )
      expect(r.valid).toBe(false)
    })

    it('rejects users below 1 when numeric', () => {
      const r = validatePlanLimitsAndFeatures(
        { ...silverRestaurantLimits, users: 0 },
        {},
        'RESTAURANT'
      )
      expect(r.valid).toBe(false)
      expect(r.message).toMatch(/users/)
    })

    it('rejects removed approvals_budgets feature key', () => {
      const r = validatePlanLimitsAndFeatures(
        silverRestaurantLimits,
        { approvals_budgets: 'multi_level' },
        'RESTAURANT'
      )
      expect(r.valid).toBe(false)
      expect(r.message).toMatch(/approvals_budgets/)
    })

    it('rejects non-scalar feature values', () => {
      const r = validatePlanLimitsAndFeatures(
        silverRestaurantLimits,
        { reports: { tier: 'basic' } },
        'RESTAURANT'
      )
      expect(r.valid).toBe(false)
      expect(r.message).toMatch(/boolean, string/)
    })

    it('rejects non-object limits payload', () => {
      expect(validatePlanLimitsAndFeatures([], {}, 'RESTAURANT').valid).toBe(false)
      expect(validatePlanLimitsAndFeatures('x', {}, 'RESTAURANT').valid).toBe(false)
    })
  })

  describe('validateFreePlanTrialDays', () => {
    it('allows 3–7 for free plan', () => {
      expect(validateFreePlanTrialDays('free', 7).valid).toBe(true)
      expect(validateFreePlanTrialDays('free', 3).valid).toBe(true)
    })

    it('rejects out of range for free plan', () => {
      expect(validateFreePlanTrialDays('free', 14).valid).toBe(false)
      expect(validateFreePlanTrialDays('free', 1).valid).toBe(false)
    })

    it('ignores trial days for paid plans', () => {
      expect(validateFreePlanTrialDays('gold', 0).valid).toBe(true)
    })
  })

  describe('validateEnterprisePlanActivation', () => {
    it('blocks activating enterprise without confirm flag', () => {
      const r = validateEnterprisePlanActivation('enterprise', true, false)
      expect(r.valid).toBe(false)
    })

    it('allows activate with confirm flag', () => {
      expect(validateEnterprisePlanActivation('enterprise', true, true).valid).toBe(true)
    })
  })

  describe('buildTierLadderWarnings', () => {
    it('warns when silver orders exceed gold', () => {
      const warnings = buildTierLadderWarnings('silver', { orders_per_day: 200 }, [
        { code: 'gold', limits: { orders_per_day: 100 } },
      ])
      expect(warnings.some((w) => w.includes('silver') && w.includes('gold'))).toBe(true)
    })

    it('returns empty for enterprise custom plans', () => {
      expect(buildTierLadderWarnings('enterprise', {}, [{ code: 'gold', limits: {} }])).toEqual([])
    })
  })

  describe('isValidLimitScalar', () => {
    it('accepts integers and -1 only', () => {
      expect(isValidLimitScalar(10)).toBe(true)
      expect(isValidLimitScalar(-1)).toBe(true)
      expect(isValidLimitScalar(null)).toBe(false)
      expect(isValidLimitScalar(1.5)).toBe(false)
    })
  })
})
