import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./db.js', () => ({
  query: vi.fn(),
}))

vi.mock('./org-billing-tenant.js', () => ({
  invalidateOrgBillingTenantCache: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}))

import { query } from './db.js'
import {
  evaluateUnlinkBillingPolicy,
  applyOrgBillingOnUnlink,
  UNLINK_BILLING_BLOCKER,
  UNLINK_BILLING_REVIEW,
} from './branch-account-billing.js'

describe('branch-account-billing unlink policy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('blocks unlink when the branch has OPEN invoices', async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'sub-1',
            status: 'ACTIVE',
            plan_code: 'growth',
            current_period_end: null,
            billing_review_required: false,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'inv-1', invoice_number: 'INV-1', amount_due: 50 }],
      })
      .mockResolvedValueOnce({ rows: [{ remaining: 0 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'main-1' }] })
      .mockResolvedValueOnce({
        rows: [{ id: 'main-sub', status: 'ACTIVE' }],
      })

    const evaluation = await evaluateUnlinkBillingPolicy('branch-1', 'SUPPLIER', {
      organizationId: 'org-1',
    })

    expect(evaluation.canUnlink).toBe(false)
    expect(evaluation.blockers[0].code).toBe(UNLINK_BILLING_BLOCKER.OPEN_INVOICES)
  })

  it('allows unlink with billing review for prepaid and remaining credits', async () => {
    const periodEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'sub-1',
            status: 'ACTIVE',
            plan_code: 'growth',
            plan_name: 'Growth',
            current_period_end: periodEnd,
            billing_review_required: false,
            auto_renew: false,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }) // open invoices
      .mockResolvedValueOnce({ rows: [{ remaining: 25 }] }) // credits
      .mockResolvedValueOnce({ rows: [{ id: 'main-1' }] })
      .mockResolvedValueOnce({
        rows: [{ id: 'main-sub', status: 'PAST_DUE', past_due_since: new Date().toISOString() }],
      })
      .mockResolvedValueOnce({}) // update subscription

    const result = await applyOrgBillingOnUnlink('branch-1', 'RESTAURANT', {
      organizationId: 'org-1',
    })

    expect(result.ok).toBe(true)
    expect(result.billingReviewRequired).toBe(true)
    expect(result.reviews.map((r) => r.code)).toEqual(
      expect.arrayContaining([
        UNLINK_BILLING_REVIEW.PREPAID_REMAINING,
        UNLINK_BILLING_REVIEW.REMAINING_CREDITS,
        UNLINK_BILLING_REVIEW.ORG_PAYMENT_FAILED,
      ])
    )
    expect(result.policy.noAutomaticRefund).toBe(true)
    expect(result.policy.noAutomaticProration).toBe(true)
  })

  it('blocks unlink when subscription status is invalid for independent use', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ id: 'sub-1', status: 'CANCELLED', plan_code: 'growth' }],
      })
      .mockResolvedValueOnce({ rows: [] }) // invoices
      .mockResolvedValueOnce({ rows: [{ remaining: 0 }] }) // credits
      .mockResolvedValueOnce({ rows: [] }) // org main

    const result = await applyOrgBillingOnUnlink('branch-1', 'SUPPLIER', {
      organizationId: 'org-1',
    })

    expect(result.ok).toBe(false)
    expect(result.reason).toBe(UNLINK_BILLING_BLOCKER.INVALID_SUBSCRIPTION)
  })
})
