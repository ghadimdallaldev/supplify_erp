-- Migration: 0047_system_events_observability.sql
-- Phase C: system_event for health/observability; indexes for finance queries

-- ========================================
-- SYSTEM_EVENT (minimal storage for errors / health signals)
-- ========================================
CREATE TABLE IF NOT EXISTS system_event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warn', 'error')),
  source TEXT,
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE system_event IS 'System events for health dashboards: API errors, job failures, etc.';
CREATE INDEX IF NOT EXISTS idx_system_event_created_at ON system_event(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_event_type ON system_event(type);
CREATE INDEX IF NOT EXISTS idx_system_event_severity ON system_event(severity) WHERE severity = 'error';

-- ========================================
-- INVOICE INDEXES (for admin finance overview)
-- ========================================
CREATE INDEX IF NOT EXISTS idx_invoice_status_due_date ON invoice(status, due_date);
CREATE INDEX IF NOT EXISTS idx_invoice_restaurant_dates ON invoice(restaurant_id, status, due_date) WHERE restaurant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoice_supplier_dates ON invoice(supplier_id, status, due_date);
