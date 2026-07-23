/**
 * Billing ownership when linking/unlinking Branch Accounts under an organization.
 *
 * Unlink policy (P0-3):
 * - No automatic refunds or prorations.
 * - Block unlink when the Branch Account has OPEN billing invoices.
 * - Allow unlink with billing_review_required for: prepaid remaining, remaining credits,
 *   org payment failure (PAST_DUE / locked main), or active paid billing period.
 * - Credits and invoice history stay on the Branch Account tenant id.
 */
import { query } from './db.js'
import { logger } from './logger.js'
import { invalidateOrgBillingTenantCache } from './org-billing-tenant.js'

export const UNLINK_BILLING_BLOCKER = {
  NO_INDEPENDENT_SUBSCRIPTION: 'NO_INDEPENDENT_SUBSCRIPTION',
  INVALID_SUBSCRIPTION: 'INVALID_SUBSCRIPTION',
  OPEN_INVOICES: 'OPEN_INVOICES',
}

export const UNLINK_BILLING_REVIEW = {
  PREPAID_REMAINING: 'PREPAID_REMAINING',
  REMAINING_CREDITS: 'REMAINING_CREDITS',
  ORG_PAYMENT_FAILED: 'ORG_PAYMENT_FAILED',
  ACTIVE_BILLING_PERIOD: 'ACTIVE_BILLING_PERIOD',
  PRIOR_LINK_REVIEW: 'PRIOR_LINK_REVIEW',
}

const BLOCKER_MESSAGES = {
  [UNLINK_BILLING_BLOCKER.NO_INDEPENDENT_SUBSCRIPTION]:
    'Branch Account needs an independent subscription before operational use after unlink',
  [UNLINK_BILLING_BLOCKER.INVALID_SUBSCRIPTION]:
    'Subscription status is not valid for independent operation after unlink',
  [UNLINK_BILLING_BLOCKER.OPEN_INVOICES]:
    'Branch Account has unpaid invoices that must be settled or voided before unlink',
}

const REVIEW_MESSAGES = {
  [UNLINK_BILLING_REVIEW.PREPAID_REMAINING]:
    'Prepaid period remaining on Branch Account subscription; no automatic refund on unlink',
  [UNLINK_BILLING_REVIEW.REMAINING_CREDITS]:
    'Platform billing credits remain on this Branch Account and stay with the tenant after unlink',
  [UNLINK_BILLING_REVIEW.ORG_PAYMENT_FAILED]:
    'Organization billing is past due or locked; unlink allowed but requires billing review',
  [UNLINK_BILLING_REVIEW.ACTIVE_BILLING_PERIOD]:
    'Unlink during an active paid billing period; no automatic proration',
  [UNLINK_BILLING_REVIEW.PRIOR_LINK_REVIEW]:
    'Billing review was already flagged when this Branch Account was linked under org billing',
}

async function getActiveSubscription(tenantId, tenantType, client = null) {
  const db = client ? (sql, params) => client.query(sql, params) : query
  const { rows } = await db(
    `SELECT *
     FROM subscription
     WHERE tenant_id = $1 AND tenant_type = $2
     ORDER BY
       CASE
         WHEN UPPER(status) IN ('ACTIVE', 'TRIALING', 'PAST_DUE', 'PENDING_ACTIVATION') THEN 0
         ELSE 1
       END,
       updated_at DESC NULLS LAST,
       created_at DESC
     LIMIT 1`,
    [tenantId, tenantType]
  )
  return rows[0] || null
}

function normalizeStatus(subscription) {
  return String(subscription?.status || '').toUpperCase()
}

function hasPrepaidTimeRemaining(subscription) {
  if (!subscription?.current_period_end) return false
  const end = new Date(subscription.current_period_end)
  if (Number.isNaN(end.getTime())) return false
  const status = normalizeStatus(subscription)
  if (['CANCELLED', 'CANCELED', 'EXPIRED', 'INCOMPLETE'].includes(status)) return false
  const plan = String(subscription.plan_code || subscription.plan_name || '').toLowerCase()
  if (plan === 'free' || plan.includes('free')) return false
  return end.getTime() > Date.now()
}

