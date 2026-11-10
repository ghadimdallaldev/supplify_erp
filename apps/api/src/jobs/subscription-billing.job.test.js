import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQuery = vi.fn()
const mockWithTransaction = vi.fn()
const mockGetBillingGateway = vi.fn()
const mockGetActiveTenantAddons = vi.fn()
const mockInvalidateTenantSubscriptionCache = vi.fn()
const mockChargeOffSession = vi.fn()

vi.mock('../lib/db.js', () => ({
  query: (...args) => mockQuery(...args),
  withTransaction: (fn) => mockWithTransaction(fn),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('../lib/billing/billing-service.js', () => ({
  getSubscriptionForBilling: vi
    .fn()
    .mockResolvedValue({ status: 'PAST_DUE', past_due_since: new Date() }),
  markSubscriptionPastDue: vi.fn(),
  lockSubscriptionAccount: vi.fn(),
  calculateRecurringSubscriptionTotal: (plan, billingCycle = 'MONTHLY', addons = []) => {
    const baseAmount =
      billingCycle === 'YEARLY' ? Number(plan.price_per_year) : Number(plan.price_per_month)
    const addonAmount = addons.reduce((sum, addon) => {
      const qty = Number(addon.quantity || 0)
      const monthly = Number(addon.unit_price_monthly || 0)
      return sum + qty * (billingCycle === 'YEARLY' ? monthly * 10 : monthly)
    }, 0)
    return { baseAmount, addonAmount, totalAmount: baseAmount + addonAmount }
  },
}))

vi.mock('../lib/billing/gateway-registry.js', () => ({
  getBillingGateway: (...args) => mockGetBillingGateway(...args),
}))

vi.mock('../lib/subscription-addons.js', () => ({
  getActiveTenantAddons: (...args) => mockGetActiveTenantAddons(...args),
}))

vi.mock('../lib/subscription.js', () => ({
  invalidateTenantSubscriptionCache: (...args) => mockInvalidateTenantSubscriptionCache(...args),
}))

vi.mock('../services/notification.service.js', () => ({
  notifyBillingRenewed: vi.fn().mockResolvedValue(undefined),
  notifyBillingPaymentFailed: vi.fn().mockResolvedValue(undefined),
  notifyBillingAccountLocked: vi.fn().mockResolvedValue(undefined),
}))

function dueSubscription(overrides = {}) {
  return {
    id: 'sub-1',
    tenant_id: 'tenant-1',
    tenant_type: 'RESTAURANT',
    plan_id: 'plan-1',
    plan_name: 'Restaurant Scale',
    plan_code: 'gold',
    price_per_month: 149,
    price_per_year: 1490,
    billing_cycle: 'MONTHLY',
    auto_renew: true,
    next_billing_date: '2026-07-16T00:00:00.000Z',
    status: 'ACTIVE',
    ...overrides,
  }
}

describe('runSubscriptionBillingJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQuery.mockResolvedValue({ rows: [] })
    mockGetActiveTenantAddons.mockResolvedValue([])
    mockInvalidateTenantSubscriptionCache.mockResolvedValue(undefined)
    mockChargeOffSession.mockResolvedValue({ status: 'succeeded', providerPaymentId: 'pi-1' })
    mockGetBillingGateway.mockReturnValue({
      id: 'stub',
      chargeOffSession: mockChargeOffSession,
    })
    mockWithTransaction.mockImplementation(async (fn) => {
      const client = { query: mockQuery }
      return fn(client)
    })
  })

  it('returns zero counts when no subscriptions are due', async () => {
    const { runSubscriptionBillingJob } = await import('./subscription-billing.job.js')
    const result = await runSubscriptionBillingJob()
    expect(result).toEqual({ renewed: 0, locked: 0, pastDue: 0 })
  })

  it('skips gracefully when billing tables are not migrated', async () => {
    const err = new Error('missing relation')
    err.code = '42P01'
    mockQuery.mockRejectedValueOnce(err)

    const { runSubscriptionBillingJob } = await import('./subscription-billing.job.js')
    const result = await runSubscriptionBillingJob()
    expect(result.skipped).toBe(true)
  })

  it('renews using base plan and active recurring add-ons', async () => {
    mockGetActiveTenantAddons.mockResolvedValueOnce([
      {
        addon_key: 'restaurant_extra_branch',
        quantity: 2,
        unit_price_monthly: 39,
      },
    ])
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'sub-1' }] })
      .mockResolvedValueOnce({ rows: [dueSubscription()] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'pm-1',
            provider: 'stub',
            provider_payment_method_id: 'pm_stub_ok',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'pay-claim' }] })
      .mockResolvedValueOnce({ rows: [dueSubscription()] })
      .mockResolvedValueOnce({ rows: [{ id: 'inv-1' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rows: [] })

    const { runSubscriptionBillingJob } = await import('./subscription-billing.job.js')
    const result = await runSubscriptionBillingJob()

    expect(result).toEqual({ renewed: 1, locked: 0, pastDue: 0 })
    expect(mockChargeOffSession).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 227,
        currency: 'USD',
        providerPaymentMethodId: 'pm_stub_ok',
        idempotencyKey: 'renew_sub-1_2026-07-16T00:00:00.000Z',
      })
    )

    const invoiceParams = mockQuery.mock.calls[6][1]
    expect(invoiceParams[4]).toBe(227)
    expect(JSON.parse(invoiceParams[10])).toMatchObject({
      baseAmount: 149,
      addonAmount: 78,
      addons: [
        {
          key: 'restaurant_extra_branch',
          quantity: 2,
          unitPriceMonthly: 39,
        },
      ],
      renewal: true,
    })
  })

  it('skips without charging when another worker already claimed the renewal key', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'sub-1' }] })
      .mockResolvedValueOnce({ rows: [dueSubscription()] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'pm-1',
            provider: 'stub',
            provider_payment_method_id: 'pm_stub_ok',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })

    const { runSubscriptionBillingJob } = await import('./subscription-billing.job.js')
    const result = await runSubscriptionBillingJob()

    expect(result).toEqual({ renewed: 0, locked: 0, pastDue: 0 })
    expect(mockChargeOffSession).not.toHaveBeenCalled()
  })

  it('does not charge the gateway twice when a renewal payment already exists', async () => {
    const existingPeriodStart = '2026-07-16T00:00:00.000Z'
    const existingPeriodEnd = '2026-08-15T00:00:00.000Z'
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'sub-1' }] })
      .mockResolvedValueOnce({ rows: [dueSubscription()] })
      .mockResolvedValueOnce({
        rows: [
          {
            payment_id: 'pay-1',
            provider_payment_id: 'pi-existing',
            period_start: existingPeriodStart,
            period_end: existingPeriodEnd,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [dueSubscription()] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rows: [] })

    const { runSubscriptionBillingJob } = await import('./subscription-billing.job.js')
    const result = await runSubscriptionBillingJob()

    expect(result).toEqual({ renewed: 1, locked: 0, pastDue: 0 })
    expect(mockGetBillingGateway).not.toHaveBeenCalled()
    expect(mockQuery.mock.calls[4][0]).toContain('UPDATE subscription SET')
    expect(mockQuery.mock.calls[4][1]).toEqual([
      'sub-1',
      existingPeriodStart,
      existingPeriodEnd,
      '2026-07-16T00:00:00.000Z',
    ])
    expect(mockInvalidateTenantSubscriptionCache).toHaveBeenCalledWith('tenant-1', 'RESTAURANT')
  })
})

