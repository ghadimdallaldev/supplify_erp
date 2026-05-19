-- Migration: 0071_reports_analytics_indexes.sql
-- Description: Indexes to support reports & analytics queries

CREATE INDEX IF NOT EXISTS idx_customer_order_restaurant_placed
  ON customer_order(restaurant_id, placed_at DESC)
  WHERE placed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_order_branch_placed
  ON customer_order(branch_id, placed_at DESC)
  WHERE branch_id IS NOT NULL AND placed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_item_supplier_order
  ON order_item(supplier_id, order_id);

CREATE INDEX IF NOT EXISTS idx_invoice_restaurant_date
  ON invoice(restaurant_id, invoice_date DESC);

CREATE INDEX IF NOT EXISTS idx_invoice_supplier_date
  ON invoice(supplier_id, invoice_date DESC);

CREATE INDEX IF NOT EXISTS idx_invoice_status_due
  ON invoice(status, due_date)
  WHERE status NOT IN ('PAID', 'VOID');

CREATE INDEX IF NOT EXISTS idx_receiving_report_restaurant_received
  ON receiving_report(restaurant_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_adjustment_waste
  ON inventory_adjustment(restaurant_id, created_at DESC)
  WHERE adjustment_type IN ('WASTAGE', 'SPOILAGE');
