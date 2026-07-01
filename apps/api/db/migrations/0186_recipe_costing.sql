-- Migration: 0186_recipe_costing.sql
-- Purchasing-linked recipe costing for restaurants.

-- ========================================
-- CORE RECIPE TABLES
-- ========================================

CREATE TABLE IF NOT EXISTS recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  internal_code TEXT,
  category TEXT,
  selling_price NUMERIC(12, 2) CHECK (selling_price IS NULL OR selling_price >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  target_food_cost_pct NUMERIC(6, 3) CHECK (target_food_cost_pct IS NULL OR (target_food_cost_pct > 0 AND target_food_cost_pct <= 100)),
  portion_count NUMERIC(10, 3) NOT NULL DEFAULT 1 CHECK (portion_count > 0),
  portion_size NUMERIC(14, 4),
  yield_unit TEXT,
  notes TEXT,
  instructions TEXT,
  image_file_key TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  cost_per_portion NUMERIC(14, 4),
  food_cost_pct NUMERIC(8, 4),
  gross_profit NUMERIC(14, 4),
  gross_margin_pct NUMERIC(8, 4),
  suggested_selling_price NUMERIC(12, 2),
  calc_status TEXT NOT NULL DEFAULT 'MISSING_DATA'
    CHECK (calc_status IN ('HEALTHY', 'WARNING', 'MISSING_DATA')),
  last_calculated_at TIMESTAMPTZ,
  last_price_impact_at TIMESTAMPTZ,
  created_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recipes_restaurant ON recipes(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_recipes_restaurant_active ON recipes(restaurant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_recipes_restaurant_status ON recipes(restaurant_id, calc_status);
CREATE INDEX IF NOT EXISTS idx_recipes_restaurant_category ON recipes(restaurant_id, category);
CREATE INDEX IF NOT EXISTS idx_recipes_last_calculated ON recipes(restaurant_id, last_calculated_at DESC);

CREATE TABLE IF NOT EXISTS recipe_branches (
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branch(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (recipe_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_recipe_branches_branch ON recipe_branches(branch_id);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  ingredient_type TEXT NOT NULL DEFAULT 'SUPPLIER_PRODUCT'
    CHECK (ingredient_type IN ('SUPPLIER_PRODUCT', 'INVENTORY_ITEM', 'MANUAL')),
  product_id UUID REFERENCES product(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES supplier(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  quantity NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  recipe_unit TEXT NOT NULL DEFAULT 'unit',
  purchase_unit TEXT,
  conversion_factor NUMERIC(18, 8),
  waste_pct NUMERIC(6, 3) NOT NULL DEFAULT 0 CHECK (waste_pct >= 0 AND waste_pct < 100),
  yield_pct NUMERIC(6, 3) NOT NULL DEFAULT 100 CHECK (yield_pct > 0 AND yield_pct <= 100),
  cost_source TEXT NOT NULL DEFAULT 'AUTO'
    CHECK (cost_source IN ('AUTO', 'INVOICE', 'LAST_RECEIVED', 'CONTRACT', 'CATALOG', 'MANUAL')),
  manual_unit_price NUMERIC(14, 4),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_product ON recipe_ingredients(product_id) WHERE product_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS recipe_unit_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  from_unit TEXT NOT NULL,
  to_unit TEXT NOT NULL,
  factor NUMERIC(18, 8) NOT NULL CHECK (factor > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, from_unit, to_unit)
);

CREATE INDEX IF NOT EXISTS idx_recipe_unit_conversions_restaurant ON recipe_unit_conversions(restaurant_id);

-- ========================================
-- COST CACHE & SNAPSHOTS
-- ========================================

CREATE TABLE IF NOT EXISTS restaurant_ingredient_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES supplier(id) ON DELETE SET NULL,
  branch_id UUID REFERENCES branch(id) ON DELETE SET NULL,
  unit_price NUMERIC(14, 4) NOT NULL CHECK (unit_price >= 0),
  unit TEXT NOT NULL DEFAULT 'unit',
  currency TEXT NOT NULL DEFAULT 'USD',
  cost_source TEXT NOT NULL
    CHECK (cost_source IN ('INVOICE', 'LAST_RECEIVED', 'CONTRACT', 'CATALOG', 'MANUAL')),
  source_ref_type TEXT,
  source_ref_id UUID,
  effective_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_restaurant_ingredient_costs_scope
  ON restaurant_ingredient_costs (
    restaurant_id,
    product_id,
    COALESCE(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE INDEX IF NOT EXISTS idx_restaurant_ingredient_costs_product ON restaurant_ingredient_costs(restaurant_id, product_id);

CREATE TABLE IF NOT EXISTS recipe_cost_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  triggered_by TEXT,
  totals JSONB NOT NULL DEFAULT '{}'::jsonb,
  ingredients JSONB NOT NULL DEFAULT '[]'::jsonb,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recipe_cost_snapshots_recipe ON recipe_cost_snapshots(recipe_id, created_at DESC);

-- ========================================
-- PRICE IMPACT & ALERTS
-- ========================================

CREATE TABLE IF NOT EXISTS supplier_price_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES supplier(id) ON DELETE SET NULL,
  product_name TEXT,
  old_price NUMERIC(14, 4),
  new_price NUMERIC(14, 4) NOT NULL,
  change_pct NUMERIC(10, 4),
  source TEXT NOT NULL
    CHECK (source IN ('CATALOG', 'CONTRACT', 'RECEIVING', 'INVOICE', 'MANUAL')),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_price_events_restaurant ON supplier_price_events(restaurant_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_price_events_product ON supplier_price_events(restaurant_id, product_id, detected_at DESC);

CREATE TABLE IF NOT EXISTS recipe_price_impacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_event_id UUID NOT NULL REFERENCES supplier_price_events(id) ON DELETE CASCADE,
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  old_cost_per_portion NUMERIC(14, 4),
  new_cost_per_portion NUMERIC(14, 4),
  cost_diff_amount NUMERIC(14, 4),
  cost_diff_pct NUMERIC(10, 4),
  old_food_cost_pct NUMERIC(8, 4),
  new_food_cost_pct NUMERIC(8, 4),
  target_food_cost_pct NUMERIC(6, 3),
  margin_impact NUMERIC(14, 4),
  suggested_selling_price NUMERIC(12, 2),
  status TEXT NOT NULL DEFAULT 'MISSING_DATA'
    CHECK (status IN ('HEALTHY', 'WARNING', 'MISSING_DATA')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (price_event_id, recipe_id)
);

CREATE INDEX IF NOT EXISTS idx_recipe_price_impacts_recipe ON recipe_price_impacts(recipe_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recipe_price_impacts_event ON recipe_price_impacts(price_event_id);

CREATE TABLE IF NOT EXISTS recipe_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL
    CHECK (alert_type IN (
      'ABOVE_TARGET_FC', 'MISSING_PRICE', 'MISSING_CONVERSION', 'MISSING_SELLING_PRICE',
      'INACTIVE_PRODUCT', 'PRICE_INCREASE', 'STALE_RECALC', 'BRANCH_PRICE_ISSUE', 'CREDIT_NOTE_ADJUSTMENT'
    )),
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'error')),
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recipe_alerts_recipe ON recipe_alerts(recipe_id) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_recipe_alerts_type ON recipe_alerts(recipe_id, alert_type) WHERE resolved_at IS NULL;

CREATE TABLE IF NOT EXISTS recipe_recalc_dirty (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  product_id UUID REFERENCES product(id) ON DELETE CASCADE,
  recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
  reason TEXT NOT NULL DEFAULT 'data_change',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_recipe_recalc_dirty_scope
  ON recipe_recalc_dirty (
    restaurant_id,
    COALESCE(product_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(recipe_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE INDEX IF NOT EXISTS idx_recipe_recalc_dirty_created ON recipe_recalc_dirty(created_at);

-- ========================================
-- TRIGGERS
-- ========================================

DROP TRIGGER IF EXISTS trg_recipes_updated_at ON recipes;
CREATE TRIGGER trg_recipes_updated_at
  BEFORE UPDATE ON recipes
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_recipe_ingredients_updated_at ON recipe_ingredients;
CREATE TRIGGER trg_recipe_ingredients_updated_at
  BEFORE UPDATE ON recipe_ingredients
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_recipe_unit_conversions_updated_at ON recipe_unit_conversions;
CREATE TRIGGER trg_recipe_unit_conversions_updated_at
  BEFORE UPDATE ON recipe_unit_conversions
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_restaurant_ingredient_costs_updated_at ON restaurant_ingredient_costs;
CREATE TRIGGER trg_restaurant_ingredient_costs_updated_at
  BEFORE UPDATE ON restaurant_ingredient_costs
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at_timestamp();

-- ========================================
-- PERMISSIONS
-- ========================================

INSERT INTO permission (code, name, domain, description) VALUES
  ('RECIPES_VIEW', 'View recipes', 'RECIPES', 'View recipe list, instructions, and builder'),
  ('RECIPES_VIEW_COSTS', 'View recipe costs', 'RECIPES', 'View food cost, margins, and supplier price impact'),
  ('RECIPES_EDIT', 'Edit recipes', 'RECIPES', 'Create and edit recipes and ingredients'),
  ('RECIPES_MANAGE', 'Manage recipes', 'RECIPES', 'Deactivate, duplicate, and bulk recalculate recipes')
ON CONFLICT (code) DO NOTHING;

-- ========================================
-- PLAN FEATURE (Gold+ restaurant tiers)
-- ========================================

UPDATE subscription_plan
SET
  features = COALESCE(features, '{}'::jsonb) || '{"recipe_costing": true}'::jsonb,
  updated_at = now()
WHERE code IN ('gold', 'platinum', 'enterprise')
  AND tenant_type = 'RESTAURANT'
  AND is_active = true
  AND NOT (COALESCE(features, '{}'::jsonb) ? 'recipe_costing');
