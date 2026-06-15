import { query } from './db.js'
import { logger } from './logger.js'
import { deliveredOrderStatusInSql } from './order-statuses.js'

/**
 * Composed admin activity feed from operational tables (no unified activity table).
 * Primary path: single UNION ALL query with outer ORDER BY / LIMIT / OFFSET.
 * Falls back to per-branch queries when the unified query fails (missing tables, etc.).
 *
 * Sources: orders, tenants, subscription changes, admin audit, staff, reservations,
 * invoices, payments, quick lists, receiving, chat, promotions/deals.
 */

const BRANCH_SELECT = `
  id, event_type, title, subtitle, actor, target, amount, occurred_at,
  tenant_name, tenant_type, status_label, link_path
`

/** @type {Array<{ key: string; sql: string }>} */
const ACTIVITY_BRANCHES = [
  {
    key: 'order_placed',
    sql: `
      SELECT co.id::text AS id, 'order_placed' AS event_type,
        'Order placed — ' || r.name AS title,
        r.name || ' → ' || COALESCE(
          (SELECT s.name FROM supplier s
           INNER JOIN order_item oi ON oi.supplier_id = s.id
           WHERE oi.order_id = co.id LIMIT 1), '?') AS subtitle,
        r.name AS actor, NULL::text AS target,
        co.total_amount::float AS amount,
        COALESCE(co.placed_at, co.created_at) AS occurred_at,
        r.name AS tenant_name, 'RESTAURANT'::text AS tenant_type,
        co.status::text AS status_label,
        '/orders/' || co.id::text AS link_path
      FROM customer_order co
      INNER JOIN restaurant r ON r.id = co.restaurant_id
      WHERE co.status NOT IN ('DRAFT', 'CANCELLED')
    `,
  },
  {
    key: 'order_confirmed',
    sql: `
      SELECT co.id::text AS id, 'order_confirmed' AS event_type,
        'Order acknowledged — ' || r.name AS title,
        COALESCE(
          (SELECT s.name FROM supplier s
           INNER JOIN order_item oi ON oi.supplier_id = s.id
           WHERE oi.order_id = co.id LIMIT 1), '?') || ' · ' || co.status::text AS subtitle,
        COALESCE(
          (SELECT s.name FROM supplier s
           INNER JOIN order_item oi ON oi.supplier_id = s.id
           WHERE oi.order_id = co.id LIMIT 1), '?') AS actor,
        r.name AS target,
        co.total_amount::float AS amount,
        co.updated_at AS occurred_at,
        r.name AS tenant_name, 'RESTAURANT'::text AS tenant_type,
        co.status::text AS status_label,
        '/orders/' || co.id::text AS link_path
      FROM customer_order co
      INNER JOIN restaurant r ON r.id = co.restaurant_id
      WHERE co.status IN ('ACKNOWLEDGED', 'PROCESSING', 'SHIPPED', 'PENDING_APPROVAL')
    `,
  },
  {
    key: 'order_completed',
    sql: `
      SELECT co.id::text AS id, 'order_completed' AS event_type,
        'Order completed — ' || r.name AS title,
        COALESCE(
          (SELECT s.name FROM supplier s
           INNER JOIN order_item oi ON oi.supplier_id = s.id
           WHERE oi.order_id = co.id LIMIT 1), '?') AS subtitle,
        r.name AS actor, NULL::text AS target,
        co.total_amount::float AS amount,
        COALESCE(co.updated_at, co.created_at) AS occurred_at,
        r.name AS tenant_name, 'RESTAURANT'::text AS tenant_type,
        co.status::text AS status_label,
        '/orders/' || co.id::text AS link_path
      FROM customer_order co
      INNER JOIN restaurant r ON r.id = co.restaurant_id
      WHERE ${deliveredOrderStatusInSql('co.status')}
    `,
  },
  {
    key: 'cart_updated',
    sql: `
      SELECT co.id::text AS id, 'cart_updated' AS event_type,
        r.name || ' updated cart' AS title,
        COUNT(oi.id)::text || ' items' AS subtitle,
        r.name AS actor, NULL::text AS target,
        COALESCE(SUM(oi.line_total), 0)::float AS amount,
        co.updated_at AS occurred_at,
        r.name AS tenant_name, 'RESTAURANT'::text AS tenant_type,
        'DRAFT'::text AS status_label,
        NULL::text AS link_path
      FROM customer_order co
      INNER JOIN restaurant r ON r.id = co.restaurant_id
      INNER JOIN order_item oi ON oi.order_id = co.id
      WHERE co.status = 'DRAFT'
      GROUP BY co.id, r.name, co.updated_at
    `,
  },
  {
    key: 'new_tenant',
    sql: `
      SELECT id::text AS id, 'new_tenant' AS event_type,
        'New supplier: ' || name AS title,
        COALESCE(contact_email, '') AS subtitle,
        name AS actor, NULL::text AS target, NULL::float AS amount,
        created_at AS occurred_at,
        name AS tenant_name, 'SUPPLIER'::text AS tenant_type,
        NULL::text AS status_label,
        '/admin/suppliers' AS link_path
      FROM supplier
      UNION ALL
      SELECT id::text, 'new_tenant',
        'New restaurant: ' || name,
        COALESCE(contact_email, ''),
        name, NULL, NULL,
        created_at,
        name, 'RESTAURANT'::text,
        NULL::text,
        '/admin/restaurants'
      FROM restaurant
    `,
  },
  {
    key: 'plan_changed',
    sql: `
      SELECT scl.id::text AS id, 'plan_changed' AS event_type,
        COALESCE(r.name, s.name, '?') || ' changed plan' AS title,
        COALESCE(fp.name, '?') || ' → ' || COALESCE(tp.name, '?') AS subtitle,
        COALESCE(r.name, s.name) AS actor, tp.name AS target,
        NULL::float AS amount, scl.created_at AS occurred_at,
        COALESCE(r.name, s.name) AS tenant_name,
        sub.tenant_type::text AS tenant_type,
        NULL::text AS status_label,
        NULL::text AS link_path
      FROM subscription_change_log scl
      LEFT JOIN subscription sub ON sub.id = scl.subscription_id
      LEFT JOIN restaurant r ON r.id = sub.tenant_id AND sub.tenant_type = 'RESTAURANT'
      LEFT JOIN supplier s ON s.id = sub.tenant_id AND sub.tenant_type = 'SUPPLIER'
      LEFT JOIN subscription_plan fp ON fp.id = scl.from_plan_id
      LEFT JOIN subscription_plan tp ON tp.id = scl.to_plan_id
    `,
  },
  {
    key: 'subscription_status',
    sql: `
      SELECT aal.id::text AS id, 'subscription_status' AS event_type,
        aal.action_type AS title,
        COALESCE(aal.action_description, '') AS subtitle,
        COALESCE(aal.admin_name, 'Admin') AS actor, NULL::text AS target,
        NULL::float AS amount, aal.created_at AS occurred_at,
        NULL::text AS tenant_name,
        aal.target_tenant_type::text AS tenant_type,
        aal.action_type::text AS status_label,
        NULL::text AS link_path
      FROM admin_audit_log aal
      WHERE aal.action_type IN (
        'subscription.suspend', 'subscription.resume', 'subscription.updated',
        'subscription.extend_trial', 'subscription.unlock'
      )
    `,
  },
  {
    key: 'staff_added',
    sql: `
      SELECT sm.id::text AS id, 'staff_added' AS event_type,
        'Staff added at ' || r.name AS title,
        sm.first_name || ' ' || sm.last_name || ' (' || COALESCE(sm.role, '?') || ')' AS subtitle,
        r.name AS actor, sm.first_name || ' ' || sm.last_name AS target,
        NULL::float AS amount, sm.created_at AS occurred_at,
        r.name AS tenant_name, 'RESTAURANT'::text AS tenant_type,
        NULL::text AS status_label,
        NULL::text AS link_path
      FROM staff_member sm
      INNER JOIN restaurant r ON r.id = sm.restaurant_id
    `,
  },
  {
    key: 'reservation',
    sql: `
      SELECT rv.id::text AS id, 'reservation' AS event_type,
        'Reservation at ' || r.name AS title,
        rv.customer_name || ' · ' || rv.party_size || ' guests · '
          || TO_CHAR(rv.scheduled_at, 'DD Mon HH24:MI') AS subtitle,
        r.name AS actor, rv.customer_name AS target,
        NULL::float AS amount, rv.created_at AS occurred_at,
        r.name AS tenant_name, 'RESTAURANT'::text AS tenant_type,
        rv.status::text AS status_label,
        NULL::text AS link_path
      FROM reservation rv
      INNER JOIN restaurant r ON r.id = rv.restaurant_id
      WHERE rv.status NOT IN ('CANCELLED')
    `,
  },
  {
    key: 'invoice_issued',
    sql: `
      SELECT i.id::text AS id, 'invoice_issued' AS event_type,
        'Invoice #' || i.invoice_number AS title,
        COALESCE(s.name, '?') || ' → ' || COALESCE(r.name, '?') AS subtitle,
        COALESCE(s.name, '?') AS actor, COALESCE(r.name, '?') AS target,
        i.total_amount::float AS amount, i.created_at AS occurred_at,
        COALESCE(r.name, s.name) AS tenant_name,
        CASE WHEN r.id IS NOT NULL THEN 'RESTAURANT' ELSE 'SUPPLIER' END::text AS tenant_type,
        i.status::text AS status_label,
        NULL::text AS link_path
      FROM invoice i
      LEFT JOIN supplier s ON s.id = i.supplier_id
      LEFT JOIN restaurant r ON r.id = i.restaurant_id
      WHERE i.status IN ('ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE')
    `,
  },
  {
    key: 'payment_received',
    sql: `
      SELECT p.id::text AS id, 'payment_received' AS event_type,
        'Payment received' AS title,
        COALESCE(r.name, '?') || ' paid ' || p.payment_method AS subtitle,
        COALESCE(r.name, '?') AS actor, COALESCE(s.name, '?') AS target,
        p.payment_amount::float AS amount, p.created_at AS occurred_at,
        COALESCE(r.name, '?') AS tenant_name, 'RESTAURANT'::text AS tenant_type,
        p.status::text AS status_label,
        NULL::text AS link_path
      FROM payment p
      LEFT JOIN invoice i ON i.id = p.invoice_id
      LEFT JOIN supplier s ON s.id = i.supplier_id
      LEFT JOIN restaurant r ON r.id = i.restaurant_id
      WHERE p.status = 'COMPLETED'
    `,
  },
  {
    key: 'quick_list',
    sql: `
      SELECT ql.id::text AS id, 'quick_list' AS event_type,
        'Quick list created' AS title,
        r.name || ' → ' || COALESCE(s.name, '?') || ': ' || ql.name AS subtitle,
        r.name AS actor, COALESCE(s.name, '?') AS target,
        NULL::float AS amount, ql.created_at AS occurred_at,
        r.name AS tenant_name, 'RESTAURANT'::text AS tenant_type,
        NULL::text AS status_label,
        NULL::text AS link_path
      FROM quick_list ql
      INNER JOIN restaurant r ON r.id = ql.restaurant_id
      LEFT JOIN supplier s ON s.id = ql.supplier_id
    `,
  },
  {
    key: 'receiving',
    sql: `
      SELECT rr.id::text AS id, 'receiving' AS event_type,
        'Delivery received' AS title,
        r.name || ' received from ' || COALESCE(s.name, '?')
          || ' — score: ' || COALESCE(rr.quality_score::text, '?') || '/5' AS subtitle,
        COALESCE(s.name, '?') AS actor, r.name AS target,
        rr.total_actual_cost::float AS amount, rr.received_at AS occurred_at,
        r.name AS tenant_name, 'RESTAURANT'::text AS tenant_type,
        rr.status::text AS status_label,
        NULL::text AS link_path
      FROM receiving_report rr
      INNER JOIN restaurant r ON r.id = rr.restaurant_id
      LEFT JOIN supplier s ON s.id = rr.supplier_id
      WHERE rr.status IN ('ACCEPTED', 'PARTIAL')
    `,
  },
  {
    key: 'chat_started',
    sql: `
      SELECT c.id::text AS id, 'chat_started' AS event_type,
        'Chat started' AS title,
        COALESCE(r.name, '?') || ' ↔ ' || COALESCE(s.name, '?') AS subtitle,
        COALESCE(r.name, '?') AS actor, COALESCE(s.name, '?') AS target,
        NULL::float AS amount, c.created_at AS occurred_at,
        COALESCE(r.name, s.name) AS tenant_name,
        CASE WHEN r.id IS NOT NULL THEN 'RESTAURANT' ELSE 'SUPPLIER' END::text AS tenant_type,
        NULL::text AS status_label,
        NULL::text AS link_path
      FROM conversation c
      LEFT JOIN restaurant r ON r.id = c.restaurant_id
      LEFT JOIN supplier s ON s.id = c.supplier_id
    `,
  },
  {
    key: 'deal_activity',
    sql: `
      SELECT p.id::text AS id, 'deal_activity' AS event_type,
        'Promotion · ' || p.name AS title,
        s.name || ' · ' || p.status || COALESCE(' · ' || p.type, '') AS subtitle,
        s.name AS actor, p.name AS target,
        NULL::float AS amount,
        GREATEST(p.updated_at, p.created_at) AS occurred_at,
        s.name AS tenant_name, 'SUPPLIER'::text AS tenant_type,
        p.status::text AS status_label,
        NULL::text AS link_path
      FROM promotions p
      INNER JOIN supplier s ON s.id = p.supplier_id
      WHERE p.status NOT IN ('draft')
    `,
  },
]

