-- Per-user AI request allowance. The plan limit (for example 300/day on Scale)
-- applies to each user independently. Tenant-wide usage_meter rows stay in
-- place for other meters and are no longer the source of truth for AI usage.

CREATE TABLE IF NOT EXISTS user_ai_request_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  tenant_type TEXT NOT NULL CHECK (tenant_type IN ('SUPPLIER', 'RESTAURANT')),
  meter_type TEXT NOT NULL,
  current_value INTEGER NOT NULL DEFAULT 0,
  period_type TEXT,
  period_start_date DATE NOT NULL,
  period_end_date DATE,
  limit_value INTEGER,
  is_over_limit BOOLEAN NOT NULL DEFAULT false,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, tenant_id, tenant_type, meter_type, period_start_date)
);

CREATE INDEX IF NOT EXISTS idx_user_ai_request_usage_tenant_period
  ON user_ai_request_usage (tenant_id, tenant_type, meter_type, period_start_date);

COMMENT ON TABLE user_ai_request_usage IS
  'AI request usage for one user inside a tenant. The plan limit is not shared across users.';
