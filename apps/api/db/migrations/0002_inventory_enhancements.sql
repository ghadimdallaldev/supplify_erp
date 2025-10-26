-- Migration: 0002_inventory_enhancements.sql
-- Description: Add inventory management features for suppliers

-- Create warehouse table
CREATE TABLE warehouse (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  address_json JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for warehouse
CREATE INDEX idx_warehouse_supplier ON warehouse(supplier_id);

-- Modify inventory table to include warehouse support
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouse(id) ON DELETE SET NULL;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS reserved_qty NUMERIC(14,3) NOT NULL DEFAULT 0;

-- Create inventory_adjustment table for tracking stock adjustments
CREATE TABLE inventory_adjustment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  warehouse_id UUID REFERENCES warehouse(id) ON DELETE SET NULL,
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('IN', 'OUT')),
  quantity NUMERIC(12,3) NOT NULL,
  reason TEXT NOT NULL,
  notes TEXT,
  actor_sub TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for inventory_adjustment
CREATE INDEX idx_inventory_adjustment_product ON inventory_adjustment(product_id);
CREATE INDEX idx_inventory_adjustment_created_at ON inventory_adjustment(created_at);

-- Create product_inventory_settings table for MOQ, lead times, etc.
CREATE TABLE product_inventory_settings (
  product_id UUID PRIMARY KEY REFERENCES product(id) ON DELETE CASCADE,
  moq NUMERIC(12,3) NOT NULL DEFAULT 1 CHECK (moq > 0), -- Minimum Order Quantity
  order_multiple NUMERIC(12,3) NOT NULL DEFAULT 1 CHECK (order_multiple > 0), -- Order in multiples of this
  lead_time_days INTEGER NOT NULL DEFAULT 0 CHECK (lead_time_days >= 0),
  delivery_windows JSONB, -- Array of delivery windows: [{day: "MONDAY", startTime: "09:00", endTime: "17:00"}]
  low_stock_threshold NUMERIC(14,3) DEFAULT 10,
  backorder_allowed BOOLEAN NOT NULL DEFAULT false,
  backorder_eta_days INTEGER CHECK (backorder_eta_days >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create inventory_alert table for low stock alerts
CREATE TABLE inventory_alert (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  warehouse_id UUID REFERENCES warehouse(id) ON DELETE SET NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('LOW_STOCK', 'OUT_OF_STOCK', 'EXPIRING_SOON')),
  threshold_value NUMERIC(14,3),
  current_value NUMERIC(14,3),
  is_acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for inventory_alert
CREATE INDEX idx_inventory_alert_product ON inventory_alert(product_id);
CREATE INDEX idx_inventory_alert_warehouse ON inventory_alert(warehouse_id);
CREATE INDEX idx_inventory_alert_acknowledged ON inventory_alert(is_acknowledged);

-- Add trigger to automatically create inventory record when product is created
CREATE OR REPLACE FUNCTION create_inventory_for_new_product()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO inventory (product_id, available_qty, updated_at)
  VALUES (NEW.id, 0, now())
  ON CONFLICT (product_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_create_inventory
AFTER INSERT ON product
FOR EACH ROW
EXECUTE FUNCTION create_inventory_for_new_product();

-- Add trigger to automatically create inventory settings when product is created
CREATE OR REPLACE FUNCTION create_inventory_settings_for_new_product()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO product_inventory_settings (product_id, moq, order_multiple, lead_time_days)
  VALUES (NEW.id, 1, 1, 0)
  ON CONFLICT (product_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_create_inventory_settings
AFTER INSERT ON product
FOR EACH ROW
EXECUTE FUNCTION create_inventory_settings_for_new_product();
