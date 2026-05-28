import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQuery = vi.fn()
const mockCharge = vi.fn()

vi.mock('../db.js', () => ({
  query: (...args) => mockQuery(...args),
  withTransaction: async (fn) => fn({ query: (...args) => mockQuery(...args) }),
}))

vi.mock('../platform-settings.js', () => ({
  getFreeSandboxDays: vi.fn().mockResolvedValue(7),
  clampFreeTrialDays: (d, f) => d ?? f,
}))

vi.mock('../logger.js', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

vi.mock('./gateway-registry.js', () => ({
  getBillingGateway: () => ({
    id: 'stub',
    charge: (...args) => mockCharge(...args),
  }),
}))

describe('checkoutSubscription paid plan (stub gateway)', () => {
  beforeEach(() => {
    mockQuery.mockReset()
    mockCharge.mockReset()
    mockCharge.mockResolvedValue({
      status: 'succeeded',
      providerPaymentId: 'pi_stub_paid_test',
    })
  })

  it('charges via stub and clears pending_activation on paid checkout', async () => {
    const { checkoutSubscription } = await import('./billing-service.js')

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
      id: 'sub-pending',
      tenant_id: 'rest-1',
      tenant_type: 'RESTAURANT',
      plan_id: 'plan-free',
      lock_reason: 'pending_activation',
      account_locked_at: new Date().toISOString(),
      status: 'ACTIVE',
    }
    const invoiceRow = {
      id: 'inv-1',
      amount: 49,
      currency: 'USD',
      subscription_id: subRow.id,
    }
    const paymentMethod = {
      id: 'pm-1',
      provider: 'stub',
      provider_payment_method_id: 'pm_stub_ok',
      status: 'ACTIVE',
    }

    mockQuery.mockImplementation(async (sql) => {
      const text = typeof sql === 'string' ? sql : ''
      if (text.includes('FROM subscription_plan WHERE id')) {
        return { rows: [silverPlan] }
      }
      if (text.includes('FROM subscription s') && text.includes('NOT IN')) {
        return { rows: [subRow] }
      }
      if (text.includes('INSERT INTO billing_invoice')) {
        return { rows: [invoiceRow] }
      }
      if (text.includes('FROM billing_payment_method')) {
        return { rows: [paymentMethod] }
      }
      if (text.includes('FROM billing_payment WHERE idempotency_key')) {
        return { rows: [] }
      }
      if (text.includes('INSERT INTO billing_payment')) {
        return { rows: [{ id: 'pay-1', status: 'PROCESSING' }] }
      }
      if (text.includes("UPDATE billing_payment SET status = 'SUCCEEDED'")) {
        return { rows: [] }
      }
      if (text.includes("UPDATE billing_invoice SET status = 'PAID'")) {
        return { rows: [] }
      }
      if (text.includes('UPDATE subscription SET') && text.includes('last_payment_at')) {
        return { rows: [] }
      }
      if (text.includes('INSERT INTO billing_event')) {
        return { rows: [] }
      }
      if (
        text.includes('applyPaidSubscription') ||
        (text.includes('plan_id = $1') && text.includes('next_billing_date'))
      ) {
        return {
          rows: [{ ...subRow, lock_reason: null, account_locked_at: null, plan_code: 'silver' }],
        }
      }
      if (text.includes('UPDATE subscription SET') && text.includes('plan_id = $1')) {
        return { rows: [{ ...subRow, lock_reason: null, account_locked_at: null }] }
      }
      return { rows: [] }
    })

    const result = await checkoutSubscription({
      tenantId: 'rest-1',
      tenantType: 'RESTAURANT',
      planId: 'plan-silver',
      billingCycle: 'MONTHLY',
      idempotencyKey: 'paid-checkout-test-key',
      provider: 'stub',
    })

    expect(result?.success).toBe(true)
    expect(mockCharge).toHaveBeenCalled()
    const unlockCall = mockQuery.mock.calls.find(
      (call) =>
        typeof call[0] === 'string' &&
        call[0].includes('UPDATE subscription SET') &&
        call[0].includes('lock_reason = NULL')
    )
    expect(unlockCall).toBeTruthy()
  })
})
