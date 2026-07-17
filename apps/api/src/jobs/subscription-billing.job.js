import { query, withTransaction } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import {
  getSubscriptionForBilling,
  markSubscriptionPastDue,
  lockSubscriptionAccount,
  calculateRecurringSubscriptionTotal,
} from '../lib/billing/billing-service.js'
import { getActiveTenantAddons } from '../lib/subscription-addons.js'
import { getBillingGateway } from '../lib/billing/gateway-registry.js'
import { invalidateTenantSubscriptionCache } from '../lib/subscription.js'
import {
  notifyBillingRenewed,
  notifyBillingPaymentFailed,
  notifyBillingAccountLocked,
} from '../services/notification.service.js'

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

  const activeAddons = await getActiveTenantAddons(subscription.tenant_id, subscription.tenant_type)
  const recurringTotal = calculateRecurringSubscriptionTotal(
    {
      code: subscription.plan_code,
      price_per_month: subscription.price_per_month,
      price_per_year: subscription.price_per_year,
    },
    subscription.billing_cycle || 'MONTHLY',
    activeAddons
  )
  const amount = recurringTotal.totalAmount
  if (!amount || amount <= 0) return { skipped: true }

  const billingDateAtStart = subscription.next_billing_date
  const renewalIdempotencyKey = `renew_${subscription.id}_${billingDateAtStart}`

  const { rows: existingPayments } = await query(
    `SELECT p.id AS payment_id, p.provider_payment_id, i.period_start, i.period_end
     FROM billing_payment p
     LEFT JOIN billing_invoice i ON i.id = p.invoice_id
     WHERE p.subscription_id = $1
       AND p.idempotency_key = $2
       AND p.status = 'SUCCEEDED'
     LIMIT 1`,
    [subscription.id, renewalIdempotencyKey]
  )

  if (existingPayments.length > 0) {
    const existing = existingPayments[0]
    if (existing.period_start && existing.period_end) {
      const updateResult = await withTransaction(async (client) => {
        const locked = await lockDueSubscription(client, subscription.id)
        if (!locked) return { rowCount: 0 }
        return client.query(
          `UPDATE subscription SET
            status = 'ACTIVE',
            last_payment_at = COALESCE(last_payment_at, now()),
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
          [subscription.id, existing.period_start, existing.period_end, billingDateAtStart]
        )
      })
      if (updateResult.rowCount > 0) {
        await invalidateTenantSubscriptionCache(
          subscription.tenant_id,
          subscription.tenant_type
        ).catch((err) => {
          logger.error('Failed to invalidate subscription cache after idempotent auto-renewal', {
            tenantId: subscription.tenant_id,
            tenantType: subscription.tenant_type,
            error: err.message,
          })
        })
        return { renewed: true, idempotent: true }
      }
    }
    return { skipped: true, reason: 'already_charged' }
  }

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
    notifyBillingPaymentFailed({
      tenantId: subscription.tenant_id,
      tenantType: subscription.tenant_type,
      reason: 'no payment method on file',
    }).catch(() => {})
    return { failed: true, reason: 'no_payment_method' }
  }

  const method = methods[0]
  const gateway = getBillingGateway(method.provider)
  const { rows: renewalPaymentRows } = await query(
    `INSERT INTO billing_payment (
      invoice_id, subscription_id, tenant_id, tenant_type, payment_method_id,
      provider, amount, currency, status, idempotency_key, metadata
    ) VALUES (NULL, $1, $2, $3, $4, $5, $6, 'USD', 'PROCESSING', $7, $8::jsonb)
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id`,
    [
      subscription.id,
      subscription.tenant_id,
      subscription.tenant_type,
      method.id,
      gateway.id,
      amount,
      renewalIdempotencyKey,
      JSON.stringify({ renewal: true, phase: 'auto_renewal_claim' }),
    ]
  )

  if (renewalPaymentRows.length === 0) {
    return { skipped: true, reason: 'renewal_in_progress' }
  }
  const renewalPaymentId = renewalPaymentRows[0].id

  const chargeResult = await gateway.chargeOffSession({
    amount,
    currency: 'USD',
    providerPaymentMethodId: method.provider_payment_method_id,
    idempotencyKey: renewalIdempotencyKey,
  })

  if (chargeResult.status === 'succeeded') {
    const periodStart = new Date()
    const periodEnd =
      subscription.billing_cycle === 'YEARLY' ? addDays(periodStart, 365) : addDays(periodStart, 30)

    const updateResult = await withTransaction(async (client) => {
      const locked = await lockDueSubscription(client, subscription.id)
      if (!locked) return { rowCount: 0 }

      const invoiceNumber = `SUB-RENEW-${Date.now().toString(36).toUpperCase()}-${subscription.id.slice(0, 8)}`
      const { rows: invoiceRows } = await client.query(
        `INSERT INTO billing_invoice (
          subscription_id, tenant_id, tenant_type, invoice_number, amount, currency,
          billing_cycle, plan_id, plan_name, status, period_start, period_end, due_date, paid_at, metadata
        ) VALUES ($1, $2, $3, $4, $5, 'USD', $6, $7, $8, 'PAID', $9, $10, now(), now(), $11)
        RETURNING *`,
        [
          subscription.id,
          subscription.tenant_id,
          subscription.tenant_type,
          invoiceNumber,
          amount,
          subscription.billing_cycle,
          subscription.plan_id,
          subscription.plan_name,
          periodStart,
          periodEnd,
          JSON.stringify({
            baseAmount: recurringTotal.baseAmount,
            addonAmount: recurringTotal.addonAmount,
            addons: activeAddons.map((addon) => ({
              key: addon.addon_key,
              quantity: parseInt(addon.quantity, 10) || 0,
              unitPriceMonthly:
                addon.unit_price_monthly != null ? Number(addon.unit_price_monthly) : null,
            })),
            renewal: true,
          }),
        ]
      )

      await client.query(
        `UPDATE billing_payment SET
          invoice_id = $1,
          provider_payment_id = $2,
          status = 'SUCCEEDED',
          updated_at = now()
         WHERE id = $3`,
        [invoiceRows[0]?.id || null, chargeResult.providerPaymentId, renewalPaymentId]
      )

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
      try {
        await invalidateTenantSubscriptionCache(subscription.tenant_id, subscription.tenant_type)
      } catch (err) {
        logger.error('Failed to invalidate subscription cache after auto-renewal', {
          tenantId: subscription.tenant_id,
          tenantType: subscription.tenant_type,
          error: err.message,
        })
      }
      notifyBillingRenewed({
        tenantId: subscription.tenant_id,
        tenantType: subscription.tenant_type,
        periodEnd: periodEnd?.toISOString?.()?.slice(0, 10) || String(periodEnd),
      }).catch(() => {})
      return { renewed: true }
    }
    return { skipped: true, reason: 'already_renewed' }
  }

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE billing_payment SET
        status = 'FAILED',
        provider_payment_id = $1,
        failure_code = $2,
        failure_message = $3,
        updated_at = now()
       WHERE id = $4`,
      [
        chargeResult.providerPaymentId || null,
        chargeResult.failureCode || null,
        chargeResult.failureMessage || null,
        renewalPaymentId,
      ]
    )
    const locked = await lockDueSubscription(client, subscription.id)
    if (!locked) return
    await markSubscriptionPastDue(client, subscription.id)
  })
  notifyBillingPaymentFailed({
    tenantId: subscription.tenant_id,
    tenantType: subscription.tenant_type,
    reason: chargeResult.failureCode || 'payment declined',
  }).catch(() => {})
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

      if (didLock) {
        locked++
        notifyBillingAccountLocked({
          tenantId: sub.tenant_id,
          tenantType: sub.tenant_type,
          reason: 'payment overdue grace period expired',
        }).catch(() => {})
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
