import { describe, expect, it } from 'vitest'
import { getUpgradeModalPlanAction, getVisibleUpgradePlans } from './UpgradeModal'

describe('UpgradeModal plan helpers', () => {
  it('hides internal trial and enterprise rows from comparison plans', () => {
    const plans = getVisibleUpgradePlans([
      { id: 'free-id', code: 'free', name: 'Internal Free Trial' },
      { id: 'enterprise-id', code: 'enterprise', name: 'Enterprise' },
      { id: 'scale-id', code: 'gold', name: 'Restaurant Scale' },
      { id: 'growth-id', code: 'silver', name: 'Restaurant Growth' },
    ])

    expect(plans.map((plan) => plan.id)).toEqual(['growth-id', 'scale-id'])
  })

  it('starts a selected paid-plan trial during pending activation', () => {
    const targetPlan = { id: 'target-id', code: 'gold', name: 'Restaurant Scale' }

    expect(getUpgradeModalPlanAction(targetPlan, true)).toEqual({
      kind: 'trial',
      trialTargetPlanId: 'target-id',
    })
  })

  it('uses normal checkout outside pending activation', () => {
    const targetPlan = { id: 'target-id', code: 'gold', name: 'Restaurant Scale' }

    expect(getUpgradeModalPlanAction(targetPlan, false)).toEqual({
      kind: 'checkout',
      plan: targetPlan,
    })
  })
})
