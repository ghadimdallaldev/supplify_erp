-- Migration: 0139_railway_hot_path_indexes.sql
-- Hot-path indexes for Phase 3 Railway API latency (inventory usage CTE, receiving, middleware).

CREATE INDEX IF NOT EXISTS idx_inventory_movement_restaurant_product_type_created
  ON inventory_movement_log (restaurant_id, product_id, type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_receiving_report_order_status
  ON receiving_report (order_id, status);

CREATE INDEX IF NOT EXISTS idx_restaurant_inventory_restaurant_updated
  ON restaurant_inventory (restaurant_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_subscription_tenant_created
  ON subscription (tenant_id, tenant_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reorder_cadence_reminder_restaurant_date
  ON reorder_cadence_reminder_log (reminder_date DESC);

CREATE INDEX IF NOT EXISTS idx_quick_list_restaurant_branch
  ON quick_list (restaurant_id, branch_id);
