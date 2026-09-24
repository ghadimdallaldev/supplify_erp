import { describe, expect, it } from 'vitest'
import { SPONSORSHIP_PLAN_LABELS } from './growthSponsorshipPlans'

describe('growth sponsorship plan labels', () => {
  it('uses the current Restaurant paid-plan ladder', () => {
    expect(SPONSORSHIP_PLAN_LABELS.silver).toBe('Restaurant Growth')
    expect(SPONSORSHIP_PLAN_LABELS.gold).toBe('Restaurant Intelligence')
    expect(SPONSORSHIP_PLAN_LABELS.platinum).toBe('Restaurant Scale')
  })
})
