import { query } from '../src/lib/db.js'

const sqls = [
  ['suppliers', 'SELECT COUNT(*)::int AS c FROM supplier'],
  ['restaurants', 'SELECT COUNT(*)::int AS c FROM restaurant'],
  ['orders_total', "SELECT COUNT(*)::int AS c FROM customer_order WHERE status NOT IN ('DRAFT','CANCELLED')"],
  ['orders_today_rolling', "SELECT COUNT(*)::int AS c FROM customer_order WHERE placed_at >= NOW()-INTERVAL '1 day' AND status NOT IN ('DRAFT','CANCELLED')"],
  ['orders_today_calendar', "SELECT COUNT(*)::int AS c FROM customer_order WHERE placed_at::date = CURRENT_DATE AND status NOT IN ('DRAFT','CANCELLED')"],
  ['products', 'SELECT COUNT(*)::int AS c FROM product WHERE is_active=true'],
  ['quick_lists', 'SELECT COUNT(*)::int AS c FROM quick_list'],
  ['messages_24h', "SELECT COUNT(*)::int AS c FROM message WHERE created_at>=NOW()-INTERVAL '24 hours'"],
  ['staff', "SELECT COUNT(*)::int AS c FROM staff_member WHERE status='ACTIVE'"],
  ['subscriptions_active', "SELECT COUNT(*)::int AS c FROM subscription WHERE status='ACTIVE'"],
]

for (const [name, sql] of sqls) {
  try {
    const { rows } = await query(sql)
    console.log(name, rows[0])
  } catch (e) {
    console.log(name, 'ERROR', e.message)
  }
}

process.exit(0)
