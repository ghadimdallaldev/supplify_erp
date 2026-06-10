-- Cron follow-up: email retry payload, digest prefs, restaurant timezone, dedup logs

ALTER TABLE email_delivery_log
  ADD COLUMN IF NOT EXISTS retry_payload JSONB,
  ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_email_delivery_failed_retry
  ON email_delivery_log(status, retry_count, created_at DESC)
  WHERE status = 'failed';

ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS notify_email_digest BOOLEAN DEFAULT false;

ALTER TABLE restaurant
  ADD COLUMN IF NOT EXISTS timezone TEXT;

COMMENT ON COLUMN restaurant.timezone IS 'IANA timezone for cadence/reminders; NULL uses platform default';

CREATE TABLE IF NOT EXISTS gps_stale_alert_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL,
  supplier_id UUID NOT NULL,
  driver_assignment_id UUID,
  alert_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id, alert_date)
);

CREATE INDEX IF NOT EXISTS idx_gps_stale_alert_supplier
  ON gps_stale_alert_log(supplier_id, alert_date DESC);

CREATE TABLE IF NOT EXISTS email_digest_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  user_type TEXT NOT NULL,
  digest_date DATE NOT NULL,
  notification_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, user_type, digest_date)
);

COMMENT ON TABLE gps_stale_alert_log IS 'Dedupes proactive stale GPS alerts per order per day';
COMMENT ON TABLE email_digest_log IS 'Dedupes daily notification digest emails per user';
