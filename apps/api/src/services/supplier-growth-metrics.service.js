import { query } from '../lib/db.js'

export async function getSupplierGrowthMetrics(supplierId) {
  const [imported, existingSupplify, invited, sponsored, registered, converted, revenue, rewards] =
    await Promise.all([
      query(`SELECT COUNT(*)::int AS c FROM supplier_customer_prospect WHERE supplier_id = $1`, [
        supplierId,
      ]),
      query(
        `SELECT COUNT(*)::int AS c FROM supplier_customer_prospect
       WHERE supplier_id = $1 AND match_status = 'existing_supplify'`,
        [supplierId]
      ),
      query(
        `SELECT COUNT(DISTINCT prospect_id)::int AS c FROM supplier_growth_invitation WHERE supplier_id = $1`,
        [supplierId]
      ),
      query(`SELECT COUNT(*)::int AS c FROM supplier_sponsorship WHERE supplier_id = $1`, [
        supplierId,
      ]),
      query(
        `SELECT COUNT(*)::int AS c FROM supplier_customer_prospect
       WHERE supplier_id = $1 AND lifecycle_status IN ('registered', 'sponsored', 'converted')`,
        [supplierId]
      ),
      query(
        `SELECT COUNT(*)::int AS c FROM supplier_referral_attribution
       WHERE supplier_id = $1 AND converted_at IS NOT NULL`,
        [supplierId]
      ),
      query(
        `SELECT COALESCE(SUM(latest.amount), 0)::numeric AS total
       FROM supplier_referral_attribution ra
       JOIN LATERAL (
         SELECT bi.amount
         FROM billing_invoice bi
         WHERE bi.tenant_id = ra.restaurant_id
           AND bi.tenant_type = 'RESTAURANT'
           AND bi.status = 'PAID'
         ORDER BY bi.paid_at DESC NULLS LAST, bi.created_at DESC
         LIMIT 1
       ) latest ON true
       WHERE ra.supplier_id = $1 AND ra.converted_at IS NOT NULL`,
        [supplierId]
      ),
      query(
        `SELECT COUNT(*) FILTER (WHERE supplier_reward_type = 'free_month')::int AS free_months,
              COALESCE(SUM(supplier_reward_value) FILTER (WHERE supplier_reward_type = 'account_credit'), 0)::numeric AS credit_total
       FROM supplier_referral_attribution
       WHERE supplier_id = $1 AND supplier_reward_status = 'granted'`,
        [supplierId]
      ),
    ])

  return {
    importedCustomers: imported.rows[0]?.c ?? 0,
    existingSupplifyCustomers: existingSupplify.rows[0]?.c ?? 0,
    invitedCustomers: invited.rows[0]?.c ?? 0,
    sponsoredCustomers: sponsored.rows[0]?.c ?? 0,
    registeredCustomers: registered.rows[0]?.c ?? 0,
    convertedCustomers: converted.rows[0]?.c ?? 0,
    revenueGenerated: Number(revenue.rows[0]?.total ?? 0),
    rewardsEarned: {
      freeMonths: rewards.rows[0]?.free_months ?? 0,
      accountCredit: Number(rewards.rows[0]?.credit_total ?? 0),
    },
  }
}
