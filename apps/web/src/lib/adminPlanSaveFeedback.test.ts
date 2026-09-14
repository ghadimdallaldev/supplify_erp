import { describe, expect, it } from 'vitest'
import {
  formatAdminPlanValidationError,
  normalizeAdminPlanUpdateResult,
} from './adminPlanSaveFeedback'

describe('adminPlanSaveFeedback', () => {
  describe('normalizeAdminPlanUpdateResult', () => {
    it('extracts plan and validationWarnings from PATCH payload', () => {
      const plan = { id: 'p1', code: 'gold', name: 'Gold' } as const
      const result = normalizeAdminPlanUpdateResult({
        plan,
        validationWarnings: ['Tier ladder: silver orders_per_day=20 exceeds gold orders_per_day=5'],
      })
      expect(result.plan).toEqual(plan)
      expect(result.validationWarnings).toHaveLength(1)
    })

    it('returns empty warnings for legacy plan-only response', () => {
      const plan = { id: 'p1', code: 'silver', name: 'Silver' } as const
      const result = normalizeAdminPlanUpdateResult(plan)
      expect(result.validationWarnings).toEqual([])
    })
  })

  describe('formatAdminPlanValidationError', () => {
    it('includes API message and Zod details', () => {
      const text = formatAdminPlanValidationError({
        data: {
          message: 'Invalid plan data',
          details: [{ path: ['limits'], message: 'must be a JSON object' }],
        },
      })
      expect(text).toContain('Invalid plan data')
      expect(text).toContain('limits: must be a JSON object')
    })

    it('surfaces trial_days and enterprise messages', () => {
      const trial = formatAdminPlanValidationError({
        data: { message: 'Free Trial trial_days must be between 3 and 7 (got 30)' },
      })
      expect(trial).toMatch(/3 and 7/)

      const enterprise = formatAdminPlanValidationError({
        data: {
          message:
            'Enterprise plan cannot be activated for self-serve catalog without confirmEnterpriseActivation: true',
        },
      })
      expect(enterprise).toMatch(/confirmEnterpriseActivation/)
    })
  })
})
