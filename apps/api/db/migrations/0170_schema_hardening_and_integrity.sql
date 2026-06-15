-- Migration: 0170_schema_hardening_and_integrity.sql
-- Partial indexes for expiry sweeps, billing lookups, and import job integrity

CREATE INDEX IF NOT EXISTS idx_growth_invitation_pending_expires
  ON supplier_growth_invitation (expires_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_connection_request_pending_expires
  ON supplier_connection_request (expires_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_sponsorship_active_expiry
  ON supplier_sponsorship (period_end)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_billing_invoice_tenant_paid
  ON billing_invoice (tenant_id, tenant_type, paid_at DESC)
  WHERE status = 'PAID';

CREATE INDEX IF NOT EXISTS idx_prospect_import_batch
  ON supplier_customer_prospect (import_batch_id)
  WHERE import_batch_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_image_import_active_supplier
  ON catalog_image_import_job (supplier_id)
  WHERE status IN ('pending', 'processing');

ALTER TABLE catalog_image_import_job
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
