-- Migration: Branches & Warehouses
-- Supports restaurant branches and supplier warehouses with plan-based limits

-- ========================================
-- RESTAURANT BRANCHES
-- ========================================
CREATE TABLE IF NOT EXISTS branch (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  address JSONB,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_branch_tenant ON branch(tenant_id);
CREATE INDEX IF NOT EXISTS idx_branch_active ON branch(tenant_id, is_active) WHERE is_active = TRUE;

-- ========================================
-- SUPPLIER WAREHOUSES
-- ========================================
CREATE TABLE IF NOT EXISTS warehouse (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  address JSONB,
  capacity JSONB, -- {pallets, m3, temp_zones}
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_warehouse_tenant ON warehouse(tenant_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_active ON warehouse(tenant_id, is_active) WHERE is_active = TRUE;

-- ========================================
-- TENANT USAGE COUNTERS
-- ========================================
CREATE TABLE IF NOT EXISTS tenant_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  tenant_type TEXT NOT NULL CHECK (tenant_type IN ('SUPPLIER', 'RESTAURANT')),
  -- Restaurant counters
  branches_count INT DEFAULT 0,
  -- Supplier counters
  warehouses_count INT DEFAULT 0,
  products_count INT DEFAULT 0,
  -- Shared counters
  orders_today INT DEFAULT 0,
  chats_today INT DEFAULT 0,
  exports_today INT DEFAULT 0,
  webhooks_today INT DEFAULT 0,
  picklists_today INT DEFAULT 0,
  products_tracked INT DEFAULT 0,
  -- Metadata
  period_start_date DATE DEFAULT CURRENT_DATE,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, tenant_type, period_start_date)
);

CREATE INDEX IF NOT EXISTS idx_tenant_usage_tenant ON tenant_usage(tenant_id, tenant_type);
CREATE INDEX IF NOT EXISTS idx_tenant_usage_date ON tenant_usage(period_start_date);

-- ========================================
-- PLAN SNAPSHOTS (for audit trail)
-- ========================================
CREATE TABLE IF NOT EXISTS tenant_plan_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  tenant_type TEXT NOT NULL,
  subscription_id UUID REFERENCES subscription(id),
  plan_code TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  features JSONB NOT NULL,
  limits JSONB NOT NULL,
  captured_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plan_snapshot_tenant ON tenant_plan_snapshot(tenant_id, tenant_type);
CREATE INDEX IF NOT EXISTS idx_plan_snapshot_date ON tenant_plan_snapshot(captured_at);

-- ========================================
-- UPDATE TRIGGERS
-- ========================================
DROP TRIGGER IF EXISTS update_branch_updated_at_trigger ON branch;
CREATE TRIGGER update_branch_updated_at_trigger
  BEFORE UPDATE ON branch
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_warehouse_updated_at_trigger ON warehouse;
CREATE TRIGGER update_warehouse_updated_at_trigger
  BEFORE UPDATE ON warehouse
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- ADD BRANCH_ID TO EXISTING TABLES
-- ========================================

-- Orders: add branch_id for restaurants
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'customer_order' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE customer_order ADD COLUMN branch_id UUID REFERENCES branch(id);
    CREATE INDEX IF NOT EXISTS idx_order_branch ON customer_order(branch_id);
  END IF;
END $$;

-- Inventory movements: add branch_id (restaurant) and warehouse_id (supplier)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'inventory_movement_log' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE inventory_movement_log ADD COLUMN branch_id UUID REFERENCES branch(id);
    CREATE INDEX IF NOT EXISTS idx_inventory_movement_branch ON inventory_movement_log(branch_id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'inventory_movement_log' AND column_name = 'warehouse_id'
  ) THEN
    ALTER TABLE inventory_movement_log ADD COLUMN warehouse_id UUID REFERENCES warehouse(id);
    CREATE INDEX IF NOT EXISTS idx_inventory_movement_warehouse ON inventory_movement_log(warehouse_id);
  END IF;
END $$;

-- Receiving logs: add branch_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'receiving_log' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE receiving_log ADD COLUMN branch_id UUID REFERENCES branch(id);
    CREATE INDEX IF NOT EXISTS idx_receiving_branch ON receiving_log(branch_id);
  END IF;
END $$;

-- Picking lists: add warehouse_id (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'picking_list') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'picking_list' AND column_name = 'warehouse_id'
    ) THEN
      ALTER TABLE picking_list ADD COLUMN warehouse_id UUID REFERENCES warehouse(id);
      CREATE INDEX IF NOT EXISTS idx_picking_warehouse ON picking_list(warehouse_id);
    END IF;
  END IF;
