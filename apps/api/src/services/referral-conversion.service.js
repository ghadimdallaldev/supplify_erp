import { query } from '../lib/db.js'
import { getReferralProgramConfig } from '../lib/platform-settings.js'
import { notifyTenantUsers } from './notification/in-app.js'

function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export async function getActiveReferralAttribution(restaurantId) {
  const { rows } = await query(
    `SELECT * FROM supplier_referral_attribution
     WHERE restaurant_id = $1
       AND (referral_expires_at IS NULL OR referral_expires_at > now())
       AND first_paid_discount_used = false
     ORDER BY created_at DESC LIMIT 1`,
    [restaurantId]
  )
  return rows[0] || null
}

export async function applyReferralDiscountToAmount(restaurantId, amount) {
  const attr = await getActiveReferralAttribution(restaurantId)
  if (!attr) return { amount, discountPercent: 0, attributionId: null }
  const pct = Number(attr.first_paid_discount_percent) || 0
  if (pct <= 0) return { amount, discountPercent: 0, attributionId: attr.id }
  const discounted = Math.round(amount * (1 - pct / 100) * 100) / 100
  return { amount: discounted, discountPercent: pct, attributionId: attr.id }
}

export async function markReferralDiscountUsed(attributionId, client = query) {
  const db = typeof client.query === 'function' ? client : { query: client }
  await db.query(
    `UPDATE supplier_referral_attribution SET first_paid_discount_used = true, updated_at = now()
     WHERE id = $1`,
    [attributionId]
  )
}

export async function processReferralConversion({ restaurantId, planCode, client = query }) {
  const db = typeof client.query === 'function' ? client : { query: client }
  const { rows } = await db.query(
    `SELECT * FROM supplier_referral_attribution
     WHERE restaurant_id = $1 AND converted_at IS NULL AND supplier_reward_status = 'pending'
     ORDER BY created_at ASC LIMIT 1`,
    [restaurantId]
  )
  if (!rows.length) return null

  const attr = rows[0]
  const config = await getReferralProgramConfig()

  await db.query(
    `UPDATE supplier_referral_attribution SET converted_at = now(), updated_at = now() WHERE id = $1`,
    [attr.id]
  )
  await db.query(
    `UPDATE supplier_customer_prospect SET lifecycle_status = 'converted', updated_at = now()
     WHERE id = $1`,
    [attr.prospect_id]
  )

  const rewardType = config.supplierRewardType || 'free_month'
  let rewardValue = null

  if (rewardType === 'free_month') {
    const { rows: subRows } = await db.query(
      `SELECT id, current_period_end FROM subscription
       WHERE tenant_id = $1 AND tenant_type = 'SUPPLIER' AND status NOT IN ('CANCELLED')
       ORDER BY created_at DESC LIMIT 1`,
      [attr.supplier_id]
    )
    if (subRows.length) {
      const newEnd = addDays(new Date(subRows[0].current_period_end || new Date()), 30)
      await db.query(
        `UPDATE subscription SET current_period_end = $2, next_billing_date = $2, updated_at = now()
         WHERE id = $1`,
        [subRows[0].id, newEnd]
      )
      rewardValue = 30
    }
  } else if (rewardType === 'account_credit') {
    const { rows: planRows } = await db.query(
      `SELECT sp.price_per_month FROM subscription s
       JOIN subscription_plan sp ON sp.id = s.plan_id
       WHERE s.tenant_id = $1 AND s.tenant_type = 'SUPPLIER' AND s.status NOT IN ('CANCELLED')
       ORDER BY s.created_at DESC LIMIT 1`,
      [attr.supplier_id]
    )
    const creditAmount = Number(planRows[0]?.price_per_month) || 0
    if (creditAmount > 0) {
      await db.query(
        `INSERT INTO platform_billing_credit (
           tenant_id, tenant_type, amount, remaining_amount, source, source_attribution_id, expires_at
         )
         VALUES ($1, 'SUPPLIER', $2, $2, 'referral_reward', $3, $4)`,
        [attr.supplier_id, creditAmount, attr.id, addDays(new Date(), 365)]
      )
      rewardValue = creditAmount
    }
  }

  await db.query(
    `UPDATE supplier_referral_attribution SET
       supplier_reward_status = 'granted',
       supplier_reward_type = $2,
       supplier_reward_value = $3,
       updated_at = now()
     WHERE id = $1`,
    [attr.id, rewardType, rewardValue]
  )

  await notifyTenantUsers({
    tenantId: attr.supplier_id,
    tenantType: 'SUPPLIER',
    notificationType: 'referral_reward_earned',
    title: 'Referral reward earned',
    message:
      rewardType === 'free_month'
        ? 'A referred restaurant converted — you earned 1 free month.'
        : 'A referred restaurant converted — account credit was added.',
    metadata: { restaurantId, attributionId: attr.id },
  }).catch(() => {})

  return { attributionId: attr.id, rewardType, rewardValue }
}

export async function applyPlatformBillingCredits(
  tenantId,
  tenantType,
  invoiceAmount,
  client = query
) {
  const db = typeof client.query === 'function' ? client : { query: client }
  const { rows } = await db.query(
    `SELECT * FROM platform_billing_credit
     WHERE tenant_id = $1 AND tenant_type = $2 AND remaining_amount > 0
       AND (expires_at IS NULL OR expires_at > now())
     ORDER BY created_at ASC`,
    [tenantId, tenantType]
  )
  let remaining = invoiceAmount
  let creditUsed = 0
  for (const credit of rows) {
    if (remaining <= 0) break
    const use = Math.min(Number(credit.remaining_amount), remaining)
    remaining -= use
    creditUsed += use
    await db.query(
      `UPDATE platform_billing_credit SET remaining_amount = remaining_amount - $2 WHERE id = $1`,
      [credit.id, use]
    )
  }
  return { amountDue: remaining, creditUsed }
}
