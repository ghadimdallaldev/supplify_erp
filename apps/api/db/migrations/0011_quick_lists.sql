-- Migration: 0011_quick_lists.sql
-- Description: Add tables for Quick Lists / Recurring Orders

-- Quick List Table
CREATE TABLE IF NOT EXISTS quick_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES supplier(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  -- Scheduling fields (optional - for recurring orders)
  is_scheduled BOOLEAN NOT NULL DEFAULT false,
  frequency TEXT CHECK (frequency IN ('DAILY', 'WEEKLY', 'WEEKLY_3X', 'BIWEEKLY', 'MONTHLY')),
  days_of_week JSONB, -- Array of day names ["MONDAY", "WEDNESDAY", "FRIDAY"]
  preferred_time TIME, -- Preferred delivery time
  next_execution_date DATE,
  last_execution_date DATE,
  status TEXT CHECK (status IN ('ACTIVE', 'PAUSED')) DEFAULT 'ACTIVE',
  auto_create_order BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Quick List Item Table
CREATE TABLE IF NOT EXISTS quick_list_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quick_list_id UUID NOT NULL REFERENCES quick_list(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  quantity NUMERIC(14,3) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(quick_list_id, product_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_quick_list_restaurant ON quick_list(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_quick_list_item_list ON quick_list_item(quick_list_id);
CREATE INDEX IF NOT EXISTS idx_quick_list_item_product ON quick_list_item(product_id);

-- Add comment
COMMENT ON TABLE quick_list IS 'Stores restaurant quick lists for recurring orders';
COMMENT ON TABLE quick_list_item IS 'Stores items within each quick list';

