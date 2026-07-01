-- Outbound notification webhooks for the Platinum "email_whatsapp_webhook" tier.
-- One endpoint per tenant; deliveries are HMAC-signed and audited.

CREATE TABLE IF NOT EXISTS notification_webhook (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  tenant_type TEXT NOT NULL CHECK (tenant_type IN ('SUPPLIER', 'RESTAURANT', 'ADMIN')),
  url TEXT NOT NULL,
  secret TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, tenant_type)
);

CREATE TABLE IF NOT EXISTS notification_webhook_delivery_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  tenant_type TEXT NOT NULL,
  url TEXT NOT NULL,
  event_category TEXT,
  status TEXT NOT NULL CHECK (status IN ('sent', 'skipped', 'failed')),
  http_status INT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_webhook_delivery_tenant
  ON notification_webhook_delivery_log (tenant_id, created_at DESC);

COMMENT ON TABLE notification_webhook IS 'Per-tenant outbound notification webhook endpoint (Platinum tier)';
COMMENT ON TABLE notification_webhook_delivery_log IS 'Audit of outbound notification webhook delivery attempts';
