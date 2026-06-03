import { describe, expect, it } from 'vitest'
import type { Entitlements } from '../types'
import { getPlanTierDisabledFeatures } from './externallyControlledFeatures'

function entitlements(partial: Partial<Entitlements>): Entitlements {
  return {
    tenantType: 'RESTAURANT',
    tenantId: 'tenant-1',
    plan: { name: 'Gold', code: 'gold' },
    limits: {},
    usage: {},
    features: {},
    ...partial,
  } as Entitlements
}

describe('getPlanTierDisabledFeatures', () => {
  it('Gold tenant with quick_lists full_schedule does not list Quick Lists', () => {
    const e = entitlements({
      plan: { name: 'Gold', code: 'gold' },
      features: { quick_lists: false },
      planFeatures: { quick_lists: 'full_schedule' },
      featureSources: { quick_lists: 'plan' },
    })
    const disabled = getPlanTierDisabledFeatures(e)
    expect(disabled.map((x) => x.key)).not.toContain('quick_lists')
  })

  it('Silver tenant with quick_lists automated_weekly does not list Quick Lists', () => {
    const e = entitlements({
      plan: { name: 'Silver', code: 'silver' },
      features: { quick_lists: false },
      planFeatures: { quick_lists: 'automated_weekly' },
      featureSources: { quick_lists: 'plan' },
    })
    expect(getPlanTierDisabledFeatures(e).map((x) => x.key)).not.toContain('quick_lists')
  })

  it('tenant with quick_lists false on plan lists Quick Lists', () => {
    const e = entitlements({
      plan: { name: 'Free', code: 'free' },
      features: { quick_lists: false },
      planFeatures: { quick_lists: false },
      featureSources: { quick_lists: 'plan' },
    })
    const disabled = getPlanTierDisabledFeatures(e)
    expect(disabled.map((x) => x.key)).toContain('quick_lists')
    expect(disabled.find((x) => x.key === 'quick_lists')?.label).toBe('Quick Lists')
  })

  it('string tier values count as enabled (not plan-tier disabled)', () => {
    const e = entitlements({
      features: { reports: false },
      planFeatures: { reports: 'advanced_analytics' },
      featureSources: { reports: 'plan' },
    })
    expect(getPlanTierDisabledFeatures(e).map((x) => x.key)).not.toContain('reports')
  })

  it('branch tenant under Gold parent does not list Quick Lists when plan has full_schedule', () => {
    const e = entitlements({
      tenantId: 'branch-child-1',
      billingTenantId: 'org-parent-1',
      usesOrgBilling: true,
      plan: { name: 'Gold', code: 'gold' },
      features: { quick_lists: false },
      planFeatures: { quick_lists: 'full_schedule' },
      featureSources: { quick_lists: 'plan' },
    })
    expect(getPlanTierDisabledFeatures(e).map((x) => x.key)).not.toContain('quick_lists')
  })

  it('Free Trial with quick_lists full_schedule does not list Quick Lists', () => {
    const e = entitlements({
      plan: { name: 'Free Trial', code: 'free_trial' },
      features: { quick_lists: false },
      planFeatures: { quick_lists: 'full_schedule' },
      featureSources: { quick_lists: 'plan' },
    })
    expect(getPlanTierDisabledFeatures(e).map((x) => x.key)).not.toContain('quick_lists')
  })

  it('treats quick_lists string "false" and "disabled" as plan-tier disabled', () => {
    for (const value of ['false', 'disabled'] as const) {
      const e = entitlements({
        features: { quick_lists: false },
        planFeatures: { quick_lists: value },
        featureSources: { quick_lists: 'plan' },
      })
      expect(getPlanTierDisabledFeatures(e).map((x) => x.key)).toContain('quick_lists')
    }
  })

  it('supplier Gold does not list quick_lists when not on supplier plan JSON', () => {
    const e = entitlements({
      tenantType: 'SUPPLIER',
      plan: { name: 'Gold', code: 'gold' },
      features: { quick_lists: false },
      planFeatures: { fulfillment: true, driver_management: true },
      featureSources: { quick_lists: 'default', fulfillment: 'plan' },
    })
    expect(getPlanTierDisabledFeatures(e).map((x) => x.key)).not.toContain('quick_lists')
  })

  it('Gold with quick_lists full_schedule in features does not list Quick Lists', () => {
    const e = entitlements({
      plan: { name: 'Gold', code: 'gold' },
      features: { quick_lists: 'full_schedule' },
      planFeatures: { quick_lists: 'full_schedule' },
      featureSources: { quick_lists: 'plan' },
    })
    expect(getPlanTierDisabledFeatures(e).map((x) => x.key)).not.toContain('quick_lists')
  })

  it('does not list features disabled by tenant override (plan tier only)', () => {
    const e = entitlements({
      features: { quick_lists: false },
      planFeatures: { quick_lists: 'full_schedule' },
      featureSources: { quick_lists: 'tenant_override' },
    })
    expect(getPlanTierDisabledFeatures(e).map((x) => x.key)).not.toContain('quick_lists')
  })
})
