import { beforeEach, describe, expect, it, vi } from 'vitest'
import { manualGateway } from './providers/manual.js'

const mockQuery = vi.fn()

vi.mock('../db.js', () => ({
  query: (...args) => mockQuery(...args),
  withTransaction: async (fn) => fn({ query: (...args) => mockQuery(...args) }),
}))

vi.mock('../platform-settings.js', () => ({
  getFreeSandboxDays: vi.fn().mockResolvedValue(7),
  clampFreeTrialDays: (d, f) => d ?? f,
  getReferralProgramConfig: vi.fn().mockResolvedValue({
    firstPaidDiscountPercent: 20,
    referralDiscountAppliesTo: 'first_restaurant_funded',
  }),
}))

vi.mock('../logger.js', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

const mockGetBillingGateway = vi.fn()
vi.mock('./gateway-registry.js', () => ({
  getBillingGateway: (...args) => mockGetBillingGateway(...args),
}))

const silverPlan = {
  id: 'plan-silver',
  code: 'silver',
  name: 'Silver',
  tenant_type: 'RESTAURANT',
  is_active: true,
  price_per_month: 49,
  price_per_year: 490,
}
const subRow = {
  id: 'sub-1',
  tenant_id: 'rest-1',
  tenant_type: 'RESTAURANT',
  plan_id: 'plan-free',
  status: 'ACTIVE',
}

function installQueryMock({ methodProvider }) {
  mockQuery.mockImplementation(async (sql) => {
    const text = typeof sql === 'string' ? sql : ''
    if (text.includes('FROM subscription_plan WHERE id')) return { rows: [silverPlan] }
    if (text.includes('FROM subscription s') && text.includes('NOT IN')) return { rows: [subRow] }
    if (text.includes('INSERT INTO billing_invoice')) {
      return { rows: [{ id: 'inv-1', amount: 49, currency: 'USD', subscription_id: subRow.id }] }
    }
    if (text.includes('FROM billing_payment_method')) {
      return {
        rows: [
          {
            id: 'pm-1',
            provider: methodProvider,
            provider_payment_method_id: 'pm_manual_x',
            status: 'ACTIVE',
          },
        ],
      }
    }
    if (text.includes('INSERT INTO billing_payment')) {
      return { rows: [{ id: 'pay-1', status: 'PROCESSING' }] }
    }
    return { rows: [] }
  })
}

describe('checkoutSubscription with the manual gateway', () => {
  beforeEach(() => {
    mockQuery.mockReset()
    mockGetBillingGateway.mockReset()
    mockGetBillingGateway.mockReturnValue(manualGateway)
  })

  it('does not activate a paid plan from a stored manual method when manual is not the configured gateway', async () => {
    installQueryMock({ methodProvider: 'manual' })
    const { checkoutSubscription } = await import('./billing-service.js')

    await expect(
      checkoutSubscription({
        tenantId: 'rest-1',
        tenantType: 'RESTAURANT',
        planId: 'plan-silver',
        billingCycle: 'MONTHLY',
        idempotencyKey: 'manual-checkout-test-key',
        // legacy client-supplied value must be ignored
        provider: 'manual',
      })
    ).rejects.toMatchObject({ name: 'PAYMENT_FAILED' })

    const sqls = mockQuery.mock.calls.map((c) => String(c[0]))
    expect(sqls.some((s) => s.includes("UPDATE billing_invoice SET status = 'PAID'"))).toBe(false)
    expect(sqls.some((s) => s.includes("SET status = 'SUCCEEDED'"))).toBe(false)
    expect(sqls.some((s) => s.includes('plan_id = $1'))).toBe(false)
  })

  it('ignores a client-supplied provider and uses the stored method provider', async () => {
    installQueryMock({ methodProvider: 'stripe' })
    mockGetBillingGateway.mockReturnValue({
      id: 'stripe',
      charge: async () => ({ status: 'failed', failureCode: 'x' }),
    })
    const { checkoutSubscription } = await import('./billing-service.js')
    await expect(
      checkoutSubscription({
        tenantId: 'rest-1',
        tenantType: 'RESTAURANT',
        planId: 'plan-silver',
        billingCycle: 'MONTHLY',
        idempotencyKey: 'manual-checkout-test-key-2',
        provider: 'manual',
      })
    ).rejects.toMatchObject({ name: 'PAYMENT_FAILED' })
    expect(mockGetBillingGateway).toHaveBeenCalledWith('stripe')
  })
})

describe('addPaymentMethod', () => {
  it('resolves the gateway server-side, ignoring a client provider', async () => {
    mockGetBillingGateway.mockReset()
    mockQuery.mockReset()
    mockQuery.mockResolvedValue({ rows: [{ id: 'pm-new' }] })
    mockGetBillingGateway.mockReturnValue({
      id: 'stub',
      tokenizePaymentMethod: async () => ({ providerPaymentMethodId: 'pm_stub', type: 'CARD' }),
    })
    const { addPaymentMethod } = await import('./billing-service.js')
    await addPaymentMethod('rest-1', 'RESTAURANT', {
      type: 'CARD',
      card: {},
      provider: 'manual',
      setAsDefault: false,
    })
    expect(mockGetBillingGateway).toHaveBeenCalledWith()
  })
})
