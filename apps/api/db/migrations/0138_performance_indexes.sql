-- Migration: 0138_performance_indexes.sql
-- Description: Targeted performance indexes for the hottest query paths identified
-- in the Railway ~980ms slow-query audit:
--   1. notification_log   — GET /notifications (user_id+user_type+created_at, unread count)
--   2. notification_preferences — ensureNotificationPreferences (user_id, user_type)
--   3. tenant_user_roles  — listTenantUserIds fan-out (tenant_id lookup)
--   4. disputes           — listDisputesForRestaurant / listIncomingDisputesForSupplier (created_at sort)
--   5. customer_order     — orders list date-range COALESCE(placed_at, created_at) filter
--   6. order_item         — supplier_id lookup for access checks (supplier_id alone)
--   7. app_user           — contact_email join used in getTenantIdForUser, getRestaurantUserContext
--   8. admin_audit_log    — GET /admin-dashboard/audit-logs (created_at sort, target_entity_type filter)

-- ============================================================
-- notification_log: GET /notifications
--
-- getUserNotifications runs:
--   SELECT * FROM notification_log
--   WHERE user_id=$1 AND user_type=$2
--   ORDER BY created_at DESC
--   LIMIT $3 OFFSET $4
--
-- AND a separate unread-count query:
--   SELECT COUNT(*) FROM notification_log
--   WHERE user_id=$1 AND user_type=$2 AND is_read=false
--
-- The existing idx_notification_log_user covers (user_id, user_type, is_read) which
-- works for the count query. But it does not include created_at, so the ORDER BY
-- requires a sort after the index scan.
-- A covering composite index (user_id, user_type, created_at DESC) lets Postgres
-- satisfy the ordered list scan as a pure index scan.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_notification_log_user_created
  ON notification_log (user_id, user_type, created_at DESC);

-- Partial index for the unread-count query — only indexes unread rows,
-- which is a small fraction of the table at steady state.
CREATE INDEX IF NOT EXISTS idx_notification_log_user_unread
  ON notification_log (user_id, user_type)
  WHERE is_read = false;

-- ============================================================
-- notification_log: mark-all-read bulk UPDATE
--
-- UPDATE notification_log
-- SET is_read=true, read_at=now()
-- WHERE user_id=$1 AND user_type=$2 AND is_read=false
--
-- The partial unread index above also speeds this UPDATE's WHERE clause.
-- ============================================================

-- ============================================================
-- notification_preferences: ensureNotificationPreferences
--
-- SELECT * FROM notification_preferences
-- WHERE user_id=$1 AND user_type=$2
--
-- A UNIQUE constraint on (user_id, user_type) already exists (creates an implicit
-- btree index). No additional index needed — documenting for clarity.
-- ============================================================

-- ============================================================
-- tenant_user_roles: listTenantUserIds (called on every notification fan-out)
--
-- SELECT DISTINCT u.id FROM app_user u
-- WHERE u.id IN (
--   SELECT tur.user_id FROM tenant_user_roles tur
--   WHERE tur.tenant_id=$1 AND tur.tenant_type=$2
-- )
-- ...
--
-- idx_tenant_user_roles_tenant_user (tenant_id, user_id) from migration 0078 covers
-- the WHERE clause. Adding tenant_type as a leading column produces a tighter
-- composite that allows an index-only scan for the subquery.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_tenant_user_roles_tenant_type_id
  ON tenant_user_roles (tenant_id, tenant_type, user_id);

-- ============================================================
-- disputes: listDisputesForRestaurant / listIncomingDisputesForSupplier
--
-- SELECT d.*, ... FROM disputes d ...
-- WHERE d.restaurant_id=$1 [AND d.status=$2]
-- ORDER BY d.created_at DESC
--
-- SELECT d.*, ... FROM disputes d ...
-- WHERE d.supplier_id=$1 [AND d.status=$2]
-- ORDER BY d.created_at DESC
--
-- Migration 0072 already created:
--   idx_disputes_restaurant_status  ON disputes(restaurant_id, status)
--   idx_disputes_supplier_status    ON disputes(supplier_id, status)
--
-- These cover the filtered (status) case, but when status is omitted
-- (the default list call) the planner falls back to a heap scan then sort.
-- Adding created_at DESC as a third column makes both the filtered and
-- unfiltered cases use an index scan for ordering.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_disputes_restaurant_created
  ON disputes (restaurant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_disputes_supplier_created
  ON disputes (supplier_id, created_at DESC);

-- ============================================================
-- customer_order: orders list date-range filter
--
-- The orders list query uses:
--   COALESCE(o.placed_at, o.created_at) >= $n
--   COALESCE(o.placed_at, o.created_at) <= $n
--
-- COALESCE expressions cannot use a plain column index.
-- A function-based (expression) index on COALESCE(placed_at, created_at)
-- lets the planner use an index scan for date-range queries when a
-- restaurant_id filter is also present.
--
-- Combined with ORDER BY o.created_at DESC (already covered by
-- idx_customer_order_restaurant_created from 0038), this fills the gap
-- for date-range lookups.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_customer_order_coalesce_date
  ON customer_order (COALESCE(placed_at, created_at) DESC);

-- Composite: restaurant + coalesce date for the common restaurant date-range list
CREATE INDEX IF NOT EXISTS idx_customer_order_restaurant_coalesce_date
  ON customer_order (restaurant_id, COALESCE(placed_at, created_at) DESC);

-- ============================================================
-- order_item: supplier access check (single-column supplier_id)
--
-- Several access-check queries use:
--   SELECT 1 FROM order_item WHERE order_id=$1 AND supplier_id=$2 LIMIT 1
--
-- idx_order_item_supplier_order from 0071/0132 covers (supplier_id, order_id).
-- Also needed: a plain supplier_id index for queries that filter only by supplier:
--   SELECT supplier_id FROM order_item WHERE order_id=$1 LIMIT 1
-- (already covered by idx_order_item_order_id from 0038; no new index needed)
--
-- The query SELECT 1 FROM order_item WHERE order_id=$1 AND supplier_id=$2 LIMIT 1
-- is served by idx_order_item_supplier_order (supplier_id, order_id) — Postgres
-- can use it for equality on both columns. No new index needed here.
-- ============================================================

-- ============================================================
-- app_user: contact_email join (getTenantIdForUser, getRestaurantUserContext)
--
-- JOIN app_user u ON u.email = s.contact_email WHERE u.id=$1
-- and: JOIN app_user u ON u.email = s.contact_email WHERE s.id=$1
--
-- These are bi-directional email joins.  A btree index on app_user.email
-- (case-sensitive) accelerates the join probe.  The UNIQUE constraint on
-- app_user.email (if it exists) would already provide this, but many schemas
-- only have a non-unique index or none at all.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_app_user_email
  ON app_user (email);

-- ============================================================
-- admin_audit_log: GET /admin-dashboard/audit-logs
--
-- SELECT * FROM admin_audit_log
-- [WHERE target_tenant_id=... AND action_type=... AND admin_user_id=... AND created_at BETWEEN ...]
-- ORDER BY created_at DESC
-- LIMIT ... OFFSET ...
--
-- Also a separate COUNT(*) with the same WHERE.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at
  ON admin_audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target_tenant
  ON admin_audit_log (target_tenant_id, created_at DESC)
  WHERE target_tenant_id IS NOT NULL;
