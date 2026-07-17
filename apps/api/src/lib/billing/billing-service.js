import crypto from 'node:crypto'
import { query, withTransaction } from '../db.js'
import { logger } from '../logger.js'
import { getCache, setCache, deleteCache } from '../cache.js'
import { singleflight } from '../singleflight.js'
import { getBillingGateway } from './gateway-registry.js'
import {
  GRACE_PERIOD_DAYS,
  LOCK_REASON_PENDING_ACTIVATION,
  LOCK_REASON_FREE_SANDBOX_EXPIRED,
} from './constants.js'
import { clampFreeTrialDays, getFreeSandboxDays } from '../platform-settings.js'
import { formatPlanDisplayName } from '../plan-codes.js'
import {
  annualizeAddonMonthlyAmount,
  defaultAddonUnitPrice,
  getActiveTenantAddons,
} from '../subscription-addons.js'
import { t, resolveLocale } from '../../i18n/index.js'

function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function generateInvoiceNumber() {
  const ts = Date.now().toString(36).toUpperCase()
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase()
  return `SUB-${ts}-${rand}`
}

async function recordBillingEvent(
  client,
  { subscriptionId, tenantId, tenantType, eventType, payload }
) {
  await client.query(
    `INSERT INTO billing_event (subscription_id, tenant_id, tenant_type, event_type, payload)
     VALUES ($1, $2, $3, $4, $5)`,
    [subscriptionId, tenantId, tenantType, eventType, JSON.stringify(payload || {})]
  )
}

const BILLING_SUB_CACHE_TTL_SECONDS = 180

function billingSubCacheKey(tenantId, tenantType) {
  return `billingSub:${tenantId}:${tenantType}`
}

/** Clear Redis cache used by getSubscriptionForBilling / GET /api/billing/status. */
export async function invalidateBillingSubscriptionCache(tenantId, tenantType) {
  await deleteCache(billingSubCacheKey(tenantId, tenantType)).catch(() => {})
}

/**
 * Latest subscription row for tenant (any non-cancelled status).
 */
export async function getSubscriptionForBilling(tenantId, tenantType) {
  const cacheKey = billingSubCacheKey(tenantId, tenantType)
  const cached = await getCache(cacheKey)
  if (cached !== null) return cached === 'null' ? null : cached

  return singleflight(cacheKey, async () => {
    const again = await getCache(cacheKey)
    if (again !== null) return again === 'null' ? null : again

    const { rows } = await query(
      `SELECT s.*, sp.code AS plan_code, sp.price_per_month, sp.price_per_year
     FROM subscription s
     LEFT JOIN subscription_plan sp ON sp.id = s.plan_id
     WHERE s.tenant_id = $1 AND s.tenant_type = $2
       AND s.status NOT IN ('CANCELLED')
     ORDER BY s.created_at DESC
     LIMIT 1`,
      [tenantId, tenantType]
    )
    const row = rows[0] || null
    await setCache(cacheKey, row ?? 'null', BILLING_SUB_CACHE_TTL_SECONDS).catch(() => {})
    return row
  })
}

