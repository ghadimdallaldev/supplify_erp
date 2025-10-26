-- Migration: 0004_restaurant_inventory.sql
-- Description: Add restaurant inventory table to track stock at restaurants

-- Create restaurant_inventory table
CREATE TABLE IF NOT EXISTS restaurant_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
  min_stock_threshold NUMERIC(14,3) DEFAULT 0,
  max_stock_level NUMERIC(14,3),
  last_restocked_at TIMESTAMPTZ,
  expiry_date TIMESTAMPTZ,
  storage_location TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Ensure one inventory record per restaurant-product combination
  UNIQUE(restaurant_id, product_id)
);

-- Create indexes for restaurant_inventory
CREATE INDEX idx_restaurant_inventory_restaurant ON restaurant_inventory(restaurant_id);
CREATE INDEX idx_restaurant_inventory_product ON restaurant_inventory(product_id);
CREATE INDEX idx_restaurant_inventory_low_stock ON restaurant_inventory(restaurant_id, quantity) 
  WHERE quantity <= 10; -- Index for quick low-stock queries
