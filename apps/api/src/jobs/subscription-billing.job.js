import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import {
  getSubscriptionForBilling,
  markSubscriptionPastDue,
  lockSubscriptionAccount,
} from '../lib/billing/billing-service.js'
import { getBillingGateway } from '../lib/billing/gateway-registry.js'
import { withTransaction } from '../lib/db.js'
import { invalidateTenantSubscriptionCache } from '../lib/subscription.js'

function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

async function attemptAutoRenewal(subscription) {
  const planCode = (subscription.plan_code || '').toLowerCase()
  if (planCode === 'free' || !subscription.auto_renew) return { skipped: true }

  const amount =
    subscription.billing_cycle === 'YEARLY'
      ? Number(subscription.price_per_year) || Number(subscription.price_per_month) * 12
      : Number(subscription.price_per_month)
  if (!amount || amount <= 0) return { skipped: true }

  const { rows: methods } = await query(
    `SELECT * FROM billing_payment_method
     WHERE tenant_id = $1 AND tenant_type = $2 AND status = 'ACTIVE'
     ORDER BY is_default DESC, created_at DESC LIMIT 1`,
    [subscription.tenant_id, subscription.tenant_type]
  )
  if (methods.length === 0) {
    await withTransaction(async (client) => {
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
    idempotencyKey: `renew_${subscription.id}_${subscription.next_billing_date}`,
  })

  if (chargeResult.status === 'succeeded') {
    const periodStart = new Date()
    const periodEnd =
      subscription.billing_cycle === 'YEARLY' ? addDays(periodStart, 365) : addDays(periodStart, 30)
    await query(
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
       WHERE id = $1`,
      [subscription.id, periodStart, periodEnd]
    )
    invalidateTenantSubscriptionCache(subscription.tenant_id, subscription.tenant_type).catch(
      () => {}
    )
    return { renewed: true }
  }

  await withTransaction(async (client) => {
    await markSubscriptionPastDue(client, subscription.id)
  })
  return { failed: true, reason: chargeResult.failureCode }
}

/**
 * Daily billing job:
 * 1. Auto-renew subscriptions due today
 * 2. Lock accounts when grace period expired with open invoices or PAST_DUE
 */
export async function runSubscriptionBillingJob() {
  let renewed = 0
  let locked = 0
  let pastDue = 0

  try {
    const { rows: dueRenewals } = await query(
      `SELECT s.*, sp.code AS plan_code, sp.price_per_month, sp.price_per_year
       FROM subscription s
       LEFT JOIN subscription_plan sp ON sp.id = s.plan_id
       WHERE s.status IN ('ACTIVE', 'PAST_DUE')
         AND s.auto_renew = true
         AND s.next_billing_date IS NOT NULL
         AND s.next_billing_date <= now()
         AND (sp.code IS NULL OR sp.code != 'free')`,
      []
    )

    for (const sub of dueRenewals) {
      try {
        const result = await attemptAutoRenewal(sub)
        if (result.renewed) renewed++
        if (result.failed) pastDue++
      } catch (err) {
        logger.error('Auto-renewal failed', { subscriptionId: sub.id, error: err.message })
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

      if (stillOwes) {
        await withTransaction(async (client) => {
          await lockSubscriptionAccount(client, sub.id, 'payment_overdue_grace_expired')
        })
        locked++
      }
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
