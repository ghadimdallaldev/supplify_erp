import { query, withTransaction } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import {
  getSubscriptionForBilling,
  markSubscriptionPastDue,
  lockSubscriptionAccount,
} from '../lib/billing/billing-service.js'
import { getBillingGateway } from '../lib/billing/gateway-registry.js'
import { invalidateTenantSubscriptionCache } from '../lib/subscription.js'

function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

async function lockDueSubscription(client, subscriptionId) {
  const { rows } = await client.query(
    `
    SELECT s.*, sp.code AS plan_code, sp.price_per_month, sp.price_per_year
    FROM subscription s
    LEFT JOIN subscription_plan sp ON sp.id = s.plan_id
    WHERE s.id = $1
      AND s.status IN ('ACTIVE', 'PAST_DUE')
      AND s.auto_renew = true
      AND s.next_billing_date IS NOT NULL
      AND s.next_billing_date <= now()
      AND (sp.code IS NULL OR sp.code != 'free')
    FOR UPDATE OF s
  `,
    [subscriptionId]
  )
  return rows[0] ?? null
}

async function attemptAutoRenewal(subscription) {
  const planCode = (subscription.plan_code || '').toLowerCase()
  if (planCode === 'free' || !subscription.auto_renew) return { skipped: true }

  const amount =
    subscription.billing_cycle === 'YEARLY'
      ? Number(subscription.price_per_year) || Number(subscription.price_per_month) * 12
      : Number(subscription.price_per_month)
  if (!amount || amount <= 0) return { skipped: true }

  const billingDateAtStart = subscription.next_billing_date

  const { rows: methods } = await query(
    `SELECT * FROM billing_payment_method
     WHERE tenant_id = $1 AND tenant_type = $2 AND status = 'ACTIVE'
     ORDER BY is_default DESC, created_at DESC LIMIT 1`,
    [subscription.tenant_id, subscription.tenant_type]
  )

  if (methods.length === 0) {
    await withTransaction(async (client) => {
      const locked = await lockDueSubscription(client, subscription.id)
      if (!locked) return
      await markSubscriptionPastDue(client, subscription.id)
    })
    return { failed: true, reason: 'no_payment_method' }
  }

  const method = methods[0]
  const gateway = getBillingGateway(method.provider)
  const chargeResult = await gateway.chargeOffSession({
    amount,
    currency: 'USD',
    providerPaymentMethodId: method.provider_payment_method_id,
    idempotencyKey: `renew_${subscription.id}_${billingDateAtStart}`,
  })

  if (chargeResult.status === 'succeeded') {
    const periodStart = new Date()
    const periodEnd =
      subscription.billing_cycle === 'YEARLY' ? addDays(periodStart, 365) : addDays(periodStart, 30)

    const updateResult = await withTransaction(async (client) => {
      const locked = await lockDueSubscription(client, subscription.id)
      if (!locked) return { rowCount: 0 }

      return client.query(
        `UPDATE subscription SET
          status = 'ACTIVE',
          last_payment_at = now(),
          past_due_since = NULL,
          grace_period_ends_at = NULL,
          account_locked_at = NULL,
          lock_reason = NULL,
          current_period_start = $2,
          current_period_end = $3,
          next_billing_date = $3,
          updated_at = now()
         WHERE id = $1
           AND next_billing_date = $4`,
        [subscription.id, periodStart, periodEnd, billingDateAtStart]
      )
    })
    const { rowCount } = updateResult

    if (rowCount > 0) {
      invalidateTenantSubscriptionCache(subscription.tenant_id, subscription.tenant_type).catch(
        () => {}
      )
      return { renewed: true }
    }
    return { skipped: true, reason: 'already_renewed' }
  }

  await withTransaction(async (client) => {
    const locked = await lockDueSubscription(client, subscription.id)
    if (!locked) return
    await markSubscriptionPastDue(client, subscription.id)
  })
  return { failed: true, reason: chargeResult.failureCode }
}

async function processSubscriptionRenewal(subscriptionId) {
  const subscription = await withTransaction((client) =>
    lockDueSubscription(client, subscriptionId)
  )
  if (!subscription) return { skipped: true }
  return attemptAutoRenewal(subscription)
}

/**
 * Billing job:
 * 1. Auto-renew subscriptions due today (per-row lock + idempotent charge)
 * 2. Lock accounts when grace period expired with open invoices or PAST_DUE
 */
export async function runSubscriptionBillingJob() {
  let renewed = 0
  let locked = 0
  let pastDue = 0

  try {
    const { rows: dueRenewalIds } = await query(
      `SELECT s.id
       FROM subscription s
       LEFT JOIN subscription_plan sp ON sp.id = s.plan_id
       WHERE s.status IN ('ACTIVE', 'PAST_DUE')
         AND s.auto_renew = true
         AND s.next_billing_date IS NOT NULL
         AND s.next_billing_date <= now()
         AND (sp.code IS NULL OR sp.code != 'free')`,
      []
    )

    for (const { id } of dueRenewalIds) {
      try {
        const result = await processSubscriptionRenewal(id)
        if (result.renewed) renewed++
        if (result.failed) pastDue++
      } catch (err) {
        logger.error('Auto-renewal failed', { subscriptionId: id, error: err.message })
      }
    }

    const { rows: graceExpired } = await query(
      `SELECT id, tenant_id, tenant_type FROM subscription
       WHERE grace_period_ends_at IS NOT NULL
         AND grace_period_ends_at <= now()
         AND account_locked_at IS NULL
         AND status IN ('PAST_DUE', 'ACTIVE', 'SUSPENDED')`,
      []
    )

    for (const sub of graceExpired) {
      const { rows: openInv } = await query(
        `SELECT id FROM billing_invoice WHERE subscription_id = $1 AND status = 'OPEN' LIMIT 1`,
        [sub.id]
      )
      const billingSub = await getSubscriptionForBilling(sub.tenant_id, sub.tenant_type)
      const stillOwes =
        openInv.length > 0 ||
        billingSub?.status === 'PAST_DUE' ||
        Boolean(billingSub?.past_due_since)

      if (!stillOwes) continue

      const didLock = await withTransaction(async (client) => {
        const { rows } = await client.query(
          `SELECT id FROM subscription
           WHERE id = $1
             AND account_locked_at IS NULL
           FOR UPDATE`,
          [sub.id]
        )
        if (rows.length === 0) return false

        await lockSubscriptionAccount(client, sub.id, 'payment_overdue_grace_expired')
        return true
      })

      if (didLock) locked++
    }

    logger.info('Subscription billing job complete', { renewed, locked, pastDue })
  } catch (e) {
    if (e.code === '42P01') {
      logger.debug('Billing tables not migrated yet; skipping billing job')
      return { renewed: 0, locked: 0, pastDue: 0, skipped: true }
    }
    throw e
  }

  return { renewed, locked, pastDue }
}
