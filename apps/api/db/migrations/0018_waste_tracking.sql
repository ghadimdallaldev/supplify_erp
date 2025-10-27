-- Migration: 0018_waste_tracking.sql
-- Description: Enhanced waste and spoilage tracking for restaurants

-- Add additional fields to inventory_adjustment for better waste tracking
ALTER TABLE inventory_adjustment ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(12,3);
ALTER TABLE inventory_adjustment ADD COLUMN IF NOT EXISTS total_cost NUMERIC(14,3);
ALTER TABLE inventory_adjustment ADD COLUMN IF NOT EXISTS waste_category TEXT; -- 'OVER_PRODUCTION', 'SPOILAGE', 'BREAKAGE', 'EXPIRED', 'OVERPORTIONING', 'OTHER'
ALTER TABLE inventory_adjustment ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branch(id);

-- Create waste_analytics table for aggregated waste data
CREATE TABLE IF NOT EXISTS waste_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  
  -- Time period
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  -- Waste metrics
  total_waste_qty NUMERIC(14,3) NOT NULL DEFAULT 0,
  total_waste_cost NUMERIC(14,3) NOT NULL DEFAULT 0,
  waste_incidents INTEGER NOT NULL DEFAULT 0,
  
  -- Wastage (preparation waste)
  wastage_qty NUMERIC(14,3) NOT NULL DEFAULT 0,
  wastage_cost NUMERIC(14,3) NOT NULL DEFAULT 0,
  wastage_incidents INTEGER NOT NULL DEFAULT 0,
  
  -- Spoilage (food gone bad)
  spoilage_qty NUMERIC(14,3) NOT NULL DEFAULT 0,
  spoilage_cost NUMERIC(14,3) NOT NULL DEFAULT 0,
  spoilage_incidents INTEGER NOT NULL DEFAULT 0,
  
  -- Category breakdown (stored as JSONB for flexibility)
  category_breakdown JSONB, -- {'OVER_PRODUCTION': 100.50, 'EXPIRED': 50.25, ...}
  
  -- Percentage metrics
  waste_percentage NUMERIC(5,2), -- Percentage of total inventory
  avg_waste_per_incident NUMERIC(14,3),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(restaurant_id, product_id, period_start, period_end)
);

-- Indexes for waste analytics
CREATE INDEX IF NOT EXISTS idx_waste_analytics_restaurant ON waste_analytics(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_waste_analytics_product ON waste_analytics(product_id);
CREATE INDEX IF NOT EXISTS idx_waste_analytics_period ON waste_analytics(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_adjustment_type_created ON inventory_adjustment(adjustment_type, created_at) 
  WHERE adjustment_type IN ('WASTAGE', 'SPOILAGE');
CREATE INDEX IF NOT EXISTS idx_movement_type_created ON inventory_movement_log(type, created_at) 
  WHERE type IN ('WASTAGE', 'SPOILAGE');

-- Add comments
COMMENT ON TABLE waste_analytics IS 'Aggregated waste metrics for restaurants by product and time period';
COMMENT ON COLUMN inventory_adjustment.waste_category IS 'Type of waste: OVER_PRODUCTION, SPOILAGE, BREAKAGE, EXPIRED, OVERPORTIONING, OTHER';

