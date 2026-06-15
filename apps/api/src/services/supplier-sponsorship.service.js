import { query, withTransaction } from '../lib/db.js'
import { ValidationError, NotFoundError } from '../middlewares/errorHandler.js'
import { getReferralProgramConfig } from '../lib/platform-settings.js'
import { getSubscriptionForBilling } from '../lib/billing/billing-service.js'
import { notifyTenantUsers } from './notification/in-app.js'
import { writeAuditLog } from '../lib/audit.js'

function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

async function getSupplierPlanCode(supplierId) {
  const sub = await getSubscriptionForBilling(supplierId, 'SUPPLIER')
  return (sub?.plan_code || 'free').toLowerCase()
}

async function countSponsorshipsThisYear(supplierId) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS c FROM supplier_sponsorship
     WHERE supplier_id = $1
       AND created_at >= date_trunc('year', now())`,
    [supplierId]
  )
  return rows[0]?.c ?? 0
}

export async function getSponsorshipLimitForSupplier(supplierId) {
  const config = await getReferralProgramConfig()
  const planCode = await getSupplierPlanCode(supplierId)
  const limits = config.sponsorshipLimitsPerYear || {}
  const limit = limits[planCode]
  if (limit === null || (limit === undefined && planCode === 'enterprise')) return null
  return limit ?? 0
}

export async function sponsorProspect(supplierId, prospectId, { planCode, req = null } = {}) {
  const config = await getReferralProgramConfig()
  const normalizedPlan = String(planCode || '').toLowerCase()
  const eligible = (config.eligibleSponsorPlans || []).map((p) => p.toLowerCase())
  if (!eligible.includes(normalizedPlan)) {
    throw new ValidationError(`Plan ${planCode} is not eligible for sponsorship`)
  }

  const limit = await getSponsorshipLimitForSupplier(supplierId)
  if (limit !== null) {
    const used = await countSponsorshipsThisYear(supplierId)
    if (used >= limit) {
      throw new ValidationError(`Sponsorship limit reached for your plan (${limit}/year)`)
    }
  }

  const { rows: prospects } = await query(
    `SELECT * FROM supplier_customer_prospect WHERE id = $1 AND supplier_id = $2`,
    [prospectId, supplierId]
  )
  if (!prospects.length) throw new NotFoundError('Prospect not found')
  const prospect = prospects[0]

  const { rows: planRows } = await query(
    `SELECT id, code, name FROM subscription_plan
     WHERE lower(code) = $1 AND tenant_type = 'RESTAURANT' AND is_active = true`,
    [normalizedPlan]
  )
  if (!planRows.length) throw new ValidationError('Restaurant plan not found')

  const periodStart = new Date()
  const periodEnd = addDays(periodStart, 30)
  const restaurantId = prospect.matched_restaurant_id

  const result = await withTransaction(async (client) => {
    const { rows: attrRows } = await client.query(
      `INSERT INTO supplier_referral_attribution (
         supplier_id, prospect_id, restaurant_id, attribution_type,
         referral_expires_at, first_paid_discount_percent
       )
       VALUES ($1, $2, $3, 'sponsor', $4, $5)
       RETURNING id`,
      [
        supplierId,
        prospectId,
        restaurantId,
        addDays(new Date(), config.referralValidityDays || 90),
        config.firstPaidDiscountPercent ?? 20,
      ]
    )

    const { rows: sponsorRows } = await client.query(
      `INSERT INTO supplier_sponsorship (
         supplier_id, prospect_id, restaurant_id, attribution_id,
         plan_code, period_start, period_end, status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
       RETURNING *`,
      [supplierId, prospectId, restaurantId, attrRows[0].id, normalizedPlan, periodStart, periodEnd]
    )

    await client.query(
      `UPDATE supplier_customer_prospect SET lifecycle_status = 'sponsored', updated_at = now()
       WHERE id = $1`,
      [prospectId]
    )

    if (restaurantId) {
      const { rows: subRows } = await client.query(
        `SELECT id FROM subscription WHERE tenant_id = $1 AND tenant_type = 'RESTAURANT'
         AND status NOT IN ('CANCELLED') ORDER BY created_at DESC LIMIT 1`,
        [restaurantId]
      )
      if (subRows.length) {
        await client.query(
          `UPDATE subscription SET
             plan_id = $2, plan_name = $3, status = 'ACTIVE',
             current_period_start = $4, current_period_end = $5,
             account_locked_at = NULL, lock_reason = NULL,
             free_sandbox_expires_at = NULL, updated_at = now()
           WHERE id = $1`,
          [subRows[0].id, planRows[0].id, planRows[0].name, periodStart, periodEnd]
        )
      }
      await client.query(
        `INSERT INTO supplier_follow (supplier_id, restaurant_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [supplierId, restaurantId]
      )
    }

    return { sponsorship: sponsorRows[0], attributionId: attrRows[0].id }
  })

  if (restaurantId) {
    await notifyTenantUsers({
      tenantId: restaurantId,
      tenantType: 'RESTAURANT',
      notificationType: 'sponsorship_gift_received',
      title: 'Supplify gift from your supplier',
      message: `Your supplier has gifted you one month of Supplify ${planRows[0].name}.`,
      metadata: { supplierId, planCode: normalizedPlan },
    }).catch(() => {})
  }

  if (req) {
    await writeAuditLog(req, {
      action: 'growth.sponsor',
      entityType: 'supplier_sponsorship',
      entityId: result.sponsorship.id,
      metadata: { prospectId, planCode: normalizedPlan },
    })
  }

  return result
}

export async function runSponsorshipExpiryJob() {
  const { rows } = await query(
    `SELECT ss.*, s.tenant_id AS restaurant_id
     FROM supplier_sponsorship ss
     LEFT JOIN subscription s ON s.tenant_id = ss.restaurant_id AND s.tenant_type = 'RESTAURANT'
     WHERE ss.status = 'active' AND ss.period_end < now()`
  )
  let expired = 0
  for (const row of rows) {
    await query(`UPDATE supplier_sponsorship SET status = 'expired' WHERE id = $1`, [row.id])
    if (row.restaurant_id) {
      const { rows: freePlan } = await query(
        `SELECT id FROM subscription_plan WHERE lower(code) = 'free' AND tenant_type = 'RESTAURANT' LIMIT 1`
      )
      if (freePlan.length) {
        await query(
          `UPDATE subscription SET
             plan_id = $2, status = 'ACTIVE', lock_reason = 'free_sandbox_expired',
             account_locked_at = now(), updated_at = now()
           WHERE tenant_id = $1 AND tenant_type = 'RESTAURANT' AND status NOT IN ('CANCELLED')`,
          [row.restaurant_id, freePlan[0].id]
        )
      }
      await notifyTenantUsers({
        tenantId: row.restaurant_id,
        tenantType: 'RESTAURANT',
        notificationType: 'sponsorship_expired',
        title: 'Sponsored period ended',
        message:
          'Subscribe to continue using premium features. You may still qualify for a referral discount.',
        metadata: { sponsorshipId: row.id },
      }).catch(() => {})
    }
    expired += 1
  }
  return { expired }
}
