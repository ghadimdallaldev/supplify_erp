-- Migration: 0145_plan_catalog_audit_sync.sql
-- Plan catalog audit sync: Free=Gold features, audit-spec limits, revert 0121 branch/warehouse caps.

-- 1. Re-sync Free features from Gold (0112 pattern; 0119 left Free stale)
UPDATE subscription_plan sp_free
SET
  features = sp_gold.features,
  updated_at = now()
FROM subscription_plan sp_gold
WHERE sp_free.code = 'free'
  AND sp_free.tenant_type = 'RESTAURANT'
  AND sp_gold.code = 'gold'
  AND sp_gold.tenant_type = 'RESTAURANT';

UPDATE subscription_plan sp_free
SET
  features = sp_gold.features,
  updated_at = now()
FROM subscription_plan sp_gold
WHERE sp_free.code = 'free'
  AND sp_free.tenant_type = 'SUPPLIER'
  AND sp_gold.code = 'gold'
  AND sp_gold.tenant_type = 'SUPPLIER';

-- 2. Product-removed feature key stays off
UPDATE subscription_plan
SET
  features = COALESCE(features, '{}'::jsonb) || '{"approvals_budgets": false}'::jsonb,
  updated_at = now()
WHERE tenant_type IN ('RESTAURANT', 'SUPPLIER');

-- 3. Restaurant waste_tracking tier string (0115 intent)
UPDATE subscription_plan
SET
  features = COALESCE(features, '{}'::jsonb) || '{"waste_tracking": "analytics_dashboard"}'::jsonb,
  updated_at = now()
WHERE tenant_type = 'RESTAURANT'
  AND lower(code) IN ('free', 'silver', 'gold', 'platinum');

-- 4. Free-tier limits (0101: chats_per_day 3; sandbox caps otherwise per audit)
UPDATE subscription_plan
SET
  limits = '{
    "branches": 1,
    "users": 1,
    "orders_per_day": 3,
    "suppliers_per_restaurant": 1,
    "restaurant_inventory_skus": 10,
    "chats_per_day": 3,
    "open_conversations": 1,
    "storage_mb": 50,
    "quick_lists": 1,
    "quick_list_items": 1,
    "scheduled_quick_lists": 1,
    "deal_redemptions_per_day": 1,
    "scheduled_order_grace_per_day": 1
  }'::jsonb,
  updated_at = now()
WHERE code = 'free'
  AND tenant_type = 'RESTAURANT'
  AND is_active = true;

UPDATE subscription_plan
SET
  limits = '{
    "branches": 1,
    "warehouses": 0,
    "users": 1,
    "supplier_products_skus": 10,
    "chats_per_day": 3,
    "open_conversations": 1,
    "storage_mb": 50,
    "promotions": 1
  }'::jsonb,
  updated_at = now()
WHERE code = 'free'
  AND tenant_type = 'SUPPLIER'
  AND is_active = true;

-- 5. Revert 0121 branch/warehouse caps to audit spec (Gold branches=3, Platinum unlimited)
UPDATE subscription_plan
SET
  limits = limits || '{"branches": 3}'::jsonb,
  updated_at = now()
WHERE code = 'gold'
  AND tenant_type IN ('RESTAURANT', 'SUPPLIER')
  AND is_active = true;

UPDATE subscription_plan
SET
  limits = limits || '{"branches": -1}'::jsonb,
  updated_at = now()
WHERE code = 'platinum'
  AND tenant_type IN ('RESTAURANT', 'SUPPLIER')
  AND is_active = true;

UPDATE subscription_plan
SET
  limits = limits || '{"warehouses": -1}'::jsonb,
  updated_at = now()
WHERE code = 'platinum'
  AND tenant_type = 'SUPPLIER'
  AND is_active = true;

-- 6. Ensure supplier paid tiers retain finance_invoices (0144; idempotent)
UPDATE subscription_plan
SET
  features = COALESCE(features, '{}'::jsonb) || '{"finance_invoices": "record_payments"}'::jsonb,
  updated_at = now()
WHERE code = 'silver'
  AND tenant_type = 'SUPPLIER'
  AND is_active = true
  AND NOT (COALESCE(features, '{}'::jsonb) ? 'finance_invoices');

UPDATE subscription_plan
SET
  features = COALESCE(features, '{}'::jsonb) || '{"finance_invoices": "expense_analytics"}'::jsonb,
  updated_at = now()
WHERE code = 'gold'
  AND tenant_type = 'SUPPLIER'
  AND is_active = true
  AND NOT (COALESCE(features, '{}'::jsonb) ? 'finance_invoices');

UPDATE subscription_plan
SET
  features = COALESCE(features, '{}'::jsonb) || '{"finance_invoices": "advanced_finance_dashboard"}'::jsonb,
  updated_at = now()
WHERE code = 'platinum'
  AND tenant_type = 'SUPPLIER'
  AND is_active = true
  AND NOT (COALESCE(features, '{}'::jsonb) ? 'finance_invoices');
