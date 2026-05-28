-- Migration: 0121_branch_warehouse_plan_limits.sql
-- Update branch/warehouse included limits only (Gold + Platinum). Pricing and other limits unchanged.

-- Restaurant Gold: 2 branches (was 3 in 0119)
UPDATE subscription_plan
SET
  limits = limits || '{"branches": 2}'::jsonb,
  updated_at = now()
WHERE code = 'gold'
  AND tenant_type = 'RESTAURANT'
  AND is_active = true;

-- Restaurant Platinum: 3 branches (was unlimited -1 in 0120)
UPDATE subscription_plan
SET
  limits = limits || '{"branches": 3}'::jsonb,
  updated_at = now()
WHERE code = 'platinum'
  AND tenant_type = 'RESTAURANT'
  AND is_active = true;

-- Supplier Gold: 2 branches (was 3 in 0119); warehouses stay 3
UPDATE subscription_plan
SET
  limits = limits || '{"branches": 2}'::jsonb,
  updated_at = now()
WHERE code = 'gold'
  AND tenant_type = 'SUPPLIER'
  AND is_active = true;

-- Supplier Platinum: 3 branches, 5 warehouses (was unlimited)
UPDATE subscription_plan
SET
  limits = limits || '{"branches": 3, "warehouses": 5}'::jsonb,
  updated_at = now()
WHERE code = 'platinum'
  AND tenant_type = 'SUPPLIER'
  AND is_active = true;

COMMENT ON COLUMN subscription_plan.limits IS
  'JSONB limits; branches = org location accounts; warehouses = supplier fulfillment locations (supplier plans only). -1 = unlimited where still used.';