export function computeBillingAccessState(subscription) {
  if (!subscription) {
    return {
      requiresPayment: false,
      isPastDue: false,
      inGracePeriod: false,
      isLocked: false,
      daysUntilLock: null,
      gracePeriodEndsAt: null,
    }
  }

  const planCode = (subscription.plan_code || '').toLowerCase()
  const isFree = planCode === 'free' || !subscription.plan_id
  const lockedAt = subscription.account_locked_at ? new Date(subscription.account_locked_at) : null
  const graceEnd = subscription.grace_period_ends_at
    ? new Date(subscription.grace_period_ends_at)
    : null
  const now = new Date()
  const isPastDue =
    subscription.status === 'PAST_DUE' || Boolean(subscription.past_due_since) || Boolean(lockedAt)
  const inGracePeriod = isPastDue && graceEnd && now < graceEnd && !lockedAt
  const isLocked = Boolean(lockedAt) || subscription.status === 'SUSPENDED'
  let daysUntilLock = null
  if (inGracePeriod && graceEnd) {
    daysUntilLock = Math.max(
      0,
      Math.ceil((graceEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
    )
  }

  const lockReason = subscription.lock_reason || null
  const pendingActivation = lockReason === LOCK_REASON_PENDING_ACTIVATION
  const freeSandboxExpired = lockReason === LOCK_REASON_FREE_SANDBOX_EXPIRED
  const freeSandboxExpiresAt = subscription.free_sandbox_expires_at
    ? new Date(subscription.free_sandbox_expires_at)
    : null
  let freeSandboxDaysRemaining = null
  if (isFree && freeSandboxExpiresAt && !freeSandboxExpired) {
    freeSandboxDaysRemaining = Math.max(
      0,
      Math.ceil((freeSandboxExpiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
    )
  }

  return {
    requiresPayment: !isFree,
    isPastDue: pendingActivation ? false : isPastDue,
    inGracePeriod: pendingActivation ? false : inGracePeriod,
    isLocked,
    pendingActivation,
    freeSandboxExpired,
    freeSandboxExpiresAt: freeSandboxExpiresAt ? freeSandboxExpiresAt.toISOString() : null,
    freeSandboxDaysRemaining,
    daysUntilLock,
    gracePeriodEndsAt: graceEnd ? graceEnd.toISOString() : null,
    pastDueSince: subscription.past_due_since
      ? new Date(subscription.past_due_since).toISOString()
      : null,
    lockReason,
    autoRenew: subscription.auto_renew !== false,
  }
}

/** Platform admins have no tenant subscription; stable unlocked shell for GET /status. */
export function buildPlatformAdminBillingStatus(gateways = []) {
  return {
    subscription: null,
    access: {
      ...computeBillingAccessState(null),
      pendingActivation: false,
      freeSandboxExpired: false,
      lockReason: null,
    },
    paymentMethods: [],
    defaultPaymentMethod: null,
    openInvoices: [],
    amountDue: 0,
    gracePeriodDays: GRACE_PERIOD_DAYS,
    gateways,
  }
}

export async function getBillingStatus(tenantId, tenantType) {
  // Subscription (cached), payment methods, and open invoices are all independent Ã¢â‚¬â€ fetch in parallel.
  let subscription, paymentMethods, openInvoices, defaultPaymentMethod
  try {
    const [sub, pmRes, invRes] = await Promise.all([
      getSubscriptionForBilling(tenantId, tenantType),
      query(
        `SELECT id, provider, type, brand, last4, exp_month, exp_year, bank_name, is_default, status, created_at
         FROM billing_payment_method
         WHERE tenant_id = $1 AND tenant_type = $2 AND status = 'ACTIVE'
         ORDER BY is_default DESC, created_at DESC`,
        [tenantId, tenantType]
      ),
      query(
        `SELECT id, invoice_number, amount, currency, status, due_date, billing_cycle, plan_name, period_start, period_end, created_at
         FROM billing_invoice
         WHERE tenant_id = $1 AND tenant_type = $2 AND status = 'OPEN'
         ORDER BY due_date ASC`,
        [tenantId, tenantType]
      ),
    ])
    subscription = sub
    paymentMethods = pmRes.rows
    openInvoices = invRes.rows
    defaultPaymentMethod = paymentMethods.find((p) => p.is_default) || paymentMethods[0] || null
  } catch (e) {
    if (e.code !== '42P01') throw e
    subscription = await getSubscriptionForBilling(tenantId, tenantType)
    paymentMethods = []
    openInvoices = []
    defaultPaymentMethod = null
  }

  const access = computeBillingAccessState(subscription)
  const activeAddons = subscription ? await getActiveTenantAddons(tenantId, tenantType) : []
  const recurringTotal = subscription
    ? calculateRecurringSubscriptionTotal(
        {
          code: subscription.plan_code,
          price_per_month: subscription.price_per_month,
          price_per_year: subscription.price_per_year,
        },
        subscription.billing_cycle || 'MONTHLY',
        activeAddons
      )
    : { baseAmount: 0, addonAmount: 0, totalAmount: 0 }

  const amountDue = openInvoices.reduce((sum, inv) => sum + Number(inv.amount || 0), 0)

  return {
    subscription: subscription
      ? {
          id: subscription.id,
          status: subscription.status,
          planId: subscription.plan_id,
          planName: formatPlanDisplayName(subscription.plan_code, subscription.plan_name),
          planCode: subscription.plan_code,
          billingCycle: subscription.billing_cycle,
          nextBillingDate: subscription.next_billing_date,
          currentPeriodEnd: subscription.current_period_end,
          trialTargetPlanId: subscription.trial_target_plan_id || null,
          autoRenew: subscription.auto_renew !== false,
        }
      : null,
    access,
    paymentMethods,
    defaultPaymentMethod,
    openInvoices,
    amountDue,
    recurringTotal,
    addons: activeAddons.map((addon) => ({
      key: addon.addon_key,
      quantity: parseInt(addon.quantity, 10) || 0,
      unitPriceMonthly:
        addon.unit_price_monthly != null
          ? Number(addon.unit_price_monthly)
          : defaultAddonUnitPrice(addon.addon_key, subscription?.plan_code),
      status: addon.status,
    })),
    gracePeriodDays: GRACE_PERIOD_DAYS,
    availableGateways: [process.env.BILLING_GATEWAY || 'stub'],
  }
}

export async function listPaymentMethods(tenantId, tenantType) {
  const { rows } = await query(
    `SELECT id, provider, type, brand, last4, exp_month, exp_year, bank_name, is_default, status, created_at
     FROM billing_payment_method
     WHERE tenant_id = $1 AND tenant_type = $2 AND status = 'ACTIVE'
     ORDER BY is_default DESC, created_at DESC`,
    [tenantId, tenantType]
  )
  return rows
}

export async function addPaymentMethod(
  tenantId,
  tenantType,
  { type, card, provider, setAsDefault }
) {
  const gateway = getBillingGateway(provider)
  const tokenized = await gateway.tokenizePaymentMethod({ type, card })

  return withTransaction(async (client) => {
    if (setAsDefault) {
      await client.query(
        `UPDATE billing_payment_method SET is_default = false, updated_at = now()
         WHERE tenant_id = $1 AND tenant_type = $2 AND status = 'ACTIVE'`,
        [tenantId, tenantType]
      )
    }

    const { rows } = await client.query(
      `INSERT INTO billing_payment_method (
        tenant_id, tenant_type, provider, provider_customer_id, provider_payment_method_id,
        type, brand, last4, exp_month, exp_year, bank_name, is_default
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        tenantId,
        tenantType,
        gateway.id,
        tokenized.providerCustomerId,
        tokenized.providerPaymentMethodId,
        tokenized.type,
        tokenized.brand,
        tokenized.last4,
        tokenized.expMonth ?? null,
        tokenized.expYear ?? null,
        tokenized.bankName ?? null,
        Boolean(setAsDefault),
      ]
    )

    const method = rows[0]
    const sub = await getSubscriptionForBilling(tenantId, tenantType)
    if (sub && setAsDefault) {
      await client.query(
        `UPDATE subscription SET default_payment_method_id = $1, updated_at = now() WHERE id = $2`,
        [method.id, sub.id]
      )
    }

    await recordBillingEvent(client, {
      subscriptionId: sub?.id,
      tenantId,
      tenantType,
      eventType: 'payment_method.added',
      payload: { paymentMethodId: method.id, provider: gateway.id, type: tokenized.type },
    })

    return method
  })
}

export async function removePaymentMethod(tenantId, tenantType, paymentMethodId) {
  const { rowCount } = await query(
    `UPDATE billing_payment_method SET status = 'REMOVED', is_default = false, updated_at = now()
     WHERE id = $1 AND tenant_id = $2 AND tenant_type = $3 AND status = 'ACTIVE'`,
    [paymentMethodId, tenantId, tenantType]
  )
  return rowCount > 0
}

function resolvePlanAmount(plan, billingCycle) {
  if (!plan) return 0
  if (billingCycle === 'YEARLY') {
    return Number(plan.price_per_year) || Number(plan.price_per_month) * 12
  }
  return Number(plan.price_per_month) || 0
}

export function calculateAddonRecurringAmount(addons = [], planCode, billingCycle = 'MONTHLY') {
  return addons.reduce((sum, addon) => {
    const qty = parseInt(addon.quantity, 10) || 0
    if (qty <= 0) return sum
    const monthly =
      addon.unit_price_monthly != null
        ? Number(addon.unit_price_monthly)
        : Number(defaultAddonUnitPrice(addon.addon_key, planCode) || 0)
    if (!monthly || monthly <= 0) return sum
    const amount = billingCycle === 'YEARLY' ? annualizeAddonMonthlyAmount(monthly) : monthly
    return sum + amount * qty
  }, 0)
}

export function calculateRecurringSubscriptionTotal(plan, billingCycle = 'MONTHLY', addons = []) {
  const baseAmount = resolvePlanAmount(plan, billingCycle)
  const addonAmount = calculateAddonRecurringAmount(addons, plan?.code, billingCycle)
  return {
    baseAmount,
    addonAmount,
    totalAmount: baseAmount + addonAmount,
  }
}

async function createOpenInvoice(
  client,
  {
    subscription,
    tenantId,
    tenantType,
    amount,
    billingCycle,
    plan,
    periodStart,
    periodEnd,
    metadata = {},
  }
) {
  const dueDate = new Date()
  const { rows } = await client.query(
    `INSERT INTO billing_invoice (
      subscription_id, tenant_id, tenant_type, invoice_number, amount, currency,
      billing_cycle, plan_id, plan_name, status, period_start, period_end, due_date, metadata
    ) VALUES ($1, $2, $3, $4, $5, 'USD', $6, $7, $8, 'OPEN', $9, $10, $11, $12)
    RETURNING *`,
    [
      subscription.id,
      tenantId,
      tenantType,
      generateInvoiceNumber(),
      amount,
      billingCycle,
      plan?.id || subscription.plan_id,
      plan?.name || subscription.plan_name,
      periodStart,
      periodEnd,
      dueDate,
      JSON.stringify(metadata || {}),
    ]
  )
  return rows[0]
}

/**
 * Checkout: plan change + charge (upgrade/downgrade with payment).
 */
export async function checkoutSubscription({
  tenantId,
  tenantType,
  planId,
  billingCycle,
  paymentMethodId,
  idempotencyKey,
  provider,
  trialTargetPlanId = null,
}) {
  const { rows: planRows } = await query(
    `SELECT * FROM subscription_plan WHERE id = $1 AND tenant_type = $2 AND is_active = true`,
    [planId, tenantType]
  )
  if (planRows.length === 0) {
    throw Object.assign(new Error('Plan not found'), { name: 'NOT_FOUND' })
  }
  const plan = planRows[0]
  if ((plan.code || '').toLowerCase() === 'free') {
    return applyFreePlan(tenantId, tenantType, plan, { trialTargetPlanId })
  }

  const subscription = await getSubscriptionForBilling(tenantId, tenantType)
  if (!subscription) {
    throw Object.assign(new Error('No subscription found'), { name: 'NOT_FOUND' })
  }
  const previousPlanId = subscription.plan_id
  const activeAddons = await getActiveTenantAddons(tenantId, tenantType)
  const recurringTotal = calculateRecurringSubscriptionTotal(plan, billingCycle, activeAddons)
  const amount = recurringTotal.totalAmount
  if (amount <= 0) {
    throw Object.assign(new Error('Plan has no price configured'), { name: 'BAD_REQUEST' })
  }

  const periodStart = new Date()
  const periodEnd = billingCycle === 'YEARLY' ? addDays(periodStart, 365) : addDays(periodStart, 30)

  let chargeAmount = amount
  let referralAttributionId = null
  if (tenantType === 'RESTAURANT') {
    const { applyReferralDiscountToAmount } = await import(
      '../../services/referral-conversion.service.js'
    )
    const discount = await applyReferralDiscountToAmount(tenantId, amount)
    chargeAmount = discount.amount
    referralAttributionId = discount.attributionId
  }

  return withTransaction(async (client) => {
    if (tenantType === 'SUPPLIER') {
      const { applyPlatformBillingCredits } = await import(
        '../../services/referral-conversion.service.js'
      )
      const credit = await applyPlatformBillingCredits(tenantId, tenantType, chargeAmount, client)
      chargeAmount = credit.amountDue
    }

    const invoice = await createOpenInvoice(client, {
      subscription,
      tenantId,
      tenantType,
      amount: chargeAmount,
      billingCycle,
      plan,
      periodStart,
      periodEnd,
      metadata: {
        baseAmount: recurringTotal.baseAmount,
        addonAmount: recurringTotal.addonAmount,
        addons: activeAddons.map((addon) => ({
          key: addon.addon_key,
          quantity: parseInt(addon.quantity, 10) || 0,
          unitPriceMonthly:
            addon.unit_price_monthly != null
              ? Number(addon.unit_price_monthly)
              : defaultAddonUnitPrice(addon.addon_key, plan.code),
        })),
      },
    })

    const paymentResult = await processInvoicePayment(client, {
      invoice,
      subscription,
      tenantId,
      tenantType,
      paymentMethodId,
      idempotencyKey: idempotencyKey || `checkout_${invoice.id}`,
      provider,
    })

    if (!paymentResult.success) {
      throw Object.assign(new Error(paymentResult.failureMessage || 'Payment failed'), {
        name: 'PAYMENT_FAILED',
        details: paymentResult,
      })
    }

    await applyPaidSubscription(client, {
      subscriptionId: subscription.id,
      tenantId,
      tenantType,
      plan,
      billingCycle,
      periodStart,
      periodEnd,
    })

    if (tenantType === 'RESTAURANT') {
      const { markReferralDiscountUsed, processReferralConversion } = await import(
        '../../services/referral-conversion.service.js'
      )
      if (referralAttributionId) {
        await markReferralDiscountUsed(referralAttributionId, client)
      }
      await processReferralConversion({ restaurantId: tenantId, planCode: plan.code, client })
    }

    const { notifyBillingActivated, notifyBillingPlanChanged } = await import(
      '../../services/notification.service.js'
    )
    notifyBillingActivated({
      tenantId,
      tenantType,
      planName: plan.name,
    }).catch(() => {})
    if (previousPlanId && previousPlanId !== plan.id) {
      const { rows: prevPlanRows } = await query(
        'SELECT name FROM subscription_plan WHERE id = $1',
        [previousPlanId]
      )
      notifyBillingPlanChanged({
        tenantId,
        tenantType,
        planName: plan.name,
        previousPlanName: prevPlanRows[0]?.name || null,
      }).catch(() => {})
    }

    return {
      success: true,
      invoice,
      payment: paymentResult.payment,
      subscription: await getSubscriptionForBilling(tenantId, tenantType),
    }
  })
}

async function resolveTrialTargetPlan(tenantType, trialTargetPlanId) {
  if (trialTargetPlanId) {
    const { rows } = await query(
      `SELECT id, code, name, price_per_month, price_per_year
       FROM subscription_plan
       WHERE id = $1 AND tenant_type = $2 AND is_active = true
         AND code NOT IN ('free', 'enterprise')
         AND COALESCE(requires_admin_assignment, false) = false
       LIMIT 1`,
      [trialTargetPlanId, tenantType]
    )
    if (!rows.length) {
      throw Object.assign(new Error('Trial target plan not found'), { name: 'NOT_FOUND' })
    }
    return rows[0]
  }

  const { rows } = await query(
    `SELECT id, code, name, price_per_month, price_per_year
     FROM subscription_plan
     WHERE tenant_type = $1 AND code = $2 AND is_active = true
     LIMIT 1`,
    [tenantType, tenantType === 'RESTAURANT' ? 'silver' : 'gold']
  )
  return rows[0] || null
}

async function applyFreePlan(tenantId, tenantType, plan, { trialTargetPlanId = null } = {}) {
  const subscription = await getSubscriptionForBilling(tenantId, tenantType)
  if (!subscription) return null
  const wasPendingActivation = subscription.lock_reason === LOCK_REASON_PENDING_ACTIVATION
  const sandboxDays = await getFreeSandboxDays()
  const targetPlan = await resolveTrialTargetPlan(tenantType, trialTargetPlanId)
  await query(
    `UPDATE subscription SET
      plan_id = $1, plan_name = $2, status = 'ACTIVE', billing_cycle = 'MONTHLY',
      trial_target_plan_id = COALESCE($5, trial_target_plan_id),
      past_due_since = NULL, grace_period_ends_at = NULL,
      account_locked_at = NULL,
      lock_reason = NULL,
      free_sandbox_expires_at = now() + ($4::int * INTERVAL '1 day'),
      current_period_start = now(), current_period_end = now() + INTERVAL '1 month',
      next_billing_date = NULL, updated_at = now()
     WHERE id = $3`,
    [plan.id, plan.name, subscription.id, sandboxDays, targetPlan?.id || null]
  )
  if (wasPendingActivation) {
    await query(
      `INSERT INTO billing_event (subscription_id, tenant_id, tenant_type, event_type, payload)
       VALUES ($1, $2, $3, 'account.activated', $4)`,
      [
        subscription.id,
        tenantId,
        tenantType,
        JSON.stringify({
          planCode: plan.code,
          unlockedBy: 'free_plan',
          trialTargetPlanId: targetPlan?.id || null,
          trialTargetPlanCode: targetPlan?.code || null,
        }),
      ]
    )
  }
  await invalidateBillingSubscriptionCache(tenantId, tenantType)
  const updatedSub = await getSubscriptionForBilling(tenantId, tenantType)
  if (wasPendingActivation) {
    const { notifyBillingTrialStarted } = await import('../../services/notification.service.js')
    notifyBillingTrialStarted({
      tenantId,
      tenantType,
      planName: plan.name,
      trialEndsAt: updatedSub?.free_sandbox_expires_at
        ? new Date(updatedSub.free_sandbox_expires_at).toLocaleDateString()
        : null,
    }).catch(() => {})
  }
  return {
    success: true,
    plan: plan.code,
    trialTargetPlan: targetPlan
      ? {
          id: targetPlan.id,
          code: targetPlan.code,
          name: targetPlan.name,
          pricePerMonth: Number(targetPlan.price_per_month || 0),
          pricePerYear: Number(targetPlan.price_per_year || 0),
        }
      : null,
    pendingActivation: false,
    activated: wasPendingActivation,
    freeSandboxDays: sandboxDays,
  }
}

async function getPaymentMethodForCharge(client, tenantId, tenantType, paymentMethodId) {
  if (paymentMethodId) {
    const { rows } = await client.query(
      `SELECT * FROM billing_payment_method
       WHERE id = $1 AND tenant_id = $2 AND tenant_type = $3 AND status = 'ACTIVE'`,
      [paymentMethodId, tenantId, tenantType]
    )
    if (rows.length === 0)
      throw Object.assign(new Error('Payment method not found'), { name: 'NOT_FOUND' })
    return rows[0]
  }
  const { rows } = await client.query(
    `SELECT * FROM billing_payment_method
     WHERE tenant_id = $1 AND tenant_type = $2 AND status = 'ACTIVE'
     ORDER BY is_default DESC, created_at DESC LIMIT 1`,
    [tenantId, tenantType]
  )
  if (rows.length === 0) {
    throw Object.assign(new Error('No payment method on file'), { name: 'NO_PAYMENT_METHOD' })
  }
  return rows[0]
}

async function processInvoicePayment(
  client,
  { invoice, subscription, tenantId, tenantType, paymentMethodId, idempotencyKey, provider }
) {
  const method = await getPaymentMethodForCharge(client, tenantId, tenantType, paymentMethodId)
  const gateway = getBillingGateway(provider || method.provider)
  const amount = Number(invoice.amount)

  const { rows: existing } = await client.query(
    `SELECT id, status FROM billing_payment WHERE idempotency_key = $1`,
    [idempotencyKey]
  )
  if (existing.length > 0 && existing[0].status === 'SUCCEEDED') {
    return { success: true, payment: existing[0], duplicate: true }
  }

  const { rows: paymentRows } = await client.query(
    `INSERT INTO billing_payment (
      invoice_id, subscription_id, tenant_id, tenant_type, payment_method_id,
      provider, amount, currency, status, idempotency_key
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'USD', 'PROCESSING', $8)
    ON CONFLICT (idempotency_key) DO UPDATE SET updated_at = now()
    RETURNING *`,
    [
      invoice.id,
      subscription.id,
      tenantId,
      tenantType,
      method.id,
      gateway.id,
      amount,
      idempotencyKey,
    ]
  )
  const payment = paymentRows[0]

  const chargeResult = await gateway.charge({
    amount,
    currency: invoice.currency || 'USD',
    providerPaymentMethodId: method.provider_payment_method_id,
    idempotencyKey,
    metadata: { invoiceId: invoice.id, subscriptionId: subscription.id },
  })

  if (chargeResult.status === 'succeeded') {
    await client.query(
      `UPDATE billing_payment SET status = 'SUCCEEDED', provider_payment_id = $1, updated_at = now() WHERE id = $2`,
      [chargeResult.providerPaymentId, payment.id]
    )
    await client.query(
      `UPDATE billing_invoice SET status = 'PAID', paid_at = now(), updated_at = now() WHERE id = $1`,
      [invoice.id]
    )
    await client.query(
      `UPDATE subscription SET
        last_payment_at = now(), last_payment_failed_at = NULL,
        past_due_since = NULL, grace_period_ends_at = NULL,
        account_locked_at = NULL, lock_reason = NULL,
        status = CASE WHEN status IN ('PAST_DUE', 'SUSPENDED') THEN 'ACTIVE' ELSE status END,
        updated_at = now()
       WHERE id = $1`,
      [subscription.id]
    )
    await recordBillingEvent(client, {
      subscriptionId: subscription.id,
      tenantId,
      tenantType,
      eventType: 'payment.succeeded',
      payload: { paymentId: payment.id, invoiceId: invoice.id, amount },
    })
    return { success: true, payment }
  }

  await client.query(
    `UPDATE billing_payment SET status = 'FAILED', provider_payment_id = $1,
      failure_code = $2, failure_message = $3, updated_at = now() WHERE id = $4`,
    [
      chargeResult.providerPaymentId,
      chargeResult.failureCode,
      chargeResult.failureMessage,
      payment.id,
    ]
  )
  await markSubscriptionPastDue(client, subscription.id)
  await recordBillingEvent(client, {
    subscriptionId: subscription.id,
    tenantId,
    tenantType,
    eventType: 'payment.failed',
    payload: {
      paymentId: payment.id,
      invoiceId: invoice.id,
      failureCode: chargeResult.failureCode,
    },
  })
  return {
    success: false,
    payment,
    failureCode: chargeResult.failureCode,
    failureMessage: chargeResult.failureMessage,
  }
}

async function applyPaidSubscription(
  client,
  { subscriptionId, tenantId, tenantType, plan, billingCycle, periodStart, periodEnd }
) {
  await client.query(
    `UPDATE subscription SET
      plan_id = $1, plan_name = $2, status = 'ACTIVE', billing_cycle = $3,
      current_period_start = $4, current_period_end = $5,
      next_billing_date = $5,
      past_due_since = NULL, grace_period_ends_at = NULL,
      account_locked_at = NULL, lock_reason = NULL,
      updated_at = now()
     WHERE id = $6`,
    [plan.id, plan.name, billingCycle, periodStart, periodEnd, subscriptionId]
  )
  await recordBillingEvent(client, {
    subscriptionId,
    tenantId,
    tenantType,
    eventType: 'subscription.paid',
    payload: { planCode: plan.code, billingCycle },
  })
}

export async function payOpenInvoices({
  tenantId,
  tenantType,
  paymentMethodId,
  idempotencyKey,
  provider,
}) {
  const { rows: invoices } = await query(
    `SELECT * FROM billing_invoice
     WHERE tenant_id = $1 AND tenant_type = $2 AND status = 'OPEN'
     ORDER BY due_date ASC`,
    [tenantId, tenantType]
  )
  if (invoices.length === 0) {
    throw Object.assign(new Error('No open invoices'), { name: 'NOT_FOUND' })
  }

  const subscription = await getSubscriptionForBilling(tenantId, tenantType)
  if (!subscription) {
    throw Object.assign(new Error('No subscription'), { name: 'NOT_FOUND' })
  }

  const results = []
  for (const invoice of invoices) {
    const result = await withTransaction((client) =>
      processInvoicePayment(client, {
        invoice,
        subscription,
        tenantId,
        tenantType,
        paymentMethodId,
        idempotencyKey: idempotencyKey
          ? `${idempotencyKey}_${invoice.id}`
          : `pay_${invoice.id}_${Date.now()}`,
        provider,
      })
    )
    results.push({ invoiceId: invoice.id, ...result })
    if (!result.success) break
  }

  const allPaid = results.every((r) => r.success)
  if (allPaid) {
    const { rows: planRows } = await query('SELECT * FROM subscription_plan WHERE id = $1', [
      subscription.plan_id,
    ])
    if (planRows[0]) {
      const cycle = subscription.billing_cycle || 'MONTHLY'
      const periodStart = new Date()
      const periodEnd = cycle === 'YEARLY' ? addDays(periodStart, 365) : addDays(periodStart, 30)
      await withTransaction((client) =>
        applyPaidSubscription(client, {
          subscriptionId: subscription.id,
          tenantId,
          tenantType,
          plan: planRows[0],
          billingCycle: cycle,
          periodStart,
          periodEnd,
        })
      )
    }
  }

  return { results, allPaid }
}

export async function markSubscriptionPastDue(client, subscriptionId) {
  const graceEnd = addDays(new Date(), GRACE_PERIOD_DAYS)
  await client.query(
    `UPDATE subscription SET
      status = 'PAST_DUE',
      past_due_since = COALESCE(past_due_since, now()),
      grace_period_ends_at = COALESCE(grace_period_ends_at, $2),
      last_payment_failed_at = now(),
      updated_at = now()
     WHERE id = $1`,
    [subscriptionId, graceEnd]
  )
}

export async function lockSubscriptionAccount(client, subscriptionId, reason) {
  await client.query(
    `UPDATE subscription SET
      status = 'SUSPENDED',
      account_locked_at = COALESCE(account_locked_at, now()),
      lock_reason = COALESCE(lock_reason, $2),
      updated_at = now()
     WHERE id = $1`,
    [subscriptionId, reason || 'payment_overdue']
  )
}

async function recordAccountUnlockedEvent(
  subscriptionId,
  { tenantId, tenantType },
  { unlockedBy, adminUserId, payload = {} }
) {
  await query(
    `INSERT INTO billing_event (subscription_id, tenant_id, tenant_type, event_type, payload)
     VALUES ($1, $2, $3, 'account.unlocked', $4)`,
    [subscriptionId, tenantId, tenantType, JSON.stringify({ unlockedBy, adminUserId, ...payload })]
  )
}

/**
 * Extend Free Trial expiry, clear lock. Only for plan code `free`.
 */
export async function extendFreeSandboxTrial(
  subscriptionId,
  { days, adminUserId = null, unlockedBy = 'admin' } = {}
) {
  const { rows } = await query(
    `SELECT s.*, sp.code AS plan_code
     FROM subscription s
     JOIN subscription_plan sp ON sp.id = s.plan_id
     WHERE s.id = $1`,
    [subscriptionId]
  )
  const sub = rows[0]
  if (!sub) {
    const err = new Error('Subscription not found')
    err.code = 'NOT_FOUND'
    throw err
  }
  if (sub.plan_code !== 'free') {
    const err = new Error('Free Trial extension applies only to Free Trial subscriptions')
    err.code = 'VALIDATION_ERROR'
    throw err
  }

  const defaultDays = await getFreeSandboxDays()
  const trialDays = clampFreeTrialDays(days, defaultDays)

  await query(
    `UPDATE subscription SET
      status = 'ACTIVE',
      past_due_since = NULL,
      grace_period_ends_at = NULL,
      account_locked_at = NULL,
      lock_reason = NULL,
      free_sandbox_expires_at = now() + ($2::int * INTERVAL '1 day'),
      updated_at = now()
     WHERE id = $1`,
    [subscriptionId, trialDays]
  )

  await query(
    `INSERT INTO billing_event (subscription_id, tenant_id, tenant_type, event_type, payload)
     VALUES ($1, $2, $3, 'free_trial.extended', $4)`,
    [
      subscriptionId,
      sub.tenant_id,
      sub.tenant_type,
      JSON.stringify({ unlockedBy, adminUserId, freeTrialDays: trialDays }),
    ]
  )

  const { rows: updatedRows } = await query('SELECT * FROM subscription WHERE id = $1', [
    subscriptionId,
  ])
  const { notifyBillingTrialExtended } = await import('../../services/notification.service.js')
  notifyBillingTrialExtended({
    tenantId: sub.tenant_id,
    tenantType: sub.tenant_type,
    trialDays,
    trialEndsAt: updatedRows[0]?.free_sandbox_expires_at
      ? new Date(updatedRows[0].free_sandbox_expires_at).toLocaleDateString()
      : null,
  }).catch(() => {})
  return {
    subscription: updatedRows[0],
    freeTrialDays: trialDays,
    freeSandboxExpiresAt: updatedRows[0]?.free_sandbox_expires_at ?? null,
  }
}

export async function unlockSubscriptionAccount(
  subscriptionId,
  { unlockedBy = 'payment', adminUserId = null, extendFreeTrialDays = undefined } = {}
) {
  const { rows } = await query(
    `SELECT s.*, sp.code AS plan_code
     FROM subscription s
     LEFT JOIN subscription_plan sp ON sp.id = s.plan_id
     WHERE s.id = $1`,
    [subscriptionId]
  )
  const sub = rows[0]
  if (!sub) return

  const shouldExtendFreeTrial =
    sub.plan_code === 'free' &&
    (extendFreeTrialDays !== undefined || sub.lock_reason === LOCK_REASON_FREE_SANDBOX_EXPIRED)

  if (shouldExtendFreeTrial) {
    const defaultDays = await getFreeSandboxDays()
    const trialDays =
      extendFreeTrialDays !== undefined
        ? clampFreeTrialDays(extendFreeTrialDays, defaultDays)
        : defaultDays

    await query(
      `UPDATE subscription SET
        status = 'ACTIVE',
        past_due_since = NULL,
        grace_period_ends_at = NULL,
        account_locked_at = NULL,
        lock_reason = NULL,
        free_sandbox_expires_at = now() + ($2::int * INTERVAL '1 day'),
        updated_at = now()
       WHERE id = $1`,
      [subscriptionId, trialDays]
    )

    await recordAccountUnlockedEvent(
      subscriptionId,
      { tenantId: sub.tenant_id, tenantType: sub.tenant_type },
      { unlockedBy, adminUserId, freeTrialDays: trialDays, freeTrialExtended: true }
    )
    const { rows: updatedRows } = await query(
      'SELECT free_sandbox_expires_at FROM subscription WHERE id = $1',
      [subscriptionId]
    )
    const { notifyBillingTrialExtended } = await import('../../services/notification.service.js')
    notifyBillingTrialExtended({
      tenantId: sub.tenant_id,
      tenantType: sub.tenant_type,
      trialDays,
      trialEndsAt: updatedRows[0]?.free_sandbox_expires_at
        ? new Date(updatedRows[0].free_sandbox_expires_at).toLocaleDateString()
        : null,
    }).catch(() => {})
    return
  }

  await query(
    `UPDATE subscription SET
      status = 'ACTIVE',
      past_due_since = NULL,
      grace_period_ends_at = NULL,
      account_locked_at = NULL,
      lock_reason = NULL,
      updated_at = now()
     WHERE id = $1`,
    [subscriptionId]
  )

  await recordAccountUnlockedEvent(
    subscriptionId,
    { tenantId: sub.tenant_id, tenantType: sub.tenant_type },
    { unlockedBy, adminUserId }
  )
}

export async function setAutoRenew(tenantId, tenantType, autoRenew) {
  const sub = await getSubscriptionForBilling(tenantId, tenantType)
  if (!sub) return null
  await query(`UPDATE subscription SET auto_renew = $1, updated_at = now() WHERE id = $2`, [
    Boolean(autoRenew),
    sub.id,
  ])
  return { autoRenew: Boolean(autoRenew) }
}

export function buildAccountLockedError(billingStatus, locale = 'en') {
  const lng = resolveLocale(locale)
  const access = billingStatus?.access ?? {}
  const pendingActivation = access.pendingActivation
  const freeSandboxExpired =
    access.freeSandboxExpired === true || access.lockReason === LOCK_REASON_FREE_SANDBOX_EXPIRED

  if (freeSandboxExpired) {
    return {
      name: 'ACCOUNT_LOCKED',
      code: 'freeTrialExpired',
      message: t('billing.errors.freeTrialExpired', lng),
      details: {
        amountDue: billingStatus?.amountDue ?? 0,
        gracePeriodEndsAt: access.gracePeriodEndsAt ?? null,
        lockReason: LOCK_REASON_FREE_SANDBOX_EXPIRED,
        pendingActivation: false,
        freeSandboxExpired: true,
        upgradeUrl: '/app/settings?tab=subscription',
      },
    }
  }

  return {
    name: 'ACCOUNT_LOCKED',
    code: pendingActivation ? 'pendingActivation' : 'paymentOverdue',
    message: pendingActivation
      ? t('billing.errors.pendingActivation', lng)
      : t('billing.errors.paymentOverdue', lng),
    details: {
      amountDue: billingStatus?.amountDue ?? 0,
      gracePeriodEndsAt: access.gracePeriodEndsAt ?? null,
      lockReason: access.lockReason ?? null,
      pendingActivation: Boolean(pendingActivation),
      upgradeUrl: pendingActivation ? '/app/activate' : '/app/settings?tab=subscription',
    },
  }
}
