import { describe, expect, it } from 'vitest'
import {
  canEnterAppShell,
  shouldLoadBillingStatus,
  shouldRedirectToActivate,
} from './billingActivationRedirect'

describe('billingActivationRedirect', () => {
  it('platform admin not impersonating does not load tenant billing', () => {
    expect(shouldLoadBillingStatus(true, false)).toBe(false)
    expect(
      shouldRedirectToActivate({
        isPlatformAdmin: true,
        isImpersonating: false,
        pathname: '/app/dashboard',
        access: { pendingActivation: true, isLocked: true },
      })
    ).toBe(false)
  })

  it('pending activation redirects to activate from app routes', () => {
    expect(
      shouldRedirectToActivate({
        isPlatformAdmin: false,
        isImpersonating: false,
        pathname: '/app/dashboard',
        access: { pendingActivation: true, isLocked: true },
      })
    ).toBe(true)
    expect(
      shouldRedirectToActivate({
        isPlatformAdmin: false,
        isImpersonating: false,
        pathname: '/app/activate',
        access: { pendingActivation: true, isLocked: true },
      })
    ).toBe(false)
  })

  it('activated tenant can enter app shell', () => {
    expect(canEnterAppShell({ pendingActivation: false, isLocked: false })).toBe(true)
    expect(canEnterAppShell({ isLocked: false })).toBe(true)
    expect(canEnterAppShell({ pendingActivation: true, isLocked: true })).toBe(false)
  })

  it('impersonating admin loads billing and may redirect', () => {
    expect(shouldLoadBillingStatus(true, true)).toBe(true)
    expect(
      shouldRedirectToActivate({
        isPlatformAdmin: true,
        isImpersonating: true,
        pathname: '/app/orders',
        access: { pendingActivation: true, isLocked: true },
      })
    ).toBe(true)
  })
})
