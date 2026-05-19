-- Migration: 0072_disputes.sql
-- Dispute & returns management linked to orders, receiving, and credit notes

CREATE TABLE IF NOT EXISTS disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES customer_order(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  receiving_report_id UUID REFERENCES receiving_report(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES invoice(id) ON DELETE SET NULL,
  type VARCHAR(30) NOT NULL CHECK (
    type IN ('short_delivery', 'damaged_goods', 'wrong_items', 'quality_issue', 'billing_error', 'other')
  ),
  status VARCHAR(30) NOT NULL DEFAULT 'open' CHECK (
    status IN ('open', 'under_review', 'resolved', 'rejected', 'escalated', 'cancelled')
  ),
  description TEXT NOT NULL,
  disputed_amount NUMERIC(12, 2),
  resolution_type VARCHAR(30) CHECK (
    resolution_type IN ('credit_note', 'replacement', 'refund', 'no_action')
  ),
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  created_by UUID REFERENCES app_user(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dispute_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  order_item_id UUID REFERENCES order_item(id) ON DELETE SET NULL,
  product_name VARCHAR(255),
  quantity_ordered NUMERIC(10, 2),
  quantity_received NUMERIC(10, 2),
  unit_price NUMERIC(12, 2),
  issue_description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dispute_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  file_key VARCHAR(500) NOT NULL,
  file_name VARCHAR(255),
  uploaded_by UUID REFERENCES app_user(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Link dispute resolution to existing finance credit_note table
ALTER TABLE credit_note ADD COLUMN IF NOT EXISTS dispute_id UUID REFERENCES disputes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_disputes_order_id ON disputes(order_id);
CREATE INDEX IF NOT EXISTS idx_disputes_restaurant_status ON disputes(restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_disputes_supplier_status ON disputes(supplier_id, status);
CREATE INDEX IF NOT EXISTS idx_dispute_items_dispute_id ON dispute_items(dispute_id);
CREATE INDEX IF NOT EXISTS idx_dispute_attachments_dispute_id ON dispute_attachments(dispute_id);
CREATE INDEX IF NOT EXISTS idx_credit_note_dispute_id ON credit_note(dispute_id) WHERE dispute_id IS NOT NULL;

-- One active dispute per order at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_disputes_one_active_per_order
  ON disputes(order_id)
  WHERE status IN ('open', 'under_review', 'escalated');

UPDATE subscription_plan
SET
  features = COALESCE(features, '{}'::jsonb) || '{"disputes_returns": false}'::jsonb,
  updated_at = now()
WHERE code = 'free' AND tenant_type = 'RESTAURANT';

UPDATE subscription_plan
SET
  features = COALESCE(features, '{}'::jsonb) || '{"disputes_returns": true}'::jsonb,
  updated_at = now()
WHERE code IN ('bronze', 'gold', 'platinum') AND tenant_type = 'RESTAURANT';

UPDATE subscription_plan
SET
  features = COALESCE(features, '{}'::jsonb) || '{"disputes_returns": true}'::jsonb,
  updated_at = now()
WHERE code IN ('bronze', 'gold', 'platinum') AND tenant_type = 'SUPPLIER';
