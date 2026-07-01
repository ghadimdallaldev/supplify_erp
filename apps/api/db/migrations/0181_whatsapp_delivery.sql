-- WhatsApp server-side delivery: dedicated delivery log + first-class whatsapp_sent flag.
-- Historically WhatsApp delivery was recorded in notification_log.sms_sent (SMS is deprecated).

ALTER TABLE notification_log
  ADD COLUMN IF NOT EXISTS whatsapp_sent BOOLEAN DEFAULT false;

-- Backfill: prior WhatsApp sends were tracked in the repurposed sms_sent column.
UPDATE notification_log
SET whatsapp_sent = sms_sent
WHERE whatsapp_sent IS DISTINCT FROM sms_sent
  AND sms_sent IS TRUE;

CREATE TABLE IF NOT EXISTS whatsapp_delivery_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  recipient TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'notification',
  event_key TEXT,
  status TEXT NOT NULL CHECK (status IN ('sent', 'log_only', 'skipped', 'failed')),
  provider TEXT,
  message_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_delivery_log_created
  ON whatsapp_delivery_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_delivery_log_tenant
  ON whatsapp_delivery_log (tenant_id, created_at DESC);

COMMENT ON TABLE whatsapp_delivery_log IS 'Audit of server-side WhatsApp (Meta Cloud API) delivery attempts';
