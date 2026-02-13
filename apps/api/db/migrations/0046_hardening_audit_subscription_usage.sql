-- Migration: 0046_hardening_audit_subscription_usage.sql
-- Phase A: Unified audit_logs, subscription history, downgrade grace, usage_meter constraint

-- ========================================
-- 1) UNIFIED AUDIT LOGS (spec: action_type, actor_user_id, actor_admin_role, tenant_type, tenant_id, target_id, payload_json, request_id, created_at)
-- ========================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type TEXT NOT NULL,
  actor_user_id UUID,
  actor_admin_role TEXT,
  tenant_type TEXT,
  tenant_id UUID,
  target_id UUID,
  payload_json JSONB NOT NULL DEFAULT '{}',
  request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE audit_logs IS 'Unified audit trail for all actions (billing, subscription, overrides, impersonation, enforcement)';
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id, tenant_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id ON audit_logs(request_id) WHERE request_id IS NOT NULL;

-- ========================================
-- 2) SUBSCRIPTION CHANGE HISTORY
-- ========================================
CREATE TABLE IF NOT EXISTS subscription_change_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscription(id),
  from_plan_id UUID REFERENCES subscription_plan(id),
  to_plan_id UUID REFERENCES subscription_plan(id),
  changed_by_user_id UUID,
  changed_by_admin_id UUID,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE subscription_change_log IS 'History of subscription plan changes for audit and rollback';
CREATE INDEX IF NOT EXISTS idx_subscription_change_log_sub ON subscription_change_log(subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscription_change_log_created ON subscription_change_log(created_at DESC);

-- Optional: previous plan code on subscription for quick access
ALTER TABLE subscription ADD COLUMN IF NOT EXISTS previous_plan_code TEXT;

-- ========================================
-- 3) DOWNGRADE GRACE: PENDING PLAN AT PERIOD END
-- ========================================
ALTER TABLE subscription ADD COLUMN IF NOT EXISTS pending_plan_id UUID REFERENCES subscription_plan(id);
ALTER TABLE subscription ADD COLUMN IF NOT EXISTS pending_effective_at TIMESTAMPTZ;

COMMENT ON COLUMN subscription.pending_plan_id IS 'Plan to switch to at period end (apply_at_period_end flow)';
COMMENT ON COLUMN subscription.pending_effective_at IS 'When pending_plan_id takes effect';

-- ========================================
-- 4) USAGE_METER: Ensure unique constraint (already exists in 0022: tenant_id, tenant_type, meter_type, period_start_date)
-- Add index for (tenant_type, tenant_id, meter_type, period_start_date) for consistent window lookups
-- ========================================
CREATE INDEX IF NOT EXISTS idx_usage_meter_tenant_type_meter_window
  ON usage_meter(tenant_type, tenant_id, meter_type, period_start_date);

-- ========================================
-- 5) ADMIN_AUDIT_LOG: Add request_id if missing (for correlation)
-- ========================================
ALTER TABLE admin_audit_log ADD COLUMN IF NOT EXISTS request_id TEXT;
