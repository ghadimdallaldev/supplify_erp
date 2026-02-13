-- Migration: 0050_conversion_events.sql
-- Lightweight conversion funnel tracking (no external analytics).
-- Events: VIEW_PLANS, BLOCKED_FEATURE, BLOCKED_LIMIT, OPEN_UPGRADE, UPGRADE_SUCCESS

CREATE TABLE IF NOT EXISTS conversion_event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  tenant_type TEXT NOT NULL CHECK (tenant_type IN ('RESTAURANT', 'SUPPLIER')),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'VIEW_PLANS',
    'BLOCKED_FEATURE',
    'BLOCKED_LIMIT',
    'OPEN_UPGRADE',
    'UPGRADE_SUCCESS'
  )),
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE conversion_event IS 'Conversion funnel events for blocks→upgrades analysis';
CREATE INDEX IF NOT EXISTS idx_conversion_event_tenant ON conversion_event(tenant_id, tenant_type);
CREATE INDEX IF NOT EXISTS idx_conversion_event_type ON conversion_event(event_type);
CREATE INDEX IF NOT EXISTS idx_conversion_event_created ON conversion_event(created_at DESC);
