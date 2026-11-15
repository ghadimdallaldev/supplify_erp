import { unwrapEntitlements, type MobileEntitlements } from './auth'

describe('unwrapEntitlements', () => {
  it('unwraps the API entitlements envelope', () => {
    const entitlements: MobileEntitlements = {
      tenantId: 'tenant-1',
      tenantType: 'RESTAURANT',
      plan: { id: 'plan-1', name: 'Restaurant Gold', code: 'gold' },
      features: { chat: true, quick_lists: 'full_schedule', reports: false },
    }

    expect(unwrapEntitlements({ entitlements })).toEqual(entitlements)
  })

  it('preserves a missing tenant entitlement payload as null', () => {
    expect(unwrapEntitlements({ entitlements: null })).toBeNull()
  })
})