async function tenantHasOpenInvoices(tenantId, tenantType, client = null) {
  const db = client ? (sql, params) => client.query(sql, params) : query
  const { rows } = await db(
    `
    SELECT id, invoice_number, amount_due, currency, due_date
    FROM billing_invoice
    WHERE tenant_id = $1
      AND tenant_type = $2
      AND status = 'OPEN'
    ORDER BY due_date ASC NULLS LAST
    LIMIT 20
    `,
    [tenantId, tenantType]
  )
  return rows
}

async function tenantHasRemainingCredits(tenantId, tenantType, client = null) {
  const db = client ? (sql, params) => client.query(sql, params) : query
  try {
    const { rows } = await db(
      `
      SELECT COALESCE(SUM(remaining_amount), 0)::numeric AS remaining
      FROM platform_billing_credit
      WHERE tenant_id = $1
        AND tenant_type = $2
        AND remaining_amount > 0
        AND (expires_at IS NULL OR expires_at > NOW())
      `,
      [tenantId, tenantType]
    )
    return Number(rows[0]?.remaining || 0)
  } catch (err) {
    if (err.code === '42P01') return 0
    throw err
  }
}

async function getOrgMainBillingHealth(organizationId, tenantType, client = null) {
  if (!organizationId) return null
  const db = client ? (sql, params) => client.query(sql, params) : query
  const table = tenantType === 'SUPPLIER' ? 'supplier' : 'restaurant'
  const { rows: mainRows } = await db(
    `
    SELECT id FROM ${table}
    WHERE organization_id = $1 AND is_main_branch = true
    ORDER BY created_at ASC
    LIMIT 1
    `,
    [organizationId]
  )
  const mainId = mainRows[0]?.id
  if (!mainId) return null

  const subscription = await getActiveSubscription(mainId, tenantType, client)
  if (!subscription) return { mainTenantId: mainId, failed: false }

  const status = normalizeStatus(subscription)
  const failed =
    status === 'PAST_DUE' ||
    status === 'SUSPENDED' ||
    Boolean(subscription.account_locked_at) ||
    Boolean(subscription.past_due_since)

  return { mainTenantId: mainId, subscription, failed, status }
}

/**
 * Evaluate unlink billing edges without mutating state.
 */
