import { describe, expect, it, vi, beforeEach } from 'vitest'

const initiate = vi.fn()
const unwrap = vi.fn().mockResolvedValue(undefined)

vi.mock('../services/api', () => ({
  api: {
    endpoints: {
      getMe: {
        initiate: (...args: unknown[]) => {
          initiate('getMe', ...args)
          return { unwrap }
        },
      },
      getRegisterStatus: {
        initiate: (...args: unknown[]) => {
          initiate('getRegisterStatus', ...args)
          return { unwrap }
        },
      },
      getBillingStatus: {
        initiate: (...args: unknown[]) => {
          initiate('getBillingStatus', ...args)
          return { unwrap }
        },
      },
      getEntitlements: {
        initiate: (...args: unknown[]) => {
          initiate('getEntitlements', ...args)
          return { unwrap }
        },
      },
    },
  },
}))

import {
  canLeaveActivationPage,
  hasStaleRegistrationState,
  isBillingPendingActivation,
  refetchAppSession,
  shouldRefetchTenantBilling,
} from './refetchAppSession'

describe('refetchAppSession helpers', () => {
  it('detects stale registration when role is PENDING but setup is complete', () => {
    expect(hasStaleRegistrationState({ role: 'PENDING', needsSetup: false })).toBe(true)
    expect(hasStaleRegistrationState({ role: 'PENDING', needsSetup: true })).toBe(false)
    expect(hasStaleRegistrationState({ role: 'RESTAURANT', needsSetup: false })).toBe(false)
  })

  it('detects pending billing activation', () => {
    expect(isBillingPendingActivation({ pendingActivation: true, isLocked: true })).toBe(true)
    expect(isBillingPendingActivation({ pendingActivation: false, isLocked: false })).toBe(false)
    expect(canLeaveActivationPage({ pendingActivation: false, isLocked: false })).toBe(true)
  })
})

describe('refetchAppSession', () => {
  beforeEach(() => {
    initiate.mockClear()
    unwrap.mockClear()
    unwrap.mockResolvedValue(undefined)
  })

  it('force-refetches auth shell endpoints for tenant users', async () => {
    unwrap.mockResolvedValueOnce({ role: 'RESTAURANT' })
    const dispatch = vi.fn((action) => action)

    await refetchAppSession(dispatch as never)

    expect(initiate).toHaveBeenCalledTimes(4)
    expect(initiate).toHaveBeenCalledWith('getMe', undefined, { forceRefetch: true })
    expect(initiate).toHaveBeenCalledWith('getRegisterStatus', undefined, { forceRefetch: true })
    expect(initiate).toHaveBeenCalledWith('getBillingStatus', undefined, { forceRefetch: true })
    expect(initiate).toHaveBeenCalledWith('getEntitlements', undefined, { forceRefetch: true })
  })

  it('skips tenant billing and entitlements for platform admin', async () => {
    unwrap.mockResolvedValueOnce({ role: 'ADMIN' })
    const dispatch = vi.fn((action) => action)

    await refetchAppSession(dispatch as never)

    expect(initiate).toHaveBeenCalledTimes(2)
    expect(initiate).toHaveBeenCalledWith('getMe', undefined, { forceRefetch: true })
    expect(initiate).toHaveBeenCalledWith('getRegisterStatus', undefined, { forceRefetch: true })
    expect(initiate).not.toHaveBeenCalledWith('getBillingStatus', undefined, { forceRefetch: true })
  })
})

describe('shouldRefetchTenantBilling', () => {
  it('returns true only for restaurant and supplier roles', () => {
    expect(shouldRefetchTenantBilling('RESTAURANT')).toBe(true)
    expect(shouldRefetchTenantBilling('SUPPLIER')).toBe(true)
    expect(shouldRefetchTenantBilling('ADMIN')).toBe(false)
    expect(shouldRefetchTenantBilling('STAFF_PORTAL')).toBe(false)
  })
})
