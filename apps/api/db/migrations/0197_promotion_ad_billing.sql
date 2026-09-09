-- Promotion ad billing: link boosts & featured placements to billing_invoice (sponsorship pattern).

ALTER TABLE promotions
  ADD COLUMN IF NOT EXISTS billing_invoice_id UUID REFERENCES billing_invoice(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_promotions_billing_invoice
  ON promotions (billing_invoice_id)
  WHERE billing_invoice_id IS NOT NULL;

ALTER TABLE deal_promotions
  ADD COLUMN IF NOT EXISTS billing_invoice_id UUID REFERENCES billing_invoice(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_deal_promotions_billing_invoice
  ON deal_promotions (billing_invoice_id)
  WHERE billing_invoice_id IS NOT NULL;

ALTER TABLE supplier_featured_placements
  ADD COLUMN IF NOT EXISTS billing_invoice_id UUID REFERENCES billing_invoice(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_featured_placements_billing_invoice
  ON supplier_featured_placements (billing_invoice_id)
  WHERE billing_invoice_id IS NOT NULL;

ALTER TABLE supplier_featured_placements
  DROP CONSTRAINT IF EXISTS supplier_featured_placements_payment_status_check;

ALTER TABLE supplier_featured_placements
  ADD CONSTRAINT supplier_featured_placements_payment_status_check
  CHECK (payment_status IN ('pending', 'paid', 'waived', 'failed', 'refunded'));

COMMENT ON COLUMN promotions.billing_invoice_id IS 'OPEN/PAID billing_invoice for deal boost activation (metadata.type=deal_boost)';
COMMENT ON COLUMN supplier_featured_placements.billing_invoice_id IS 'billing_invoice for featured placement (metadata.type=featured_placement)';
