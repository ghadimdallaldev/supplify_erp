-- Migration: 0044_plan_catalog_by_tenant_type.sql
-- Split plan catalogs by tenant_type (RESTAURANT | SUPPLIER); normalize limit keys.
-- Same plan names (Free/Bronze/Gold/Platinum) exist as separate rows per tenant_type.

-- ========================================
-- 1) Add tenant_type to subscription_plan
-- ========================================
ALTER TABLE subscription_plan
  ADD COLUMN IF NOT EXISTS tenant_type TEXT CHECK (tenant_type IN ('RESTAURANT', 'SUPPLIER'));

UPDATE subscription_plan SET tenant_type = 'RESTAURANT' WHERE tenant_type IS NULL;

ALTER TABLE subscription_plan
  ALTER COLUMN tenant_type SET NOT NULL;

COMMENT ON COLUMN subscription_plan.tenant_type IS 'Plan catalog: RESTAURANT or SUPPLIER (same name can exist for both)';

-- ========================================
-- 2) Normalize limits: products -> restaurant_inventory_skus (RESTAURANT)
-- ========================================
UPDATE subscription_plan
SET limits = (limits - 'products') || jsonb_build_object('restaurant_inventory_skus', COALESCE(limits->'products', '0'))
WHERE tenant_type = 'RESTAURANT' AND limits ? 'products';

-- ========================================
-- 3) Drop old uniques; add UNIQUE(code, tenant_type)
-- ========================================
ALTER TABLE subscription_plan DROP CONSTRAINT IF EXISTS subscription_plan_name_key;
ALTER TABLE subscription_plan DROP CONSTRAINT IF EXISTS subscription_plan_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS subscription_plan_code_tenant_type_key
  ON subscription_plan (code, tenant_type);

-- ========================================
-- 4) Insert SUPPLIER plans (same names/codes, supplier limits)
-- ========================================
INSERT INTO subscription_plan (code, name, description, price_per_month, price_per_year, type, tenant_type, limits, features, trial_days, is_active, display_order)
SELECT
  code,
  name,
  description,
  price_per_month,
  price_per_year,
  type,
  'SUPPLIER',
  jsonb_build_object(
    'warehouses', COALESCE((limits->'warehouses')::text::int, 0),
    'users', COALESCE((limits->'users')::text::int, 1),
    'chats_per_day', COALESCE((limits->'chats_per_day')::text::int, 10),
    'storage_mb', COALESCE((limits->'storage_mb')::text::int, 100),
    'supplier_products_skus', COALESCE((limits->'restaurant_inventory_skus')::text::int, (limits->'products')::text::int, 50)
  ) || (limits - 'products' - 'restaurant_inventory_skus' - 'branches' - 'suppliers_per_restaurant' - 'orders_per_day' - 'restaurants'),
  features,
  trial_days,
  is_active,
  display_order + 100
FROM subscription_plan
WHERE tenant_type = 'RESTAURANT'
ON CONFLICT (code, tenant_type) DO NOTHING;

-- ========================================
-- 5) Point subscriptions to tenant_type-matching plan
-- ========================================
-- Point each subscription to the plan with same code that matches subscription.tenant_type
UPDATE subscription s
SET plan_id = (
  SELECT sp_new.id
  FROM subscription_plan sp_new
  JOIN subscription_plan sp_old ON sp_old.id = s.plan_id
  WHERE sp_new.code = sp_old.code
    AND sp_new.tenant_type = s.tenant_type
  LIMIT 1
)
WHERE s.plan_id IS NOT NULL;

-- ========================================
-- 6) usage_meter: products -> supplier_products_skus (SUPPLIER only)
-- ========================================
UPDATE usage_meter
SET meter_type = 'supplier_products_skus'
WHERE meter_type = 'products' AND tenant_type = 'SUPPLIER';

-- ========================================
-- 7) tenant_limit_override: products -> normalized keys
-- ========================================
UPDATE tenant_limit_override
SET limit_type = 'supplier_products_skus'
WHERE limit_type = 'products' AND tenant_type = 'SUPPLIER';

UPDATE tenant_limit_override
SET limit_type = 'restaurant_inventory_skus'
WHERE limit_type = 'products' AND tenant_type = 'RESTAURANT';
