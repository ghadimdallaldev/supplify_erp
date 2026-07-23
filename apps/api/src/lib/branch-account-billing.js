/**
 * Billing ownership when linking/unlinking Branch Accounts under an organization.
 * Does not invent refunds or prorations — flags billing_review_required when needed.
 */
import { query } from './db.js'
import { logger } from './logger.js'

async function getActiveSubscription(tenantId, tenantType, client = null) {
  const db = client ? (sql, params) => client.query(sql, params) : query
  const { rows } = await db(
    `SELECT *
     FROM subscription
     WHERE tenant_id = $1 AND tenant_type = $2
     ORDER BY
       CASE WHEN status IN ('active', 'trialing', 'past_due') THEN 0 ELSE 1 END,
       updated_at DESC NULLS LAST,
       created_at DESC
     LIMIT 1`,
    [tenantId, tenantType]
  )
  return rows[0] || null
}

function hasPrepaidTimeRemaining(subscription) {
  if (!subscription?.current_period_end) return false
  const end = new Date(subscription.current_period_end)
  if (Number.isNaN(end.getTime())) return false
  const status = String(subscription.status || '').toLowerCase()
  if (['cancelled', 'canceled', 'expired', 'incomplete'].includes(status)) return false
  const plan = String(subscription.plan_code || subscription.plan_name || '').toLowerCase()
  if (plan === 'free' || plan.includes('free')) return false
  return end.getTime() > Date.now()
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

  return {
    ok: true,
    billingReviewRequired,
    reason: reviewReason,
    snapshot,
    subscriptionId: subscription.id,
  }
}

/**
 * On unlink: keep history; clear org-billing suspension markers.
 * Caller must ensure an independent valid subscription before operational writes.
 */
export async function applyOrgBillingOnUnlink(
  tenantId,
  tenantType,
  { client = null, requireIndependentSubscription = true } = {}
) {
  const db = client ? (sql, params) => client.query(sql, params) : query
  const subscription = await getActiveSubscription(tenantId, tenantType, client)

  if (!subscription) {
    if (requireIndependentSubscription) {
      return {
        ok: false,
        reason: 'NO_INDEPENDENT_SUBSCRIPTION',
        message:
          'Branch Account needs an independent subscription before operational use after unlink',
      }
    }
    return { ok: true, reason: 'NO_SUBSCRIPTION' }
  }

  const status = String(subscription.status || '').toLowerCase()
  const validStatuses = new Set(['active', 'trialing', 'past_due', 'pending_activation'])
  if (requireIndependentSubscription && !validStatuses.has(status)) {
    return {
      ok: false,
      reason: 'INVALID_SUBSCRIPTION',
      message: `Subscription status "${subscription.status}" is not valid for independent operation`,
      subscription,
    }
  }

  // Re-enable auto-renew for paid plans; leave free/pending as-is
  const plan = String(subscription.plan_code || subscription.plan_name || '').toLowerCase()
  const shouldAutoRenew =
    plan !== 'free' && !plan.includes('free') && status !== 'pending_activation'

  await db(
    `UPDATE subscription
     SET auto_renew = CASE WHEN $2 THEN true ELSE auto_renew END,
         org_billing_suspended_at = NULL,
         updated_at = NOW()
     WHERE id = $1`,
    [subscription.id, shouldAutoRenew]
  )

  return { ok: true, subscriptionId: subscription.id, autoRenewEnabled: shouldAutoRenew }
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

export { hasPrepaidTimeRemaining, getActiveSubscription }