/**
 * @param {string} branchSql
 * @param {number} windowDaysParam
 */
function wrapBranchSubquery(branchSql, windowDaysParam) {
  return `SELECT ${BRANCH_SELECT} FROM (${branchSql}) src
    WHERE src.occurred_at >= NOW() - ($${windowDaysParam}::int * INTERVAL '1 day')`
}

/**
 * @param {Array<{ key: string; sql: string }>} branches
 * @param {number} windowDaysParam
 */
function buildUnionFeedSql(branches, windowDaysParam) {
  return branches
    .map((branch) => wrapBranchSubquery(branch.sql, windowDaysParam))
    .join('\nUNION ALL\n')
}

/**
 * @param {Record<string, unknown>} row
 */
export function normalizeActivityEvent(row) {
  const eventType = String(row.event_type || '')
  const occurredAt = row.occurred_at
  return {
    id: row.id,
    event_type: eventType,
    type: eventType,
    title: row.title,
    description: row.subtitle ?? null,
    subtitle: row.subtitle ?? null,
    createdAt: occurredAt,
    occurred_at: occurredAt,
    actorName: row.actor ?? null,
    actor: row.actor ?? null,
    tenantName: row.tenant_name ?? row.actor ?? null,
    tenantType: row.tenant_type ?? null,
    status: row.status_label ?? null,
    severity: row.status_label ?? null,
    link: row.link_path ?? null,
    target: row.target ?? null,
    amount: row.amount != null ? Number(row.amount) : null,
  }
}

