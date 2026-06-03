-- Email delivery audit + idempotency for transactional sends

CREATE TABLE IF NOT EXISTS email_delivery_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  recipient TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_key TEXT NOT NULL,
  subject TEXT,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped', 'log_only')),
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_delivery_event_key ON email_delivery_log(event_key);
CREATE INDEX IF NOT EXISTS idx_email_delivery_recipient ON email_delivery_log(recipient, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_delivery_tenant ON email_delivery_log(tenant_id, created_at DESC);

ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS notify_billing BOOLEAN DEFAULT true;

COMMENT ON TABLE email_delivery_log IS 'Cross-cutting email send log and idempotency ledger';
