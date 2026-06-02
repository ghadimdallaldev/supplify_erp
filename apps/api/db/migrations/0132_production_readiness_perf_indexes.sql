-- Production readiness: indexes for dispatch, admin activity, conversion analytics.
-- Run EXPLAIN ANALYZE on staging if query plans still seq-scan at scale.

-- Fulfillment dispatch: filter orders by supplier via order_item + active statuses + placed_at
CREATE INDEX IF NOT EXISTS idx_order_item_supplier_order
  ON order_item (supplier_id, order_id);

CREATE INDEX IF NOT EXISTS idx_customer_order_placed_at_desc
  ON customer_order (placed_at DESC NULLS LAST)
  WHERE status IN ('ACKNOWLEDGED', 'PROCESSING', 'SHIPPED', 'COMPLETED');

-- Admin conversion / blocked-feature widgets
CREATE INDEX IF NOT EXISTS idx_conversion_event_created_at
  ON conversion_event (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversion_event_type_created
  ON conversion_event (event_type, created_at DESC);
