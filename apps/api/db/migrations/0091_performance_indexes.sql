-- Migration: 0091_performance_indexes.sql
-- Description: Critical indexes identified during performance audit.
-- These target the hottest query paths: subscription lookup, feature-flag
-- resolution, and usage meter reads.

-- ============================================================
-- subscription: hot query in getTenantSubscription
--   WHERE tenant_id = $1 AND tenant_type = $2
--         AND status IN ('TRIALING','ACTIVE')
--   ORDER BY created_at DESC LIMIT 1
--
-- The existing idx_subscription_tenant covers (tenant_id, tenant_type) but
-- does not include status, forcing a filter + sort on every call.
-- This partial index covers only live subscriptions — the common case.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_subscription_tenant_status_active
  ON subscription (tenant_id, tenant_type, created_at DESC)
  WHERE status IN ('TRIALING', 'ACTIVE');

-- ============================================================
-- feature_flag_override: hot query in resolveAllFeaturesForTenant
--   WHERE tenant_id = $1 AND tenant_type = $2 AND feature_key = ANY(...)
--
-- idx_feature_flag_override_tenant already covers (tenant_id, tenant_type)
-- but adding feature_key as a third column lets the planner satisfy the
-- ANY(...) filter as an index scan rather than a heap filter.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_feature_flag_override_tenant_key
  ON feature_flag_override (tenant_id, tenant_type, feature_key);

-- ============================================================
-- feature_flag: hot query in resolveAllFeaturesForTenant
--   WHERE feature_key = ANY($1::text[])
--
-- The UNIQUE constraint on feature_key already creates a btree index,
-- so no additional index is needed here — the planner uses it for ANY().
-- ============================================================

-- ============================================================
-- usage_meter: hot query in checkAndIncrementUsage / checkLimit
--   WHERE tenant_id=$1 AND tenant_type=$2 AND meter_type=$3
--         AND period_start_date = CURRENT_DATE
--
-- The existing idx_usage_meter_tenant_type_meter_window covers
-- (tenant_type, tenant_id, meter_type, period_start_date).
-- Add a complementary index with tenant_id first for direct tenant lookups.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_usage_meter_tenant_id_type_meter_period
  ON usage_meter (tenant_id, tenant_type, meter_type, period_start_date);

-- ============================================================
-- subscription_plan: referenced in every getTenantSubscription JOIN
--   WHERE id = $1  (already covered by PK)
--   Also: WHERE tenant_type=$1 AND is_active=true (used by recommendPlan)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_subscription_plan_tenant_type_active
  ON subscription_plan (tenant_type, is_active, display_order)
  WHERE is_active = true;
