import { query } from '../src/lib/db.js'

const queries = [
  ['tenantCounts', `SELECT tenant_type, COUNT(*) as count FROM subscription WHERE status IN ('ACTIVE','TRIALING') GROUP BY tenant_type`],
  ['subscriptionStats', `SELECT status, COUNT(*) as count FROM subscription GROUP BY status`],
  ['revenue', `SELECT COALESCE(SUM(CASE WHEN s.billing_cycle='MONTHLY' THEN sp.price_per_month ELSE sp.price_per_month*12 END),0) as mrr, COUNT(*) as active_subscriptions FROM subscription s JOIN subscription_plan sp ON sp.id=s.plan_id WHERE s.status='ACTIVE'`],
  ['orders', `SELECT COUNT(*) FILTER (WHERE placed_at >= NOW()-INTERVAL '1 day') AS today, COUNT(*) FILTER (WHERE placed_at >= NOW()-INTERVAL '7 days') AS week, COUNT(*) FILTER (WHERE placed_at >= NOW()-INTERVAL '30 days') AS month, COUNT(*) FILTER (WHERE status NOT IN ('DRAFT','CANCELLED')) AS total FROM customer_order`],
  ['carts', `SELECT COUNT(DISTINCT co.id) as count FROM customer_order co INNER JOIN order_item oi ON oi.order_id=co.id WHERE co.status='DRAFT'`],
  ['chats', `SELECT COUNT(*) as count FROM message WHERE created_at>=NOW()-INTERVAL '24 hours'`],
  ['staff', `SELECT COUNT(*) as count FROM staff_member WHERE status='ACTIVE'`],
  ['reservations', `SELECT COUNT(*) FILTER (WHERE scheduled_at::date=CURRENT_DATE) AS today, COUNT(*) FILTER (WHERE scheduled_at>=NOW()-INTERVAL '7 days') AS week, COUNT(*) FILTER (WHERE status IN ('CONFIRMED','SEATED')) AS confirmed FROM reservation`],
  ['suppliers', `SELECT COUNT(*) FILTER (WHERE created_at>=NOW()-INTERVAL '7 days') AS new_suppliers, COUNT(*) FROM supplier`],
  ['restaurants', `SELECT COUNT(*) FILTER (WHERE created_at>=NOW()-INTERVAL '7 days') AS new_restaurants, COUNT(*) FROM restaurant`],
  ['products', `SELECT COUNT(*) as count FROM product WHERE is_active=true`],
  ['quick_lists', `SELECT COUNT(*) as count FROM quick_list`],
  ['past_due', `SELECT COUNT(*) as count FROM subscription WHERE status='PAST_DUE'`],
  ['trial_exp', `SELECT COUNT(*) as count FROM subscription WHERE status='TRIALING' AND trial_ends_at BETWEEN NOW() AND NOW()+INTERVAL '7 days'`],
  ['pending_deals', `SELECT COUNT(*) as count FROM promotions WHERE status IN ('pending_approval', 'pending_admin_approval')`],
  ['pending_payment', `SELECT COUNT(*) as count FROM promotions WHERE status = 'approved_pending_payment'`],
  ['overdue_invoice', `SELECT COUNT(*) as count FROM invoice WHERE status = 'OVERDUE' AND balance_due > 0`],
]

let failed = 0
for (const [name, sql] of queries) {
  try {
    await query(sql)
    console.log(name, 'OK')
  } catch (e) {
    failed++
    console.log(name, 'FAIL', e.code, e.message)
  }
}
console.log('failed', failed, 'of', queries.length)
process.exit(0)
