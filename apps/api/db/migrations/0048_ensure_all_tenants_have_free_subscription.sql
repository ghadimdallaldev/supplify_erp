-- Migration: 0048_ensure_all_tenants_have_free_subscription.sql
-- Ensures every restaurant and supplier has at least an ACTIVE Free-tier subscription
-- so Settings/SubscriptionInfo and limit enforcement work everywhere.

-- ========================================
-- 1) Ensure Free plan exists for RESTAURANT (idempotent)
-- ========================================
INSERT INTO subscription_plan (code, name, description, price_per_month, price_per_year, type, tenant_type, limits, features, trial_days, is_active, display_order)
SELECT 'free', 'Free', 'Basic plan for small businesses', 0, 0, 'restaurant_and_supplier', 'RESTAURANT',
  '{"branches": 0, "users": 1, "orders_per_day": 3, "suppliers_per_restaurant": 1, "restaurant_inventory_skus": 15, "chats_per_day": 3, "storage_mb": 50}'::jsonb,
  '{"chat": true, "smart_reorder": false, "reports": false, "multi_branch": false}'::jsonb,
  0, true, 1
WHERE NOT EXISTS (SELECT 1 FROM subscription_plan WHERE code = 'free' AND tenant_type = 'RESTAURANT');

-- ========================================
-- 2) Ensure Free plan exists for SUPPLIER (idempotent)
-- ========================================
INSERT INTO subscription_plan (code, name, description, price_per_month, price_per_year, type, tenant_type, limits, features, trial_days, is_active, display_order)
SELECT 'free', 'Free', 'Basic plan for small businesses', 0, 0, 'restaurant_and_supplier', 'SUPPLIER',
  '{"warehouses": 0, "users": 1, "supplier_products_skus": 15, "chats_per_day": 3, "storage_mb": 50}'::jsonb,
  '{"chat": true, "smart_reorder": false, "reports": false}'::jsonb,
  0, true, 101
WHERE NOT EXISTS (SELECT 1 FROM subscription_plan WHERE code = 'free' AND tenant_type = 'SUPPLIER');

-- ========================================
-- 3) Assign Free subscription to every restaurant that has none
-- ========================================
INSERT INTO subscription (tenant_id, tenant_type, plan_id, plan_name, status, billing_cycle, current_period_start, current_period_end)
SELECT r.id, 'RESTAURANT', sp.id, sp.name, 'ACTIVE', 'MONTHLY', now(), now() + INTERVAL '1 month'
FROM restaurant r
JOIN (SELECT id, name FROM subscription_plan WHERE code = 'free' AND tenant_type = 'RESTAURANT' AND is_active = true LIMIT 1) sp ON true
WHERE NOT EXISTS (
  SELECT 1 FROM subscription s
  WHERE s.tenant_id = r.id AND s.tenant_type = 'RESTAURANT' AND s.status IN ('TRIALING', 'ACTIVE')
);

-- ========================================
-- 4) Assign Free subscription to every supplier that has none
-- ========================================
INSERT INTO subscription (tenant_id, tenant_type, plan_id, plan_name, status, billing_cycle, current_period_start, current_period_end)
SELECT s.id, 'SUPPLIER', sp.id, sp.name, 'ACTIVE', 'MONTHLY', now(), now() + INTERVAL '1 month'
FROM supplier s
JOIN (SELECT id, name FROM subscription_plan WHERE code = 'free' AND tenant_type = 'SUPPLIER' AND is_active = true LIMIT 1) sp ON true
WHERE NOT EXISTS (
  SELECT 1 FROM subscription sub
  WHERE sub.tenant_id = s.id AND sub.tenant_type = 'SUPPLIER' AND sub.status IN ('TRIALING', 'ACTIVE')
);

COMMENT ON TABLE subscription IS 'Active subscriptions linking tenants to plans; every tenant must have at least one ACTIVE/TRIALING row (default: Free).';
