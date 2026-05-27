-- Migration: 0111_dispute_replacement_orders.sql
-- Link dispute replacement resolutions to follow-up customer orders

ALTER TABLE disputes
  ADD COLUMN IF NOT EXISTS replacement_order_id UUID REFERENCES customer_order(id) ON DELETE SET NULL;

ALTER TABLE customer_order
  ADD COLUMN IF NOT EXISTS source_order_id UUID REFERENCES customer_order(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_dispute_id UUID REFERENCES disputes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE order_item
  ADD COLUMN IF NOT EXISTS source_order_item_id UUID REFERENCES order_item(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS original_unit_price NUMERIC(12, 3);

CREATE INDEX IF NOT EXISTS idx_disputes_replacement_order_id
  ON disputes(replacement_order_id)
  WHERE replacement_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_order_source_dispute_id
  ON customer_order(source_dispute_id)
  WHERE source_dispute_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_order_source_order_id
  ON customer_order(source_order_id)
  WHERE source_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_order_placement_source
  ON customer_order(placement_source)
  WHERE placement_source IS NOT NULL;

COMMENT ON COLUMN disputes.replacement_order_id IS 'Follow-up order created when dispute resolved with replacement';
COMMENT ON COLUMN customer_order.source_order_id IS 'Original order for dispute replacement shipments';
COMMENT ON COLUMN customer_order.source_dispute_id IS 'Dispute that triggered this replacement order';
COMMENT ON COLUMN order_item.source_order_item_id IS 'Original order line this replacement line fulfills';
COMMENT ON COLUMN order_item.original_unit_price IS 'Unit price on original order before replacement ($0 replacement lines)';
