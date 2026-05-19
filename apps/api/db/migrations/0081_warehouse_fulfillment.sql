-- Warehouse fulfillment: extended warehouse fields, per-warehouse inventory, routing, order assignments

-- Extend warehouse (singular table used throughout the codebase)
ALTER TABLE warehouse
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS type VARCHAR(30) DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS capacity_sqm NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS operating_hours JSONB,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Sync is_default from legacy is_main where present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'warehouse' AND column_name = 'is_main'
  ) THEN
    UPDATE warehouse SET is_default = COALESCE(is_default, is_main) WHERE is_main = TRUE;
  END IF;
END $$;

-- Type constraint (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'warehouse_type_check'
  ) THEN
    ALTER TABLE warehouse ADD CONSTRAINT warehouse_type_check
      CHECK (type IN ('standard', 'cold_storage', 'dry_goods', 'bonded', 'cross_dock'));
  END IF;
END $$;

-- One default active warehouse per supplier (tenant_id or supplier_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_warehouse_default_supplier
  ON warehouse (COALESCE(tenant_id, supplier_id))
  WHERE is_default = TRUE AND is_active = TRUE;

-- Supplier fulfillment preferences
ALTER TABLE supplier
  ADD COLUMN IF NOT EXISTS multi_warehouse_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS default_warehouse_id UUID REFERENCES warehouse(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fulfillment_mode VARCHAR(20) DEFAULT 'single';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supplier_fulfillment_mode_check') THEN
    ALTER TABLE supplier ADD CONSTRAINT supplier_fulfillment_mode_check
      CHECK (fulfillment_mode IN ('single', 'multi'));
  END IF;
END $$;

-- Per-warehouse stock (multi-warehouse mode)
CREATE TABLE IF NOT EXISTS warehouse_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID NOT NULL REFERENCES warehouse(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  quantity_available NUMERIC(12,3) DEFAULT 0,
  quantity_reserved NUMERIC(12,3) DEFAULT 0,
  quantity_on_hand NUMERIC(12,3) DEFAULT 0,
  reorder_point NUMERIC(12,3),
  reorder_quantity NUMERIC(12,3),
  last_counted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(warehouse_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_warehouse ON warehouse_inventory(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_product ON warehouse_inventory(product_id);

-- delivery_zone (from 0005) — create if missing, then extend for per-warehouse zones
CREATE TABLE IF NOT EXISTS delivery_zone (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  warehouse_id UUID REFERENCES warehouse(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  coverage_area_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  delivery_fee NUMERIC(12,2) DEFAULT 0,
  min_order_amount NUMERIC(12,2) DEFAULT 0,
  delivery_time_days INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_zone_supplier ON delivery_zone(supplier_id);
CREATE INDEX IF NOT EXISTS idx_delivery_zone_warehouse ON delivery_zone(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_delivery_zone_active ON delivery_zone(supplier_id) WHERE is_active = true;

ALTER TABLE delivery_zone
  ADD COLUMN IF NOT EXISTS zone_type VARCHAR(20) DEFAULT 'polygon',
  ADD COLUMN IF NOT EXISTS geometry JSONB,
  ADD COLUMN IF NOT EXISTS postal_codes TEXT[],
  ADD COLUMN IF NOT EXISTS radius_km NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS center_lat NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS center_lng NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS estimated_delivery_hours INTEGER;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'delivery_zone'
  ) AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_zone_type_check') THEN
    ALTER TABLE delivery_zone ADD CONSTRAINT delivery_zone_type_check
      CHECK (zone_type IN ('polygon', 'radius', 'postal_codes'));
  END IF;
END $$;

-- Order ↔ warehouse assignments
CREATE TABLE IF NOT EXISTS order_warehouse_assignment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES customer_order(id) ON DELETE CASCADE,
  order_item_id UUID REFERENCES order_item(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouse(id),
  assigned_by VARCHAR(20) DEFAULT 'auto' CHECK (assigned_by IN ('auto', 'manual')),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  status VARCHAR(30) DEFAULT 'pending'
    CHECK (status IN ('pending', 'picking', 'packed', 'dispatched', 'delivered', 'failed')),
  dispatched_at TIMESTAMPTZ,
  notes TEXT,
  UNIQUE(order_item_id)
);

CREATE INDEX IF NOT EXISTS idx_order_warehouse_assignment_order ON order_warehouse_assignment(order_id);
CREATE INDEX IF NOT EXISTS idx_order_warehouse_assignment_warehouse ON order_warehouse_assignment(warehouse_id, status);

-- Routing rules (multi-warehouse)
CREATE TABLE IF NOT EXISTS warehouse_routing_rule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouse(id) ON DELETE CASCADE,
  priority INTEGER DEFAULT 1,
  rule_type VARCHAR(30) NOT NULL CHECK (rule_type IN (
    'product', 'category', 'zone', 'stock_available', 'default'
  )),
  product_id UUID REFERENCES product(id) ON DELETE CASCADE,
  category_id UUID REFERENCES product_category(id) ON DELETE CASCADE,
  zone_id UUID REFERENCES delivery_zone(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_warehouse_routing_rule_supplier ON warehouse_routing_rule(supplier_id, priority);

-- Feature flags
INSERT INTO feature_flag (feature_key, feature_name, description, global_override) VALUES
  ('warehouses', 'Warehouses', 'Warehouse management, inventory per location, delivery zones', NULL),
  ('multi_warehouse', 'Multi-warehouse fulfillment', 'Split orders across warehouses with routing rules', NULL)
ON CONFLICT (feature_key) DO NOTHING;

-- Plan defaults: warehouses on Bronze+, multi_warehouse on Gold+
UPDATE subscription_plan
SET features = COALESCE(features, '{}'::jsonb) || '{"warehouses": true}'::jsonb,
    updated_at = now()
WHERE code IN ('bronze', 'gold', 'platinum')
  AND tenant_type = 'SUPPLIER';

UPDATE subscription_plan
SET features = jsonb_set(
      COALESCE(features, '{}'::jsonb),
      '{warehouses}',
      'false'::jsonb,
      true
    ),
    updated_at = now()
WHERE code = 'free' AND tenant_type = 'SUPPLIER';

UPDATE subscription_plan
SET features = COALESCE(features, '{}'::jsonb) || '{"multi_warehouse": true}'::jsonb,
    updated_at = now()
WHERE code IN ('gold', 'platinum')
  AND tenant_type = 'SUPPLIER';

UPDATE subscription_plan
SET features = jsonb_set(
      COALESCE(features, '{}'::jsonb),
      '{multi_warehouse}',
      'false'::jsonb,
      true
    ),
    updated_at = now()
WHERE code IN ('free', 'bronze') AND tenant_type = 'SUPPLIER';

COMMENT ON TABLE warehouse_inventory IS 'Stock levels per warehouse per product (multi-warehouse fulfillment)';
COMMENT ON TABLE order_warehouse_assignment IS 'Links orders/items to fulfilling warehouse';
COMMENT ON TABLE warehouse_routing_rule IS 'Supplier rules for multi-warehouse order routing';