describe('runSubscriptionBillingJob retry and stuck-payment handling', () => {
  const pm = {
    id: 'pm-1',
    provider: 'stub',
    provider_payment_method_id: 'pm_stub_ok',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockQuery.mockReset()
    mockQuery.mockResolvedValue({ rows: [] })
    mockGetActiveTenantAddons.mockResolvedValue([])
    mockInvalidateTenantSubscriptionCache.mockResolvedValue(undefined)
    mockChargeOffSession.mockResolvedValue({ status: 'succeeded', providerPaymentId: 'pi-2' })
    mockGetBillingGateway.mockReturnValue({ id: 'stub', chargeOffSession: mockChargeOffSession })
    mockWithTransaction.mockImplementation(async (fn) => fn({ query: mockQuery }))
  })

  it('re-claims a FAILED renewal payment on a later run and charges with a per-attempt key', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'sub-1' }] })
      .mockResolvedValueOnce({ rows: [dueSubscription()] })
      .mockResolvedValueOnce({ rows: [] }) // no SUCCEEDED payment
      .mockResolvedValueOnce({ rows: [pm] })
      .mockResolvedValueOnce({ rows: [{ id: 'pay-claim', attempt: 2 }] }) // retry claim
      .mockResolvedValueOnce({ rows: [dueSubscription()] })
      .mockResolvedValueOnce({ rows: [{ id: 'inv-1' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rows: [] })

    const { runSubscriptionBillingJob } = await import('./subscription-billing.job.js')
    const result = await runSubscriptionBillingJob()

    expect(result).toEqual({ renewed: 1, locked: 0, pastDue: 0 })
    const claimSql = String(mockQuery.mock.calls[4][0])
    expect(claimSql).toContain('ON CONFLICT (idempotency_key) DO UPDATE')
    expect(claimSql).toContain("billing_payment.status = 'FAILED'")
    // retry cadence and attempt cap are passed as parameters
    expect(mockQuery.mock.calls[4][1].slice(8)).toEqual([24, 7])
    expect(mockChargeOffSession).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'renew_sub-1_2026-07-16T00:00:00.000Z_a2' })
    )
  })

  it('does not charge when the existing FAILED payment is not yet due for retry', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'sub-1' }] })
      .mockResolvedValueOnce({ rows: [dueSubscription()] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [pm] })
      .mockResolvedValueOnce({ rows: [] }) // claim refused by WHERE clause
      .mockResolvedValueOnce({
        rows: [{ id: 'pay-1', status: 'FAILED', age_minutes: 60, attempt: 1 }],
      })

    const { runSubscriptionBillingJob } = await import('./subscription-billing.job.js')
    const result = await runSubscriptionBillingJob()

    expect(result).toEqual({ renewed: 0, locked: 0, pastDue: 0 })
    expect(mockChargeOffSession).not.toHaveBeenCalled()
  })

  it('does not re-claim a fresh PROCESSING payment and does not alert', async () => {
    const { logger } = await import('../lib/logger.js')
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'sub-1' }] })
      .mockResolvedValueOnce({ rows: [dueSubscription()] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [pm] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: 'pay-1', status: 'PROCESSING', age_minutes: 2, attempt: 1 }],
      })

    const { runSubscriptionBillingJob } = await import('./subscription-billing.job.js')
    await runSubscriptionBillingJob()

    expect(mockChargeOffSession).not.toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('never re-charges a stale PROCESSING payment but logs an error for manual reconciliation', async () => {
    const { logger } = await import('../lib/logger.js')
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'sub-1' }] })
      .mockResolvedValueOnce({ rows: [dueSubscription()] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [pm] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: 'pay-1', status: 'PROCESSING', age_minutes: 90, attempt: 1 }],
      })

    const { runSubscriptionBillingJob } = await import('./subscription-billing.job.js')
    await runSubscriptionBillingJob()

    expect(mockChargeOffSession).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('PROCESSING'),
      expect.objectContaining({ subscriptionId: 'sub-1', paymentId: 'pay-1' })
    )
  })

  it('does not re-charge a renewal that already SUCCEEDED', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'sub-1' }] })
      .mockResolvedValueOnce({ rows: [dueSubscription()] })
      .mockResolvedValueOnce({
        rows: [
          {
            payment_id: 'pay-1',
            provider_payment_id: 'pi-1',
            period_start: null,
            period_end: null,
          },
        ],
      })

    const { runSubscriptionBillingJob } = await import('./subscription-billing.job.js')
    await runSubscriptionBillingJob()

    expect(mockChargeOffSession).not.toHaveBeenCalled()
  })
})