/**
 * Legacy per-branch fetch with isolated failures (fallback path).
 * @param {Array<{ key: string; sql: string }>} branches
 * @param {{ lim: number; off: number; windowDays: number }} opts
 */
async function buildAdminActivityFeedLegacy(branches, { lim, off, windowDays }) {
  const perBranchCap = Math.min(Math.max(lim + off, lim) * 2, 200)
  const failedSources = []
  const allRows = []

  await Promise.all(
    branches.map(async (branch) => {
      try {
        const { rows } = await query(
          `SELECT ${BRANCH_SELECT} FROM (${branch.sql}) src
           WHERE src.occurred_at >= NOW() - ($2::int * INTERVAL '1 day')
           ORDER BY occurred_at DESC LIMIT $1`,
          [perBranchCap, windowDays]
        )
        allRows.push(...rows)
      } catch (error) {
        if (error.code === '42P01') {
          logger.debug({ branch: branch.key }, 'activity branch skipped (table missing)')
          return
        }
        logger.warn(
          { branch: branch.key, code: error.code, message: error.message },
          'activity branch query failed'
        )
        failedSources.push(branch.key)
      }
    })
  )

  allRows.sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at))
  const page = allRows.slice(off, off + lim).map(normalizeActivityEvent)

  return {
    events: page,
    total: allRows.length,
    limit: lim,
    offset: off,
    days: windowDays,
    sources: branches.map((b) => b.key),
    failedSources,
    partial: failedSources.length > 0,
  }
}