export async function evaluateUnlinkBillingPolicy(
  tenantId,
  tenantType,
  { client = null, organizationId = null, requireIndependentSubscription = true } = {}
) {
  const blockers = []
  const reviews = []
  const subscription = await getActiveSubscription(tenantId, tenantType, client)

  if (!subscription) {
    if (requireIndependentSubscription) {
      blockers.push({
        code: UNLINK_BILLING_BLOCKER.NO_INDEPENDENT_SUBSCRIPTION,
        message: BLOCKER_MESSAGES[UNLINK_BILLING_BLOCKER.NO_INDEPENDENT_SUBSCRIPTION],
      })
    }
  } else {
    const status = normalizeStatus(subscription)
    const validStatuses = new Set(['ACTIVE', 'TRIALING', 'PAST_DUE', 'PENDING_ACTIVATION'])
    if (requireIndependentSubscription && !validStatuses.has(status)) {
      blockers.push({
        code: UNLINK_BILLING_BLOCKER.INVALID_SUBSCRIPTION,
        message: `${BLOCKER_MESSAGES[UNLINK_BILLING_BLOCKER.INVALID_SUBSCRIPTION]} ("${subscription.status}")`,
        subscriptionStatus: subscription.status,
      })
    }

    if (subscription.billing_review_required) {
      reviews.push({
        code: UNLINK_BILLING_REVIEW.PRIOR_LINK_REVIEW,
        message:
          subscription.billing_review_reason ||
          REVIEW_MESSAGES[UNLINK_BILLING_REVIEW.PRIOR_LINK_REVIEW],
      })
    }

    if (hasPrepaidTimeRemaining(subscription)) {
      reviews.push({
        code: UNLINK_BILLING_REVIEW.PREPAID_REMAINING,
        message: REVIEW_MESSAGES[UNLINK_BILLING_REVIEW.PREPAID_REMAINING],
        currentPeriodEnd: subscription.current_period_end,
      })
      reviews.push({
        code: UNLINK_BILLING_REVIEW.ACTIVE_BILLING_PERIOD,
        message: REVIEW_MESSAGES[UNLINK_BILLING_REVIEW.ACTIVE_BILLING_PERIOD],
        currentPeriodEnd: subscription.current_period_end,
      })
    }
  }

  const openInvoices = await tenantHasOpenInvoices(tenantId, tenantType, client)
  if (openInvoices.length) {
    blockers.push({
      code: UNLINK_BILLING_BLOCKER.OPEN_INVOICES,
      message: BLOCKER_MESSAGES[UNLINK_BILLING_BLOCKER.OPEN_INVOICES],
      invoices: openInvoices,
    })
  }

  const remainingCredits = await tenantHasRemainingCredits(tenantId, tenantType, client)
  if (remainingCredits > 0) {
    reviews.push({
      code: UNLINK_BILLING_REVIEW.REMAINING_CREDITS,
      message: REVIEW_MESSAGES[UNLINK_BILLING_REVIEW.REMAINING_CREDITS],
      remainingCredits,
    })
  }

  const orgHealth = await getOrgMainBillingHealth(organizationId, tenantType, client)
  if (orgHealth?.failed) {
    reviews.push({
      code: UNLINK_BILLING_REVIEW.ORG_PAYMENT_FAILED,
      message: REVIEW_MESSAGES[UNLINK_BILLING_REVIEW.ORG_PAYMENT_FAILED],
      orgMainTenantId: orgHealth.mainTenantId,
      orgSubscriptionStatus: orgHealth.status,
    })
  }

  // Deduplicate review codes while keeping order
  const seen = new Set()
  const uniqueReviews = []
  for (const review of reviews) {
    if (seen.has(review.code)) continue
    seen.add(review.code)
    uniqueReviews.push(review)
  }

  return {
    blockers,
    reviews: uniqueReviews,
    subscription,
    orgHealth,
    canUnlink: blockers.length === 0,
    billingReviewRequired: uniqueReviews.length > 0,
  }
}

/**
 * On link: snapshot prior subscription, suspend child auto-renewal while org billing is active.
 * Flags billing_review_required when prepaid time cannot be auto-resolved.
 */
export async function applyOrgBillingOnLink(
  tenantId,
  tenantType,
  { client = null, actorUserId = null } = {}
) {
  const db = client ? (sql, params) => client.query(sql, params) : query
  const subscription = await getActiveSubscription(tenantId, tenantType, client)
  if (!subscription) {
    return { ok: true, billingReviewRequired: false, reason: 'NO_SUBSCRIPTION' }
  }

  const snapshot = {
    id: subscription.id,
    status: subscription.status,
    plan_code: subscription.plan_code,
    plan_name: subscription.plan_name,
    auto_renew: subscription.auto_renew,
    current_period_start: subscription.current_period_start,
    current_period_end: subscription.current_period_end,
    snapshotted_at: new Date().toISOString(),
    actor_user_id: actorUserId,
  }

  const prepaid = hasPrepaidTimeRemaining(subscription)
  const billingReviewRequired = prepaid
  const reviewReason = prepaid
    ? 'Prepaid period remaining on child subscription when linking under org billing; manual billing review required (no automatic refund).'
    : null

  await db(
    `UPDATE subscription
     SET auto_renew = false,
         org_billing_suspended_at = NOW(),
         linked_billing_snapshot = $2::jsonb,
         billing_review_required = $3,
         billing_review_reason = $4,
         updated_at = NOW()
     WHERE id = $1`,
    [subscription.id, JSON.stringify(snapshot), billingReviewRequired, reviewReason]
  )

  await invalidateOrgBillingTenantCache(tenantId, tenantType)

  return {
    ok: true,
    billingReviewRequired,
    reason: reviewReason,
    snapshot,
    subscriptionId: subscription.id,
  }
}

