-- Meta WhatsApp inbound webhooks: audit log + delivery status updates from Meta.

ALTER TABLE whatsapp_delivery_log
  ADD COLUMN IF NOT EXISTS meta_status TEXT,
  ADD COLUMN IF NOT EXISTS meta_status_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS meta_error TEXT;

CREATE INDEX IF NOT EXISTS idx_whatsapp_delivery_log_message_id
  ON whatsapp_delivery_log (message_id)
  WHERE message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS whatsapp_webhook_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL CHECK (event_type IN ('message', 'status', 'other')),
  phone_number_id TEXT,
  wa_message_id TEXT,
  from_phone TEXT,
  to_phone TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_log_created
  ON whatsapp_webhook_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_log_wa_message_id
  ON whatsapp_webhook_log (wa_message_id)
  WHERE wa_message_id IS NOT NULL;

COMMENT ON TABLE whatsapp_webhook_log IS 'Inbound Meta WhatsApp webhook events (messages + delivery statuses)';
