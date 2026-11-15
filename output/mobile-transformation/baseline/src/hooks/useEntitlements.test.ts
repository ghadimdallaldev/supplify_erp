import { isEntitlementEnabled } from './useEntitlements'

describe('isEntitlementEnabled', () => {
  it('accepts boolean and tier-string capabilities', () => {
    expect(isEntitlementEnabled(true)).toBe(true)
    expect(isEntitlementEnabled('full_schedule')).toBe(true)
  })

  it('fails closed for missing and non-enabled values', () => {
    expect(isEntitlementEnabled(false)).toBe(false)
    expect(isEntitlementEnabled(null)).toBe(false)
    expect(isEntitlementEnabled(undefined)).toBe(false)
    expect(isEntitlementEnabled('')).toBe(false)
    expect(isEntitlementEnabled(0)).toBe(false)
  })

  it('matches the API evaluatePlanFeatureValue string rules', () => {
    // Non-empty but explicitly-off strings must not read as enabled.
    expect(isEntitlementEnabled('false')).toBe(false)
    expect(isEntitlementEnabled('disabled')).toBe(false)
    expect(isEntitlementEnabled('basic')).toBe(true)
    expect(isEntitlementEnabled('scale')).toBe(true)
  })
})