/**
 * @param {{ limit?: number; offset?: number; type?: string | null; days?: number }} opts
 */
export async function buildAdminActivityFeed({
  limit = 50,
  offset = 0,
  type = null,
  days = 30,
} = {}) {
  const lim = Math.min(Math.max(parseInt(String(limit), 10) || 50, 1), 100)
  const off = Math.max(parseInt(String(offset), 10) || 0, 0)
  const windowDays = Math.min(Math.max(parseInt(String(days), 10) || 30, 1), 90)
  const typeFilter = type && type !== 'all' ? String(type) : null

  const branches = typeFilter
    ? ACTIVITY_BRANCHES.filter((b) => b.key === typeFilter)
    : ACTIVITY_BRANCHES

  if (branches.length === 0) {
    return {
      events: [],
      total: 0,
      limit: lim,
      offset: off,
      days: windowDays,
      sources: [],
      failedSources: [],
      partial: false,
    }
  }

  const unionSql = buildUnionFeedSql(branches, 3)
  const countUnionSql = buildUnionFeedSql(branches, 1)
  const params = [lim, off, windowDays]

  try {
    const [dataResult, countResult] = await Promise.all([
      query(
        `SELECT ${BRANCH_SELECT}
         FROM (${unionSql}) feed
         ORDER BY feed.occurred_at DESC
         LIMIT $1 OFFSET $2`,
        params
      ),
      query(`SELECT COUNT(*)::int AS total FROM (${countUnionSql}) feed`, [windowDays]),
    ])

    return {
      events: dataResult.rows.map(normalizeActivityEvent),
      total: countResult.rows[0]?.total ?? dataResult.rows.length,
      limit: lim,
      offset: off,
      days: windowDays,
      sources: branches.map((b) => b.key),
      failedSources: [],
      partial: false,
    }
  } catch (error) {
    logger.warn(
      { code: error.code, message: error.message },
      'unified activity feed query failed; falling back to per-branch queries'
    )
    return buildAdminActivityFeedLegacy(branches, { lim, off, windowDays })
  }
}
