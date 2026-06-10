-- Dedup log for trial-ending-soon cron notifications
CREATE TABLE IF NOT EXISTS billing_trial_reminder_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  tenant_type TEXT NOT NULL,
  expiry_date DATE NOT NULL,
  days_left INT NOT NULL,
  notification_log_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, tenant_type, expiry_date, days_left)
);

CREATE INDEX IF NOT EXISTS idx_billing_trial_reminder_tenant
  ON billing_trial_reminder_log(tenant_id, tenant_type);

COMMENT ON TABLE billing_trial_reminder_log IS 'Prevents duplicate trial-ending-soon notifications per tenant per expiry window';
