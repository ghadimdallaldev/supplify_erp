import { describe, expect, it } from 'vitest'
import { isBillingRecoveryPath, normalizeRequestPath } from './billing-recovery-paths.js'

describe('billing recovery paths', () => {
  it('normalizes originalUrl query strings', () => {
    expect(normalizeRequestPath({ originalUrl: '/api/billing/status?x=1' })).toBe(
      '/api/billing/status'
    )
    expect(normalizeRequestPath('/api/subscriptions/entitlements?foo=bar')).toBe(
      '/api/subscriptions/entitlements'
    )
  })

  it('allows billing and register prefixes for any method', () => {
    expect(isBillingRecoveryPath('POST', '/api/billing/checkout')).toBe(true)
    expect(isBillingRecoveryPath('GET', '/api/billing/status')).toBe(true)
    expect(isBillingRecoveryPath('POST', '/api/register/complete')).toBe(true)
  })

  it('allows subscription recovery GETs', () => {
    expect(isBillingRecoveryPath('GET', '/api/subscriptions/entitlements')).toBe(true)
    expect(isBillingRecoveryPath('GET', '/api/subscriptions/current')).toBe(true)
    expect(isBillingRecoveryPath('GET', '/api/subscriptions/plans')).toBe(true)
    expect(isBillingRecoveryPath('HEAD', '/api/subscriptions/entitlements')).toBe(true)
  })

  it('blocks non-recovery APIs', () => {
    expect(isBillingRecoveryPath('GET', '/api/branches')).toBe(false)
    expect(isBillingRecoveryPath('GET', '/api/supplier/command-center')).toBe(false)
    expect(isBillingRecoveryPath('POST', '/api/subscriptions/entitlements')).toBe(false)
    expect(isBillingRecoveryPath('GET', '/api/subscriptions/usage')).toBe(false)
  })

  it('resolves path from request objects used by router middleware', () => {
    expect(
      isBillingRecoveryPath('GET', {
        originalUrl: '/api/subscriptions/entitlements',
        path: '/entitlements',
        baseUrl: '/api/subscriptions',
      })
    ).toBe(true)
  })
})