/**
 * On unlink: enforce billing policy, clear org-billing suspension markers,
 * and flag billing_review_required when manual follow-up is needed.
 */
export async function applyOrgBillingOnUnlink(
  tenantId,
  tenantType,
  { client = null, organizationId = null, requireIndependentSubscription = true } = {}
) {
  const db = client ? (sql, params) => client.query(sql, params) : query
  const evaluation = await evaluateUnlinkBillingPolicy(tenantId, tenantType, {
    client,
    organizationId,
    requireIndependentSubscription,
  })

  if (!evaluation.canUnlink) {
    const primary = evaluation.blockers[0]
    return {
      ok: false,
      reason: primary.code,
      message: primary.message,
      blockers: evaluation.blockers,
      reviews: evaluation.reviews,
      subscription: evaluation.subscription,
    }
  }

  const subscription = evaluation.subscription
  if (!subscription) {
    await invalidateOrgBillingTenantCache(tenantId, tenantType)
    return {
      ok: true,
      reason: 'NO_SUBSCRIPTION',
      billingReviewRequired: evaluation.billingReviewRequired,
      reviews: evaluation.reviews,
    }
  }

  const status = normalizeStatus(subscription)
  const plan = String(subscription.plan_code || subscription.plan_name || '').toLowerCase()
  const shouldAutoRenew =
    plan !== 'free' && !plan.includes('free') && status !== 'PENDING_ACTIVATION'

  const billingReviewRequired = evaluation.billingReviewRequired
  const reviewReason = billingReviewRequired
    ? evaluation.reviews.map((r) => r.message).join(' | ')
    : null

  await db(
    `UPDATE subscription
     SET auto_renew = CASE WHEN $2 THEN true ELSE auto_renew END,
         org_billing_suspended_at = NULL,
         billing_review_required = $3,
         billing_review_reason = $4,
         updated_at = NOW()
     WHERE id = $1`,
    [subscription.id, shouldAutoRenew, billingReviewRequired, reviewReason]
  )

  await invalidateOrgBillingTenantCache(tenantId, tenantType)

  return {
    ok: true,
    subscriptionId: subscription.id,
    autoRenewEnabled: shouldAutoRenew,
    billingReviewRequired,
    reviews: evaluation.reviews,
    policy: {
      noAutomaticRefund: true,
      noAutomaticProration: true,
      creditsRemainOnTenant: true,
      invoicesRemainOnTenant: true,
    },
  }
}

export async function recordBranchAccountLinkHistory({
  orgType,
  organizationId,
  tenantType,
  tenantId,
  action,
  actorUserId = null,
  invitationId = null,
  billingSnapshot = null,
  metadata = {},
  client = null,
}) {
  const db = client ? (sql, params) => client.query(sql, params) : query
  try {
    await db(
      `INSERT INTO branch_account_link_history
         (org_type, organization_id, tenant_type, tenant_id, action, actor_user_id,
          invitation_id, billing_snapshot, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)`,
      [
        orgType,
        organizationId,
        tenantType,
        tenantId,
        action,
        actorUserId,
        invitationId,
        billingSnapshot ? JSON.stringify(billingSnapshot) : null,
        JSON.stringify(metadata || {}),
      ]
    )
  } catch (err) {
    // Table may not exist yet in older envs; never block lifecycle on audit insert
    if (err.code === '42P01') {
      logger.warn('branch_account_link_history table missing; skipping audit insert')
      return
    }
    throw err
  }
}

export { hasPrepaidTimeRemaining, getActiveSubscription, BLOCKER_MESSAGES, REVIEW_MESSAGES }