END $$;

-- ========================================
-- USAGE UPDATE FUNCTIONS
-- ========================================

-- Function to increment branch count
CREATE OR REPLACE FUNCTION increment_branch_count()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO tenant_usage (tenant_id, tenant_type, branches_count, period_start_date)
  VALUES (NEW.tenant_id, 'RESTAURANT', 1, CURRENT_DATE)
  ON CONFLICT (tenant_id, tenant_type, period_start_date)
  DO UPDATE SET branches_count = tenant_usage.branches_count + 1, updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to decrement branch count
CREATE OR REPLACE FUNCTION decrement_branch_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE tenant_usage
  SET branches_count = GREATEST(0, branches_count - 1), updated_at = CURRENT_TIMESTAMP
  WHERE tenant_id = OLD.tenant_id AND tenant_type = 'RESTAURANT';
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Function to increment warehouse count
CREATE OR REPLACE FUNCTION increment_warehouse_count()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO tenant_usage (tenant_id, tenant_type, warehouses_count, period_start_date)
  VALUES (NEW.tenant_id, 'SUPPLIER', 1, CURRENT_DATE)
  ON CONFLICT (tenant_id, tenant_type, period_start_date)
  DO UPDATE SET warehouses_count = tenant_usage.warehouses_count + 1, updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to decrement warehouse count
CREATE OR REPLACE FUNCTION decrement_warehouse_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE tenant_usage
  SET warehouses_count = GREATEST(0, warehouses_count - 1), updated_at = CURRENT_TIMESTAMP
  WHERE tenant_id = OLD.tenant_id AND tenant_type = 'SUPPLIER';
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- TRIGGERS FOR AUTO-UPDATE
-- ========================================

-- Branch count triggers
DROP TRIGGER IF EXISTS trigger_increment_branch_count ON branch;
CREATE TRIGGER trigger_increment_branch_count
  AFTER INSERT ON branch
  FOR EACH ROW
  WHEN (NEW.is_active = TRUE)
  EXECUTE FUNCTION increment_branch_count();

DROP TRIGGER IF EXISTS trigger_decrement_branch_count ON branch;
CREATE TRIGGER trigger_decrement_branch_count
  AFTER DELETE ON branch
  FOR EACH ROW
  EXECUTE FUNCTION decrement_branch_count();

-- Warehouse count triggers
DROP TRIGGER IF EXISTS trigger_increment_warehouse_count ON warehouse;
CREATE TRIGGER trigger_increment_warehouse_count
  AFTER INSERT ON warehouse
  FOR EACH ROW
  WHEN (NEW.is_active = TRUE)
  EXECUTE FUNCTION increment_warehouse_count();

DROP TRIGGER IF EXISTS trigger_decrement_warehouse_count ON warehouse;
CREATE TRIGGER trigger_decrement_warehouse_count
  AFTER DELETE ON warehouse
  FOR EACH ROW
  EXECUTE FUNCTION decrement_warehouse_count();

-- ========================================
-- SEED INITIAL DATA (if needed)
-- ========================================

-- Create default branch for existing restaurants
INSERT INTO branch (tenant_id, name, code, address)
SELECT 
  id,
  name || ' - Main Branch',
  'MAIN',
  jsonb_build_object(
    'street', address_line1,
    'city', city,
    'state', state,
    'zip', postal_code,
    'country', country
  )
FROM restaurant
WHERE NOT EXISTS (
  SELECT 1 FROM branch WHERE branch.tenant_id = restaurant.id
)
ON CONFLICT DO NOTHING;

-- Create default warehouse for existing suppliers
INSERT INTO warehouse (tenant_id, name, code, address)
SELECT 
  id,
  name || ' - Main Warehouse',
  'MAIN',
  jsonb_build_object(
    'street', address_line1,
    'city', city,
    'state', state,
    'zip', postal_code,
    'country', country
  )
FROM supplier
WHERE NOT EXISTS (
  SELECT 1 FROM warehouse WHERE warehouse.tenant_id = supplier.id
)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE branch IS 'Restaurant branches for multi-location operations';
COMMENT ON TABLE warehouse IS 'Supplier warehouses for inventory management';
COMMENT ON TABLE tenant_usage IS 'Real-time usage counters for plan enforcement';
COMMENT ON TABLE tenant_plan_snapshot IS 'Historical snapshots of plan features and limits';

