-- Migration: 0014_restaurant_inventory_enhancements.sql
-- Description: Enhance restaurant inventory with movement logs, adjustments, and low-stock tracking

CREATE TABLE IF NOT EXISTS inventory_movement_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  quantity NUMERIC(14,3) NOT NULL,
  balance_before NUMERIC(14,3),
  balance_after NUMERIC(14,3),
  reason TEXT,
  reference_id UUID,
  reference_type TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Extend supplier inventory_adjustment (0002) for restaurant-scoped rows
ALTER TABLE inventory_adjustment ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES restaurant(id) ON DELETE CASCADE;
ALTER TABLE inventory_adjustment ADD COLUMN IF NOT EXISTS created_by UUID;

ALTER TABLE restaurant_inventory ADD COLUMN IF NOT EXISTS low_stock_threshold NUMERIC(14,3);
ALTER TABLE restaurant_inventory ADD COLUMN IF NOT EXISTS branch_id UUID;

CREATE INDEX IF NOT EXISTS idx_movement_restaurant ON inventory_movement_log(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_movement_product ON inventory_movement_log(product_id);
CREATE INDEX IF NOT EXISTS idx_movement_created ON inventory_movement_log(created_at);
CREATE INDEX IF NOT EXISTS idx_adjustment_restaurant ON inventory_adjustment(restaurant_id) WHERE restaurant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_adjustment_product ON inventory_adjustment(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_low_stock ON restaurant_inventory(low_stock_threshold) WHERE low_stock_threshold IS NOT NULL;

COMMENT ON TABLE inventory_movement_log IS 'Tracks all inventory movements for audit trail';
