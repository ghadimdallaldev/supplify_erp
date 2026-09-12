import { describe, expect, it, vi, beforeEach } from 'vitest'
import { SponsorshipError, resolveHttpError } from '../middlewares/errorHandler.js'
import {
  clampFreeTrialDays,
  FREE_TRIAL_MAX_DAYS,
  FREE_TRIAL_MIN_DAYS,
} from '../lib/platform-settings.js'

vi.mock('../lib/db.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(async (fn) => {
    const client = { query: vi.fn() }
    return fn(client)
  }),
}))

vi.mock('../lib/platform-settings.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getReferralProgramConfig: vi.fn(async () => ({
      firstPaidDiscountPercent: 20,
      supplierRewardType: 'free_month',
      referralValidityDays: 90,
      sponsorshipLimitsPerYear: { gold: 10, platinum: 25, enterprise: null },
      eligibleSponsorPlans: ['silver', 'gold', 'platinum'],
      sponsorshipEnabled: true,
      offerExpiryDays: 14,
      referralDiscountAppliesTo: 'first_restaurant_funded',
      supportedBillingIntervals: ['MONTHLY'],
      maxSponsoredAmount: null,
    })),
  }
})

vi.mock('../lib/billing/billing-service.js', () => ({
  getSubscriptionForBilling: vi.fn(async () => ({
    id: 'sub-1',
    plan_code: 'gold',
    status: 'ACTIVE',
  })),
}))

vi.mock('../lib/subscription.js', () => ({
  assertSupplierActiveCustomerLocationCapacity: vi.fn(async () => {}),
}))

vi.mock('../lib/org-billing-tenant.js', () => ({
  resolveOrgBillingTenantId: vi.fn(async (id) => id),
}))

vi.mock('./notification/in-app.js', () => ({
  notifyTenantUsers: vi.fn(async () => {}),
}))

vi.mock('../lib/audit.js', () => ({
  writeAuditLog: vi.fn(async () => {}),
}))

describe('referral program platform trial defaults', () => {
  it('defaults clamp to 30 days within 7-90 range', () => {
    expect(clampFreeTrialDays(30)).toBe(30)
    expect(FREE_TRIAL_MIN_DAYS).toBe(7)
    expect(FREE_TRIAL_MAX_DAYS).toBe(90)
  })
})

describe('SponsorshipError', () => {
  it('maps to domain error name in resolveHttpError', () => {
    const err = new SponsorshipError('SPONSORSHIP_LIMIT_REACHED', 'limit hit', {
      statusCode: 403,
    })
    const resolved = resolveHttpError(err)
    expect(resolved.statusCode).toBe(403)
    expect(resolved.errorName).toBe('SPONSORSHIP_LIMIT_REACHED')
  })
})

describe('buildPricingSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects non-monthly interval', async () => {
    const { buildPricingSnapshot } = await import('./supplier-sponsorship.service.js')
    await expect(
      buildPricingSnapshot('plan-1', { billingInterval: 'YEARLY' })
    ).rejects.toMatchObject({
      code: 'SPONSORSHIP_PLAN_NOT_ELIGIBLE',
    })
  })

  it('builds snapshot from plan monthly price', async () => {
    const { query } = await import('../lib/db.js')
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 'plan-1',
          code: 'silver',
          name: 'Restaurant Growth',
          price_per_month: 49,
          price_per_year: 490,
          tenant_type: 'RESTAURANT',
          is_active: true,
        },
      ],
    })
    const { buildPricingSnapshot } = await import('./supplier-sponsorship.service.js')
    const snap = await buildPricingSnapshot('plan-1')
    expect(snap.billingInterval).toBe('MONTHLY')
    expect(snap.baseAmount).toBe(49)
    expect(snap.finalSponsoredAmount).toBe(49)
    expect(snap.taxAmount).toBe(0)
    expect(snap.planCode).toBe('silver')
  })
})

describe('sponsorship billing helpers', () => {
  it('detects sponsorship invoice metadata', async () => {
    const { isSponsorshipInvoice, SPONSORSHIP_INVOICE_TYPE } = await import(
      '../lib/billing/sponsorship-billing.js'
    )
    expect(isSponsorshipInvoice({ metadata: { type: SPONSORSHIP_INVOICE_TYPE } })).toBe(true)
    expect(isSponsorshipInvoice({ metadata: { type: 'other' } })).toBe(false)
  })
})
